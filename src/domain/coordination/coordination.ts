import crypto from "node:crypto";
import { Agent, AgentNotFoundError, AgentInactiveError } from "../agent/agent.js";
import { BoundedDataLimits, DEFAULT_BOUNDED_DATA_LIMITS, deepFreeze, sanitizeBoundedValue, validateBoundedDataLimits } from "../context/bounded-data.js";

export type CoordinationStatus = "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL" | "CANCELLED" | "TIMEOUT" | "POLICY_DENIED";
export type HandoffStatus = "REQUESTED" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "FAILED";

export interface CoordinationStep {
  readonly agentId: string;
  readonly role: "DIAGNOSTIC" | "DECISION" | "EXECUTION" | "VERIFICATION" | string;
  readonly required?: boolean;
}

export interface CoordinationRequestProps {
  readonly coordinationId?: string;
  readonly correlationId?: string;
  readonly taskId: string;
  readonly objective: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly steps: readonly CoordinationStep[];
  readonly maxHandoffs?: number;
  readonly timeoutMs?: number;
}

export interface CoordinationLimits {
  readonly maxAgents: number;
  readonly maxHandoffs: number;
  readonly maxDepth: number;
  readonly data: BoundedDataLimits;
}

export const DEFAULT_COORDINATION_LIMITS: Readonly<CoordinationLimits> = Object.freeze({
  maxAgents: 4,
  maxHandoffs: 3,
  maxDepth: 1,
  data: DEFAULT_BOUNDED_DATA_LIMITS,
});

export class CoordinationValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CoordinationValidationError"; }
}

export class CoordinationSelectionError extends Error {
  constructor(message: string) { super(message); this.name = "CoordinationSelectionError"; }
}

export interface AgentHandoffProps {
  readonly handoffId?: string;
  readonly correlationId: string;
  readonly taskId: string;
  readonly executionId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly objective: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly status?: HandoffStatus;
  readonly failure?: Readonly<{ code: string; message: string }>;
  readonly createdAt?: Date;
  readonly completedAt?: Date;
}

export class AgentHandoff {
  readonly handoffId!: string;
  readonly correlationId!: string;
  readonly taskId!: string;
  readonly executionId!: string;
  readonly sourceAgentId!: string;
  readonly targetAgentId!: string;
  readonly objective!: string;
  readonly payload!: Readonly<Record<string, unknown>>;
  readonly metadata!: Readonly<Record<string, unknown>>;
  readonly status!: HandoffStatus;
  readonly failure?: Readonly<{ code: string; message: string }>;
  readonly createdAt!: Date;
  readonly completedAt?: Date;

  private constructor(props: AgentHandoff) { Object.assign(this, props); Object.freeze(this); }

  static create(props: AgentHandoffProps, limits: CoordinationLimits = DEFAULT_COORDINATION_LIMITS): AgentHandoff {
    validateBoundedDataLimits(limits.data);
    for (const [name, value] of [["correlationId", props.correlationId], ["taskId", props.taskId], ["executionId", props.executionId], ["sourceAgentId", props.sourceAgentId], ["targetAgentId", props.targetAgentId], ["objective", props.objective]] as const) {
      if (typeof value !== "string" || value.trim() === "") throw new CoordinationValidationError(`Handoff ${name} must be non-empty`);
    }
    if (props.sourceAgentId === props.targetAgentId) throw new CoordinationValidationError("Handoff source and target agents must differ");
    if (!props.payload || typeof props.payload !== "object" || Array.isArray(props.payload)) throw new CoordinationValidationError("Handoff payload must be an object");
    const state = { truncated: false };
    const payload = deepFreeze(sanitizeBoundedValue(props.payload, limits.data, 0, state) as Readonly<Record<string, unknown>>);
    const metadata = deepFreeze(sanitizeBoundedValue(props.metadata ?? {}, limits.data, 0, state) as Readonly<Record<string, unknown>>);
    return new AgentHandoff({
      handoffId: props.handoffId?.trim() || crypto.randomUUID(),
      correlationId: props.correlationId.trim(), taskId: props.taskId.trim(), executionId: props.executionId.trim(),
      sourceAgentId: props.sourceAgentId.trim(), targetAgentId: props.targetAgentId.trim(), objective: props.objective.trim(),
      payload, metadata, status: props.status ?? "REQUESTED", ...(props.failure ? { failure: deepFreeze({ ...props.failure }) } : {}),
      createdAt: new Date(props.createdAt?.getTime() ?? Date.now()), ...(props.completedAt ? { completedAt: new Date(props.completedAt.getTime()) } : {}),
    });
  }
}

export class CoordinationRequest {
  readonly coordinationId!: string; readonly correlationId!: string; readonly taskId!: string; readonly objective!: string;
  readonly input!: Readonly<Record<string, unknown>>; readonly steps!: readonly CoordinationStep[]; readonly maxHandoffs!: number; readonly timeoutMs!: number;
  private constructor(props: CoordinationRequest) { Object.assign(this, props); Object.freeze(this); }
  static create(props: CoordinationRequestProps, limits: CoordinationLimits = DEFAULT_COORDINATION_LIMITS): CoordinationRequest {
    if (!props || typeof props.taskId !== "string" || !props.taskId.trim() || typeof props.objective !== "string" || !props.objective.trim()) throw new CoordinationValidationError("Coordination requires taskId and objective");
    if (!Array.isArray(props.steps) || props.steps.length < 2 || props.steps.length > limits.maxAgents) throw new CoordinationValidationError(`Coordination requires between 2 and ${limits.maxAgents} steps`);
    if (props.steps.some((step) => !step?.agentId?.trim() || !step.role?.trim())) throw new CoordinationValidationError("Every coordination step requires agentId and role");
    const ids = new Set(props.steps.map((step) => step.agentId.trim()));
    if (ids.size !== props.steps.length) throw new CoordinationValidationError("Coordination cannot repeat an agent");
    if (!props.input || typeof props.input !== "object" || Array.isArray(props.input)) throw new CoordinationValidationError("Coordination input must be an object");
    const state = { truncated: false };
    const input = deepFreeze(sanitizeBoundedValue(props.input, limits.data, 0, state) as Readonly<Record<string, unknown>>);
    const maxHandoffs = props.maxHandoffs ?? props.steps.length - 1;
    if (!Number.isInteger(maxHandoffs) || maxHandoffs < props.steps.length - 1 || maxHandoffs > limits.maxHandoffs) throw new CoordinationValidationError("Invalid coordination handoff budget");
    const timeoutMs = props.timeoutMs ?? 30000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new CoordinationValidationError("Coordination timeout must be positive");
    return new CoordinationRequest({
      coordinationId: props.coordinationId?.trim() || crypto.randomUUID(), correlationId: props.correlationId?.trim() || crypto.randomUUID(),
      taskId: props.taskId.trim(), objective: props.objective.trim(), input,
      steps: Object.freeze(props.steps.map((step) => Object.freeze({ agentId: step.agentId.trim(), role: step.role.trim(), required: step.required !== false }))),
      maxHandoffs, timeoutMs,
    });
  }
}

export interface CoordinationResult {
  readonly coordinationId: string;
  readonly correlationId: string;
  readonly taskId: string;
  readonly status: CoordinationStatus;
  readonly steps: readonly Readonly<{ agentId: string; role: string; status: string; executionId?: string; output?: Readonly<Record<string, unknown>>; error?: Readonly<{ code: string; message: string }> }>[];
  readonly handoffs: readonly AgentHandoff[];
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: Readonly<{ code: string; message: string }>;
}

export interface AgentLookup {
  findById(id: string): Agent | undefined;
}
