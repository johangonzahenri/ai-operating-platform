import { randomUUID } from "node:crypto";
import type {
  ApplicationDTO,
  DurableEventDTO,
  DurableEventListResponseDTO,
  ExecutionDTO,
  OperationDTO,
  OrchestrationRequestDTO,
  OrchestrationResultDTO,
  PlatformHealthDTO,
  PlatformMetadataDTO,
  SafeAgentMetadataDTO,
  TaskCancellationResultDTO,
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
  PlatformMetadataContract,
  SafeAgentMetadataContract,
  TaskCancellationContract,
  TaskContract,
} from "../platform/product/execution-contract.js";

export interface PlatformClientOptions {
  readonly baseUrl: string;
  readonly apiPrefix?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly bearerToken?: string | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly defaultHeaders?: Readonly<Record<string, string>> | undefined;
}

export interface CreateTaskInput {
  readonly agentId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly traceId?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  readonly idempotencyKey?: string | undefined;
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

    if (options.apiKey && !headers.has("Authorization") && !headers.has("X-API-Key")) {
      headers.set("X-API-Key", options.apiKey);
    }
    if (options.bearerToken && !headers.has("Authorization") && !headers.has("X-Agent-Token")) {
      headers.set("Authorization", `Bearer ${options.bearerToken}`);
    }

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
      const errObj = typeof body.error === "object" && body.error !== null ? body.error as Record<string, unknown> : undefined;
      const errorCode =
        typeof body.code === "string"
          ? body.code
          : typeof errObj?.code === "string"
          ? errObj.code
          : "PLATFORM_ERROR";
      const errorMessage =
        typeof body.error === "string"
          ? body.error
          : typeof errObj?.message === "string"
          ? errObj.message
          : `Platform request failed with HTTP ${response.status}`;

