import crypto from "node:crypto";
import type { Agent } from "../agent/agent.js";
import { BoundedDataLimits, DEFAULT_BOUNDED_DATA_LIMITS, deepFreeze, sanitizeBoundedValue, validateBoundedDataLimits } from "../context/bounded-data.js";

export type CoordinationStatus = "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL" | "CANCELLED" | "TIMEOUT" | "POLICY_DENIED";
export type HandoffStatus = "REQUESTED" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "FAILED";
export const COORDINATION_ROLES = Object.freeze(["DIAGNOSTIC", "DECISION", "EXECUTION", "VERIFICATION"] as const);
export type CoordinationRole = typeof COORDINATION_ROLES[number];

export type VerificationVerdictStatus = "PASS" | "FAIL";

export interface VerificationDecision {
  readonly status: VerificationVerdictStatus;
  readonly verified: boolean;
  readonly reason?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface VerificationEvaluationResult {
  readonly pass: boolean;
  readonly decision?: VerificationDecision;
  readonly error?: Readonly<{ code: string; message: string }>;
}

export function evaluateVerificationOutput(output: unknown): VerificationEvaluationResult {
  if (output === null || output === undefined || typeof output !== "object" || Array.isArray(output)) {
    return {
      pass: false,
      error: { code: "VERIFICATION_MALFORMED", message: "Verification output must be a non-null object" },
    };
  }

  const record = output as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return {
      pass: false,
      error: { code: "VERIFICATION_MISSING", message: "Verification output is empty and lacks a verdict" },
    };
  }

  const rawStatus = typeof record.status === "string" ? record.status.trim().toUpperCase() : undefined;
  const rawVerified = typeof record.verified === "boolean" ? record.verified : undefined;
  const reason = typeof record.reason === "string" ? record.reason.trim() : undefined;
  const evidence = record.evidence && typeof record.evidence === "object" && !Array.isArray(record.evidence)
    ? (record.evidence as Readonly<Record<string, unknown>>)
    : undefined;

  // Check for explicit contradiction / conflict
  if (rawStatus === "PASS" && rawVerified === false) {
    return {
      pass: false,
      error: { code: "VERIFICATION_CONFLICT", message: "Verification output contains conflicting status 'PASS' and verified false" },
    };
  }
  if ((rawStatus === "FAIL" || rawStatus === "FAILED") && rawVerified === true) {
    return {
      pass: false,
      error: { code: "VERIFICATION_CONFLICT", message: "Verification output contains conflicting status 'FAIL' and verified true" },
    };
  }

  // Explicit PASS verdict
  if (rawStatus === "PASS" || (rawVerified === true && rawStatus === undefined)) {
    return {
      pass: true,
      decision: {
        status: "PASS",
        verified: true,
        ...(reason ? { reason } : {}),
        ...(evidence ? { evidence } : {}),
      },
    };
  }

  // Explicit FAIL verdict
  if (rawStatus === "FAIL" || rawStatus === "FAILED" || rawVerified === false) {
    return {
      pass: false,
      decision: {
        status: "FAIL",
        verified: false,
        ...(reason ? { reason } : {}),
        ...(evidence ? { evidence } : {}),
      },
      error: {
        code: "VERIFICATION_FAILED",
        message: reason ?? "Verification agent rejected execution result",
      },
    };
  }

  // Ambiguous verdict
  return {
    pass: false,
    error: {
      code: "VERIFICATION_AMBIGUOUS",
      message: "Verification output lacks definitive PASS or FAIL status",
    },
  };
}

export interface CoordinationStep {
  readonly agentId: string;
  readonly role: CoordinationRole;
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
  readonly verificationCriteria?: Readonly<Record<string, unknown>>;
  readonly depth?: number;
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
  readonly verificationCriteria!: Readonly<Record<string, unknown>>;
  readonly depth!: number;
  private constructor(props: CoordinationRequest) { Object.assign(this, props); Object.freeze(this); }
  static create(props: CoordinationRequestProps, limits: CoordinationLimits = DEFAULT_COORDINATION_LIMITS): CoordinationRequest {
    if (!props || typeof props.taskId !== "string" || !props.taskId.trim() || typeof props.objective !== "string" || !props.objective.trim()) throw new CoordinationValidationError("Coordination requires taskId and objective");
    if (!Array.isArray(props.steps) || props.steps.length < 2 || props.steps.length > limits.maxAgents) throw new CoordinationValidationError(`Coordination requires between 2 and ${limits.maxAgents} steps`);
    if (props.steps.some((step) => !step?.agentId?.trim() || !step.role?.trim() || !COORDINATION_ROLES.includes(step.role as CoordinationRole))) throw new CoordinationValidationError("Every coordination step requires a valid role");
    const ids = new Set(props.steps.map((step) => step.agentId.trim()));
    if (ids.size !== props.steps.length) throw new CoordinationValidationError("Coordination cannot repeat an agent");
    if (props.steps.at(-1)?.role !== "VERIFICATION") throw new CoordinationValidationError("Coordination must end with a verification step");
    if (!props.input || typeof props.input !== "object" || Array.isArray(props.input)) throw new CoordinationValidationError("Coordination input must be an object");
    const state = { truncated: false };
    const input = deepFreeze(sanitizeBoundedValue(props.input, limits.data, 0, state) as Readonly<Record<string, unknown>>);
    const verificationCriteria = deepFreeze(sanitizeBoundedValue(props.verificationCriteria ?? {}, limits.data, 0, state) as Readonly<Record<string, unknown>>);
    const maxHandoffs = props.maxHandoffs ?? props.steps.length - 1;
    if (!Number.isInteger(maxHandoffs) || maxHandoffs < props.steps.length - 1 || maxHandoffs > limits.maxHandoffs) throw new CoordinationValidationError("Invalid coordination handoff budget");
    const timeoutMs = props.timeoutMs ?? 30000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new CoordinationValidationError("Coordination timeout must be positive");
    const depth = props.depth ?? 0;
    if (!Number.isInteger(depth) || depth < 0 || depth >= limits.maxDepth) throw new CoordinationValidationError("Recursive coordination is not permitted");
    return new CoordinationRequest({
      coordinationId: props.coordinationId?.trim() || crypto.randomUUID(), correlationId: props.correlationId?.trim() || crypto.randomUUID(),
      taskId: props.taskId.trim(), objective: props.objective.trim(), input,
      steps: Object.freeze(props.steps.map((step) => Object.freeze({ agentId: step.agentId.trim(), role: step.role.trim() as CoordinationRole, required: step.required !== false }))),
      maxHandoffs, timeoutMs, verificationCriteria, depth,
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
  readonly agentsExecuted?: number;
  readonly handoffsCreated?: number;
}

export interface AgentLookup {
  findById(id: string): Agent | undefined;
}
