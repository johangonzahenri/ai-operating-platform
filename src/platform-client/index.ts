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
  AgentCoordinationDTO,
  RequestCoordinationRequestDTO,
  CoordinationExecutionResponseDTO,
  AgentProfileDTO,
  AgentCapabilityDTO,
  CreateAgentProfileRequestDTO,
  UpdateAgentProfileRequestDTO,
  AddCapabilityRequestDTO,
  VerifyCapabilityRequestDTO,
  AgentDiscoveryCriteriaDTO,
  WorkflowStepDefinitionDTO,
  WorkflowDefinitionDTO,
  CreateWorkflowDefinitionRequestDTO,
  UpdateWorkflowDefinitionRequestDTO,
  WorkflowStepStateDTO,
  WorkflowInstanceDTO,
  StartWorkflowRequestDTO,
  AdvanceWorkflowResultDTO,
  WorkflowStepVerificationRuleDTO,
  VerificationResultDTO,
  VerifyStepRequestDTO,
  ApprovalAuthorityDTO,
  ApprovalRequestDTO,
  CreateApprovalRequestDTO,
  StartReviewRequestDTO,
  DecideApprovalRequestDTO,
  EscalateApprovalRequestDTO,
  CancelApprovalRequestDTO,
  AgentLifecycleDTO,
  AgentEvaluationDTO,
  CreateAgentEvaluationRequestDTO,
  CompleteAgentEvaluationRequestDTO,
  TransitionLifecycleRequestDTO,
  AgentEligibilityDTO,
  SolutionBlueprintDTO,
  SolutionValidationReportDTO,
  AISolutionDTO,
  SolutionInstanceDTO,
  CreateSolutionRequestDTO,
  UpdateSolutionRequestDTO,
  PublishSolutionRequestDTO,
  InstantiateSolutionRequestDTO,
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
    async analytics(id: string): Promise<import("../platform/api/platform-dto.js").ApplicationAnalyticsDTO> {
      return request<import("../platform/api/platform-dto.js").ApplicationAnalyticsDTO>(`/applications/${encodeURIComponent(id)}/analytics`);
    },
    async updateLifecycle(
      id: string,
      state: "DRAFT" | "VALIDATED" | "REGISTERED" | "CONNECTED" | "OPERATIONAL" | "SUSPENDED" | "RETIRED",
      reason?: string
    ): Promise<ApplicationDTO> {
      return request<ApplicationDTO>(`/applications/${encodeURIComponent(id)}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({ state, reason }),
      });
    },
  };

  const factory = {
    async generate(input: unknown): Promise<import("../application/factory/application-generator.js").GeneratedApplicationResult> {
      return request<import("../application/factory/application-generator.js").GeneratedApplicationResult>("/factory/generate", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async validate(manifest: unknown, tenantId?: string): Promise<{
      readonly validation: import("../domain/application/application-contract.js").ApplicationValidationResult;
      readonly entitlement?: import("../application/factory/application-generator.js").CapabilityEntitlementResult;
      readonly harness?: import("../application/factory/application-generator.js").ApplicationHarnessResult;
    }> {
      return request("/factory/validate", {
        method: "POST",
        body: JSON.stringify({ manifest, tenantId }),
      });
    },
    async register(manifest: unknown, tenantId: string): Promise<ApplicationDTO> {
      return request<ApplicationDTO>("/factory/register", {
        method: "POST",
        body: JSON.stringify({ manifest, tenantId }),
      });
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
    stream(criteria?: {
      readonly tenantId?: string | undefined;
      readonly agentId?: string | undefined;
      readonly executionId?: string | undefined;
      readonly traceId?: string | undefined;
      readonly eventType?: string | undefined;
      readonly lastEventId?: number | undefined;
    }, callbacks?: {
      readonly onEvent?: (event: { readonly id?: string | undefined; readonly event?: string | undefined; readonly data: unknown }) => void;
      readonly onError?: (err: unknown) => void;
      readonly onOpen?: () => void;
    }): { readonly close: () => void } {
      const params = new URLSearchParams();
      if (options.apiKey) params.set("apiKey", options.apiKey);
      if (options.bearerToken) params.set("token", options.bearerToken);
      if (criteria?.tenantId) params.set("tenantId", criteria.tenantId);
      if (criteria?.agentId) params.set("agentId", criteria.agentId);
      if (criteria?.executionId) params.set("executionId", criteria.executionId);
      if (criteria?.traceId) params.set("traceId", criteria.traceId);
      if (criteria?.eventType) params.set("eventType", criteria.eventType);
      if (criteria?.lastEventId !== undefined) params.set("lastEventId", String(criteria.lastEventId));

      const qs = params.toString();
      const url = joinUrl(baseUrl, apiPrefix, `/events/stream${qs ? `?${qs}` : ""}`);
      let aborted = false;
      const ac = new AbortController();

      (async () => {
        try {
          const res = await fetchImpl(url, {
            headers: {
              Accept: "text/event-stream",
              ...(options.apiKey ? { "X-API-Key": options.apiKey } : {}),
              ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
              ...(criteria?.lastEventId !== undefined ? { "Last-Event-ID": String(criteria.lastEventId) } : {}),
            },
            signal: ac.signal,
          });

          if (!res.ok) {
            const err = new Error(`Event stream connection failed: HTTP ${res.status}`);
            callbacks?.onError?.(err);
            return;
          }

          callbacks?.onOpen?.();

          if (!res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";

            for (const part of parts) {
              const lines = part.split("\n");
              let currentId: string | undefined;
              let currentEvent: string | undefined;
              let currentDataStr = "";

              for (const line of lines) {
                if (line.startsWith("id: ")) {
                  currentId = line.substring(4).trim();
                } else if (line.startsWith("event: ")) {
                  currentEvent = line.substring(7).trim();
                } else if (line.startsWith("data: ")) {
                  currentDataStr = line.substring(6).trim();
                }
              }

              if (currentDataStr) {
                try {
                  const data = JSON.parse(currentDataStr);
                  callbacks?.onEvent?.({ id: currentId, event: currentEvent, data });
                } catch {
                  callbacks?.onEvent?.({ id: currentId, event: currentEvent, data: currentDataStr });
                }
              }
            }
          }
        } catch (err) {
          if (!aborted) {
            callbacks?.onError?.(err);
          }
        }
      })();

      const workflows = {
    async createDefinition(body: CreateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>("/workflows", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async listDefinitions(): Promise<readonly WorkflowDefinitionDTO[]> {
      return request<readonly WorkflowDefinitionDTO[]>("/workflows");
    },
    async getDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}`);
    },
    async updateDefinition(id: string, body: UpdateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    async activateDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}/activate`, {
        method: "POST",
      });
    },
    async archiveDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}/archive`, {
        method: "POST",
      });
    },
    async deleteDefinition(id: string): Promise<{ ok: boolean; id: string; deleted: boolean }> {
      return request<{ ok: boolean; id: string; deleted: boolean }>(`/workflows/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async start(definitionId: string, options?: { initiatedBy?: string; initialInput?: Record<string, unknown>; autoAdvance?: boolean }): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(`/workflows/${encodeURIComponent(definitionId)}/start`, {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },
    async listInstances(definitionId?: string): Promise<readonly WorkflowInstanceDTO[]> {
      if (definitionId) {
        return request<readonly WorkflowInstanceDTO[]>(`/workflows/${encodeURIComponent(definitionId)}/instances`);
      }
      return request<readonly WorkflowInstanceDTO[]>("/workflows/instances");
    },
    async getInstance(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}`);
    },
    async advance(instanceId: string): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/advance`, {
        method: "POST",
      });
    },
    async pause(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/pause`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    async resume(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/resume`, {
        method: "POST",
      });
    },
    async cancel(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
  };

  return {
        close: () => {
          aborted = true;
          ac.abort();
        },
      };
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

  const devices = {
    async list(options?: { readonly tenantId?: string; readonly type?: string; readonly status?: string }): Promise<{ readonly data: readonly any[]; readonly count: number }> {
      const params = new URLSearchParams();
      if (options?.tenantId) params.set("tenantId", options.tenantId);
      if (options?.type) params.set("type", options.type);
      if (options?.status) params.set("status", options.status);
      const qs = params.toString();
      return request<{ readonly data: readonly any[]; readonly count: number }>(qs ? `/devices?${qs}` : "/devices");
    },
    async get(id: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}`);
    },
    async register(deviceData: any): Promise<any> {
      return request<any>("/devices", {
        method: "POST",
        body: JSON.stringify(deviceData),
      });
    },
    async update(id: string, patch: any): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },
    async unregister(id: string): Promise<{ readonly success: boolean; readonly message: string }> {
      return request<{ readonly success: boolean; readonly message: string }>(`/devices/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async health(id: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}/health`);
    },
    async capabilities(id: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}/capabilities`);
    },
    async status(id: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}/status`);
    },
    async consumables(id: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(id)}/consumables`);
    },
  };

  const printing = {
    async submit(deviceId: string, jobInput: any, idempotencyKey?: string): Promise<any> {
      const headers: Record<string, string> = {};
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      return request<any>(`/devices/${encodeURIComponent(deviceId)}/print-jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(jobInput),
      });
    },
    async list(deviceId: string): Promise<{ readonly data: readonly any[]; readonly count: number }> {
      return request<{ readonly data: readonly any[]; readonly count: number }>(`/devices/${encodeURIComponent(deviceId)}/print-jobs`);
    },
    async get(deviceId: string, jobId: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(deviceId)}/print-jobs/${encodeURIComponent(jobId)}`);
    },
    async cancel(deviceId: string, jobId: string, reason?: string): Promise<any> {
      return request<any>(`/devices/${encodeURIComponent(deviceId)}/print-jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
  };

  const observability = {
    async metrics(): Promise<any> {
      return request<any>("/observability/metrics");
    },
    async logs(options?: { readonly limit?: number; readonly level?: string }): Promise<any> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.level) params.set("level", options.level);
      const qs = params.toString();
      return request<any>(qs ? `/observability/logs?${qs}` : "/observability/logs");
    },
    async dependencies(): Promise<readonly any[]> {
      return request<readonly any[]>("/observability/dependencies");
    },
    async diagnostics(): Promise<any> {
      return request<any>("/diagnostics");
    },
    async liveness(): Promise<any> {
      return request<any>("/health/live");
    },
    async readiness(): Promise<any> {
      return request<any>("/health/ready");
    },
  };

  const documents = {
    async generate(input: {
      readonly type: string;
      readonly title: string;
      readonly content: any;
      readonly tenantId?: string;
      readonly metadata?: Record<string, unknown>;
    }): Promise<any> {
      return request<any>("/documents/generate", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  };

  const coordinations = {
    async requestTeamCoordination(teamId: string, input: RequestCoordinationRequestDTO): Promise<CoordinationExecutionResponseDTO> {
      return request<CoordinationExecutionResponseDTO>(`/teams/${encodeURIComponent(teamId)}/coordinations`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async listTeamCoordinations(teamId: string, options?: { limit?: number; offset?: number }): Promise<readonly AgentCoordinationDTO[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      const qs = params.toString();
      return request<readonly AgentCoordinationDTO[]>(`/teams/${encodeURIComponent(teamId)}/coordinations${qs ? `?${qs}` : ""}`);
    },
    async getCoordination(id: string): Promise<AgentCoordinationDTO> {
      return request<AgentCoordinationDTO>(`/coordinations/${encodeURIComponent(id)}`);
    },
  };

  const agentProfiles = {
    async get(agentId: string): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/profile`);
    },
    async create(agentId: string, input: CreateAgentProfileRequestDTO): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/profile`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async update(agentId: string, input: UpdateAgentProfileRequestDTO): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/profile`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    async addCapability(agentId: string, input: AddCapabilityRequestDTO): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/capabilities`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async removeCapability(agentId: string, capabilityId: string, expectedVersion?: number): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}`, {
        method: "DELETE",
        ...(expectedVersion !== undefined ? { body: JSON.stringify({ expectedVersion }) } : {}),
      });
    },
    async verifyCapability(agentId: string, capabilityId: string, input?: VerifyCapabilityRequestDTO): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}/verify`, {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      });
    },
    async disableCapability(agentId: string, capabilityId: string, expectedVersion?: number): Promise<AgentProfileDTO> {
      return request<AgentProfileDTO>(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}/disable`, {
        method: "POST",
        ...(expectedVersion !== undefined ? { body: JSON.stringify({ expectedVersion }) } : {}),
      });
    },
    async discover(criteria: AgentDiscoveryCriteriaDTO): Promise<readonly AgentProfileDTO[]> {
      return request<readonly AgentProfileDTO[]>("/agents/discover", {
        method: "POST",
        body: JSON.stringify(criteria),
      });
    },
  };

  const workflows = {
    async createDefinition(body: CreateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>("/workflows", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async listDefinitions(): Promise<readonly WorkflowDefinitionDTO[]> {
      return request<readonly WorkflowDefinitionDTO[]>("/workflows");
    },
    async getDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}`);
    },
    async updateDefinition(id: string, body: UpdateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    async activateDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}/activate`, {
        method: "POST",
      });
    },
    async archiveDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(`/workflows/${encodeURIComponent(id)}/archive`, {
        method: "POST",
      });
    },
    async deleteDefinition(id: string): Promise<{ ok: boolean; id: string; deleted: boolean }> {
      return request<{ ok: boolean; id: string; deleted: boolean }>(`/workflows/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async start(definitionId: string, options?: { id?: string; initiatorId?: string; input?: Record<string, unknown>; correlationId?: string; autoAdvance?: boolean }): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(`/workflows/${encodeURIComponent(definitionId)}/start`, {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },
    async listInstances(definitionId?: string): Promise<readonly WorkflowInstanceDTO[]> {
      if (definitionId) {
        return request<readonly WorkflowInstanceDTO[]>(`/workflows/${encodeURIComponent(definitionId)}/instances`);
      }
      return request<readonly WorkflowInstanceDTO[]>("/workflows/instances");
    },
    async getInstance(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}`);
    },
    async advance(instanceId: string): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/advance`, {
        method: "POST",
      });
    },
    async pause(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/pause`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    async resume(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/resume`, {
        method: "POST",
      });
    },
    async cancel(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(`/workflows/instances/${encodeURIComponent(instanceId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
  };

  const verifications = {
    async verify(body: VerifyStepRequestDTO): Promise<VerificationResultDTO> {
      return request<VerificationResultDTO>("/verifications", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async list(options?: { limit?: number; offset?: number }): Promise<readonly VerificationResultDTO[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      const qs = params.toString();
      return request<readonly VerificationResultDTO[]>(`/verifications${qs ? `?${qs}` : ""}`);
    },
    async get(id: string): Promise<VerificationResultDTO> {
      return request<VerificationResultDTO>(`/verifications/${encodeURIComponent(id)}`);
    },
    async listByInstance(instanceId: string): Promise<readonly VerificationResultDTO[]> {
      return request<readonly VerificationResultDTO[]>(`/workflows/instances/${encodeURIComponent(instanceId)}/verifications`);
    },
    async listByExecution(executionId: string): Promise<readonly VerificationResultDTO[]> {
      return request<readonly VerificationResultDTO[]>(`/executions/${encodeURIComponent(executionId)}/verifications`);
    },
  };

  const approvals = {
    async request(body: CreateApprovalRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>("/approvals", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async list(options?: {
      limit?: number;
      offset?: number;
      status?: string;
      workflowInstanceId?: string;
      workflowStepId?: string;
    }): Promise<readonly ApprovalRequestDTO[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.status) params.set("status", options.status);
      if (options?.workflowInstanceId) params.set("workflowInstanceId", options.workflowInstanceId);
      if (options?.workflowStepId) params.set("workflowStepId", options.workflowStepId);
      const qs = params.toString();
      return request<readonly ApprovalRequestDTO[]>(`/approvals${qs ? `?${qs}` : ""}`);
    },
    async get(id: string): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}`);
    },
    async startReview(id: string, body?: StartReviewRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async approve(id: string, body?: DecideApprovalRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async reject(id: string, body: DecideApprovalRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async cancel(id: string, body?: CancelApprovalRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async escalate(id: string, body: EscalateApprovalRequestDTO): Promise<ApprovalRequestDTO> {
      return request<ApprovalRequestDTO>(`/approvals/${encodeURIComponent(id)}/escalate`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async listByInstance(instanceId: string): Promise<readonly ApprovalRequestDTO[]> {
      return request<readonly ApprovalRequestDTO[]>(`/workflows/instances/${encodeURIComponent(instanceId)}/approvals`);
    },
  };

  const agentLifecycle = {
    async get(agentId: string): Promise<AgentLifecycleDTO> {
      return request<AgentLifecycleDTO>(`/agents/${encodeURIComponent(agentId)}/lifecycle`);
    },
    async activate(agentId: string, body?: TransitionLifecycleRequestDTO): Promise<AgentLifecycleDTO> {
      return request<AgentLifecycleDTO>(`/agents/${encodeURIComponent(agentId)}/lifecycle/activate`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async suspend(agentId: string, body: TransitionLifecycleRequestDTO): Promise<AgentLifecycleDTO> {
      return request<AgentLifecycleDTO>(`/agents/${encodeURIComponent(agentId)}/lifecycle/suspend`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async revoke(agentId: string, body: TransitionLifecycleRequestDTO): Promise<AgentLifecycleDTO> {
      return request<AgentLifecycleDTO>(`/agents/${encodeURIComponent(agentId)}/lifecycle/revoke`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async deprecate(agentId: string, body: TransitionLifecycleRequestDTO): Promise<AgentLifecycleDTO> {
      return request<AgentLifecycleDTO>(`/agents/${encodeURIComponent(agentId)}/lifecycle/deprecate`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async checkEligibility(
      agentId: string,
      query?: { requiredCapability?: string; requireVerifiedCapability?: boolean }
    ): Promise<AgentEligibilityDTO> {
      const params = new URLSearchParams();
      if (query?.requiredCapability) params.set("requiredCapability", query.requiredCapability);
      if (query?.requireVerifiedCapability) params.set("requireVerifiedCapability", "true");
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<AgentEligibilityDTO>(`/agents/${encodeURIComponent(agentId)}/eligibility${qs}`);
    },
  };

  const agentEvaluations = {
    async create(agentId: string, body: CreateAgentEvaluationRequestDTO): Promise<AgentEvaluationDTO> {
      return request<AgentEvaluationDTO>(`/agents/${encodeURIComponent(agentId)}/evaluations`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async list(
      agentId: string,
      params?: { limit?: number; offset?: number }
    ): Promise<readonly AgentEvaluationDTO[]> {
      const sp = new URLSearchParams();
      if (params?.limit !== undefined) sp.set("limit", String(params.limit));
      if (params?.offset !== undefined) sp.set("offset", String(params.offset));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return request<readonly AgentEvaluationDTO[]>(`/agents/${encodeURIComponent(agentId)}/evaluations${qs}`);
    },
    async getLatest(agentId: string, type: string = "CAPABILITY_CHECK"): Promise<AgentEvaluationDTO> {
      return request<AgentEvaluationDTO>(`/agents/${encodeURIComponent(agentId)}/evaluations/latest?type=${encodeURIComponent(type)}`);
    },
  };

  const solutions = {
    async create(body: CreateSolutionRequestDTO): Promise<AISolutionDTO> {
      return request<AISolutionDTO>("/solutions", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async list(params?: {
      lifecycleState?: string;
      ownerPrincipalId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<readonly AISolutionDTO[]> {
      const sp = new URLSearchParams();
      if (params?.lifecycleState) sp.set("lifecycleState", params.lifecycleState);
      if (params?.ownerPrincipalId) sp.set("ownerPrincipalId", params.ownerPrincipalId);
      if (params?.search) sp.set("search", params.search);
      if (params?.limit !== undefined) sp.set("limit", String(params.limit));
      if (params?.offset !== undefined) sp.set("offset", String(params.offset));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return request<readonly AISolutionDTO[]>(`/solutions${qs}`);
    },
    async get(id: string): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}`);
    },
    async update(id: string, body: UpdateSolutionRequestDTO): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    async validate(
      id: string,
      body?: { version?: number; expectedConcurrencyVersion?: number }
    ): Promise<{ solution: AISolutionDTO; report: SolutionValidationReportDTO }> {
      return request<{ solution: AISolutionDTO; report: SolutionValidationReportDTO }>(
        `/solutions/${encodeURIComponent(id)}/validate`,
        {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        }
      );
    },
    async publish(id: string, body?: PublishSolutionRequestDTO): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async createVersion(id: string, body?: { newVersionNumber?: number }): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async listVersions(id: string): Promise<readonly AISolutionDTO[]> {
      return request<readonly AISolutionDTO[]>(`/solutions/${encodeURIComponent(id)}/versions`);
    },
    async getVersion(id: string, version: number): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}/versions/${version}`);
    },
    async getBlueprint(id: string): Promise<SolutionBlueprintDTO> {
      return request<SolutionBlueprintDTO>(`/solutions/${encodeURIComponent(id)}/blueprint`);
    },
    async archive(
      id: string,
      body?: { reason?: string; version?: number; expectedConcurrencyVersion?: number }
    ): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}/archive`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async deprecate(
      id: string,
      body?: { reason?: string; version?: number; expectedConcurrencyVersion?: number }
    ): Promise<AISolutionDTO> {
      return request<AISolutionDTO>(`/solutions/${encodeURIComponent(id)}/deprecate`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async instantiate(id: string, body?: InstantiateSolutionRequestDTO): Promise<SolutionInstanceDTO> {
      return request<SolutionInstanceDTO>(`/solutions/${encodeURIComponent(id)}/instantiate`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    async listInstances(id: string): Promise<readonly SolutionInstanceDTO[]> {
      return request<readonly SolutionInstanceDTO[]>(`/solutions/${encodeURIComponent(id)}/instances`);
    },
  };

  return {
    tasks,
    executions,
    agents,
    applications,
    factory,
    tenants,
    usage,
    capabilities,
    integrations,
    demo,
    events,
    platform,
    devices,
    printing,
    observability,
    documents,
    coordinations,
    agentProfiles,
    workflows,
    verifications,
    approvals,
    agentLifecycle,
    agentEvaluations,
    solutions,
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
  AgentCoordinationDTO,
  RequestCoordinationRequestDTO,
  CoordinationExecutionResponseDTO,
  AgentProfileDTO,
  AgentCapabilityDTO,
  CreateAgentProfileRequestDTO,
  UpdateAgentProfileRequestDTO,
  AddCapabilityRequestDTO,
  VerifyCapabilityRequestDTO,
  AgentDiscoveryCriteriaDTO,
  WorkflowStepDefinitionDTO,
  WorkflowDefinitionDTO,
  CreateWorkflowDefinitionRequestDTO,
  UpdateWorkflowDefinitionRequestDTO,
  WorkflowStepStateDTO,
  WorkflowInstanceDTO,
  StartWorkflowRequestDTO,
  AdvanceWorkflowResultDTO,
  WorkflowStepVerificationRuleDTO,
  VerificationResultDTO,
  VerifyStepRequestDTO,
  ApprovalAuthorityDTO,
  ApprovalRequestDTO,
  CreateApprovalRequestDTO,
  StartReviewRequestDTO,
  DecideApprovalRequestDTO,
  EscalateApprovalRequestDTO,
  CancelApprovalRequestDTO,
  AgentLifecycleDTO,
  AgentEvaluationDTO,
  CreateAgentEvaluationRequestDTO,
  CompleteAgentEvaluationRequestDTO,
  TransitionLifecycleRequestDTO,
  AgentEligibilityDTO,
  SolutionBlueprintDTO,
  SolutionValidationReportDTO,
  AISolutionDTO,
  SolutionInstanceDTO,
  CreateSolutionRequestDTO,
  UpdateSolutionRequestDTO,
  PublishSolutionRequestDTO,
  InstantiateSolutionRequestDTO,
};