      throw new PlatformClientError({
        code: errorCode,
        message: errorMessage,
        status: response.status,
        details: body.details ?? payload,
        requestId: responseRequestId,
        traceId: typeof body.traceId === "string" ? body.traceId : undefined,
      });
    }

    // Unpack data from standard envelope if present
    if (typeof payload === "object" && payload !== null && "data" in payload && (payload as Record<string, unknown>).success === true) {
      return (payload as { data: T }).data;
    }
    return payload as T;
  }

  const tasks = {
    async create(input: CreateTaskInput): Promise<TaskContract> {
      const headers: Record<string, string> = {};
      if (input.idempotencyKey) {
        headers["Idempotency-Key"] = input.idempotencyKey;
      }
      const response = await request<{ task?: TaskDTO } | TaskDTO>("/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      const task = typeof response === "object" && response !== null && "task" in response && response.task
        ? response.task
        : response as TaskDTO;
      return toTaskDTO(task);
    },
    async get(taskId: string): Promise<TaskContract> {
      return toTaskDTO(await request<TaskDTO>(`/tasks/${encodeURIComponent(taskId)}`));
    },
    async cancel(taskId: string, reason?: string): Promise<TaskCancellationContract> {
      const init: RequestInit = { method: "POST" };
      if (reason !== undefined) {
        init.body = JSON.stringify({ reason });
      }
      return request<TaskCancellationResultDTO>(`/tasks/${encodeURIComponent(taskId)}/cancel`, init);
    },

    async events(taskId: string): Promise<readonly EventContract[]> {
      const response = await request<DurableEventListResponseDTO | readonly (DurableEventDTO | EventContract)[]>(
        `/tasks/${encodeURIComponent(taskId)}/events`
      );
      if (Array.isArray(response)) {
        return response.map((event) => "eventType" in event ? event : toEventDTO(event as DurableEventDTO));
      }
      if ("data" in response && Array.isArray(response.data)) {
        return response.data.map(toEventDTO);
      }
      return [];
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

  const agents = {
    async list(): Promise<readonly SafeAgentMetadataContract[]> {
      return request<readonly SafeAgentMetadataDTO[]>("/agents");
    },
  };

  const applications = {
    async list(): Promise<readonly ApplicationDTO[]> {
      return request<readonly ApplicationDTO[]>("/applications");
    },
    async get(id: string): Promise<ApplicationDTO> {
      return request<ApplicationDTO>(`/applications/${encodeURIComponent(id)}`);
    },
  };

  const tenants = {
    async list(): Promise<readonly import("../platform/api/platform-dto.js").TenantDTO[]> {
      return request<readonly import("../platform/api/platform-dto.js").TenantDTO[]>("/tenants");
    },
    async get(id: string): Promise<import("../platform/api/platform-dto.js").TenantDTO> {
      return request<import("../platform/api/platform-dto.js").TenantDTO>(`/tenants/${encodeURIComponent(id)}`);
    },
    async dashboard(id: string): Promise<import("../platform/api/platform-dto.js").TenantUsageDashboardDTO> {
      return request<import("../platform/api/platform-dto.js").TenantUsageDashboardDTO>(`/tenants/${encodeURIComponent(id)}/dashboard`);
    },
  };

  const usage = {
    async get(): Promise<import("../platform/api/platform-dto.js").GlobalUsageSummaryDTO> {
      return request<import("../platform/api/platform-dto.js").GlobalUsageSummaryDTO>("/usage");
    },
  };

  const capabilities = {
    async list(): Promise<readonly import("../domain/application/application-contract.js").PlatformCapabilityDefinition[]> {
      return request<readonly import("../domain/application/application-contract.js").PlatformCapabilityDefinition[]>("/capabilities");
    },
  };

  const events = {
    async list(query?: Record<string, string>): Promise<DurableEventListResponseDTO> {
      const q = query ? "?" + new URLSearchParams(query).toString() : "";
      return request<DurableEventListResponseDTO>(`/events${q}`);
    },
  };

  const integrations = {
    async list(): Promise<readonly import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord[]> {
      return request<readonly import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord[]>("/integrations");
    },
    async get(id: string): Promise<import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord> {
      return request<import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord>(`/integrations/${encodeURIComponent(id)}`);
    },
    async verify(id: string): Promise<import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord> {
      return request<import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord>(`/integrations/${encodeURIComponent(id)}/verify`, { method: "POST" });
    },
    async verifyAll(): Promise<readonly import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord[]> {
      return request<readonly import("../infrastructure/config/integration-truth-engine.js").IntegrationTruthRecord[]>("/integrations/verify-all", { method: "POST" });
    },
  };

  const demo = {
    async reset(): Promise<{
      readonly status: "RESET_COMPLETED";
      readonly timestamp: string;
      readonly resetEntities: readonly string[];
      readonly tenantId: string;
    }> {
      return request<{
        readonly status: "RESET_COMPLETED";
        readonly timestamp: string;
        readonly resetEntities: readonly string[];
        readonly tenantId: string;
      }>("/demo/reset", { method: "POST" });
    },
  };

  const healthGet = async (): Promise<HealthContract> => {
    return request<HealthContract>("/health");
  };

  const platform = {
    async get(): Promise<PlatformMetadataContract> {
      return request<PlatformMetadataContract>("/platform");
    },
  };

  return {
    tasks,
    executions,
    agents,
    applications,
    tenants,
    usage,
    capabilities,
    integrations,
    demo,
    events,
    platform,
    connect: () => healthGet(),
    health: Object.assign(healthGet, { get: healthGet }),
    getPlatformInfo: () => platform.get(),
    listAgents: () => agents.list(),
    listApplications: () => applications.list(),
    getApplication: (id: string) => applications.get(id),
    createTask: (input: CreateTaskInput) => tasks.create(input),
    getTask: (taskId: string) => tasks.get(taskId),
    cancelTask: (taskId: string, reason?: string) => tasks.cancel(taskId, reason),
    getTaskEvents: (taskId: string) => tasks.events(taskId),
    orchestrate: (req: OrchestrationRequestDTO): Promise<OrchestrationResultDTO> =>
      request<OrchestrationResultDTO>("/orchestrate", {
        method: "POST",
        body: JSON.stringify(req),
      }),
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
export type {
  ApplicationDTO,
  EventContract,
  ExecutionContract,
  HealthContract,
  OperationDTO,
  OrchestrationRequestDTO,
  OrchestrationResultDTO,
  PlatformMetadataContract,
  SafeAgentMetadataContract,
  TaskCancellationContract,
  TaskContract,
};



