import { randomUUID } from "node:crypto";
import type {
  DurableEventListResponseDTO,
  ExecutionDTO,
  PlatformHealthDTO,
  TaskDTO,
} from "../platform/api/platform-dto.js";
import {
  toEventDTO,
  toExecutionDTO,
  toHealthDTO,
  toTaskDTO,
} from "../platform/product/execution-contract.js";
import type {
  EventContract,
  ExecutionContract,
  HealthContract,
  TaskContract,
} from "../platform/product/execution-contract.js";

export interface PlatformClientOptions {
  readonly baseUrl: string;
  readonly apiPrefix?: string | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly defaultHeaders?: Readonly<Record<string, string>> | undefined;
}

export interface CreateTaskInput {
  readonly agentId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly traceId?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export class PlatformClientError extends Error {
  readonly code: string;
  readonly status?: number | undefined;
  readonly details?: unknown;
  readonly requestId?: string | undefined;
  readonly traceId?: string | undefined;

  constructor(options: {
    readonly code: string;
    readonly message: string;
    readonly status?: number | undefined;
    readonly details?: unknown;
    readonly requestId?: string | undefined;
    readonly traceId?: string | undefined;
  }) {
    super(options.message);
    this.name = "PlatformClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
    this.traceId = options.traceId;
  }
}

function joinUrl(baseUrl: string, apiPrefix: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${apiPrefix.replace(/^\/|\/$/g, "")}/${path.replace(/^\//, "")}`;
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const apiPrefix = options.apiPrefix ?? "/api/v1";
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const requestId = randomUUID();
    const headers = new Headers(options.defaultHeaders);
    headers.set("Accept", "application/json");
    headers.set("X-Request-Id", requestId);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    Object.entries(init.headers ?? {}).forEach(([key, value]) => headers.set(key, String(value)));
    let response: Response;
    try {
      response = await fetchImpl(joinUrl(baseUrl, apiPrefix, path), { ...init, headers });
    } catch (cause) {
      throw new PlatformClientError({
        code: "NETWORK_ERROR",
        message: cause instanceof Error ? cause.message : "Platform request failed",
        details: cause,
        requestId,
      });
    }
    const responseRequestId = response.headers.get("x-request-id") ?? requestId;
    const raw = await response.text();
    let payload: unknown = undefined;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    if (!response.ok) {
      const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
      throw new PlatformClientError({
        code: typeof body.code === "string" ? body.code : "PLATFORM_ERROR",
        message: typeof body.error === "string" ? body.error : `Platform request failed with HTTP ${response.status}`,
        status: response.status,
        details: body.details ?? payload,
        requestId: responseRequestId,
        traceId: typeof body.traceId === "string" ? body.traceId : undefined,
      });
    }
    return payload as T;
  }

  const tasks = {
    async create(input: CreateTaskInput): Promise<TaskContract> {
      const response = await request<{ task?: TaskDTO } | TaskDTO>("/tasks", { method: "POST", body: JSON.stringify(input) });
      const task = typeof response === "object" && response !== null && "task" in response && response.task
        ? response.task
        : response as TaskDTO;
      return toTaskDTO(task);
    },
    async get(taskId: string): Promise<TaskContract> {
      return toTaskDTO(await request<TaskDTO>(`/tasks/${encodeURIComponent(taskId)}`));
    },
    async execute(taskId: string): Promise<ExecutionContract> {
      return toExecutionDTO(await request<ExecutionDTO>(`/tasks/${encodeURIComponent(taskId)}/execute`, { method: "POST" }));
    },
  };
  const executions = {
    async get(executionId: string): Promise<ExecutionContract> {
      return toExecutionDTO(await request<ExecutionDTO>(`/executions/${encodeURIComponent(executionId)}`));
    },
    async events(executionId: string): Promise<readonly EventContract[]> {
      const response = await request<DurableEventListResponseDTO | readonly EventContract[]>(`/executions/${encodeURIComponent(executionId)}/events`);
      if (Array.isArray(response)) return response.map((event) => "eventType" in event ? event : toEventDTO(event as never));
      if ("data" in response) return response.data.map(toEventDTO);
      return [];
    },
  };
  return {
    tasks,
    executions,
    health: { get: async (): Promise<HealthContract> => toHealthDTO(await request<PlatformHealthDTO>("/health")) },
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
export type { EventContract, ExecutionContract, HealthContract, TaskContract };
