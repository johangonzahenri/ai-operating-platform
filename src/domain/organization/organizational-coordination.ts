import crypto from "node:crypto";
import {
  BoundedDataLimits,
  DEFAULT_BOUNDED_DATA_LIMITS,
  deepFreeze,
  sanitizeBoundedValue,
  validateBoundedDataLimits,
} from "../context/bounded-data.js";

export type CoordinationRecordStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "DISPATCHED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

export interface CoordinationFailure {
  readonly code: string;
  readonly message: string;
}

export interface CreateAgentCoordinationRecordProps {
  readonly id?: string | undefined;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly requesterId: string;
  readonly correlationId?: string | undefined;
  readonly parentExecutionId?: string | undefined;
  readonly purpose: string;
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly depth?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly handoffCount?: number | undefined;
  readonly maxHandoffs?: number | undefined;
  readonly history?: readonly string[] | undefined;
}

export interface RehydrateAgentCoordinationRecordProps {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly requesterId: string;
  readonly correlationId: string;
  readonly parentExecutionId?: string | undefined;
  readonly childExecutionId?: string | undefined;
  readonly purpose: string;
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly outputPayload?: Readonly<Record<string, unknown>> | undefined;
  readonly depth: number;
  readonly maxDepth: number;
  readonly handoffCount: number;
  readonly maxHandoffs: number;
  readonly status: CoordinationRecordStatus;
  readonly failure?: CoordinationFailure | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date | undefined;
}

export class CoordinationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationDomainError";
  }
}

export class CoordinationCycleError extends CoordinationDomainError {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationCycleError";
  }
}

export class CoordinationDepthExceededError extends CoordinationDomainError {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationDepthExceededError";
  }
}

export class AgentCoordinationRecord {
  readonly id!: string;
  readonly tenantId!: string;
  readonly organizationId!: string;
  readonly teamId!: string;
  readonly sourceAgentId!: string;
  readonly targetAgentId!: string;
  readonly requesterId!: string;
  readonly correlationId!: string;
  readonly parentExecutionId?: string | undefined;
  readonly childExecutionId?: string | undefined;
  readonly purpose!: string;
  readonly inputPayload!: Readonly<Record<string, unknown>>;
  readonly outputPayload?: Readonly<Record<string, unknown>> | undefined;
  readonly depth!: number;
  readonly maxDepth!: number;
  readonly handoffCount!: number;
  readonly maxHandoffs!: number;
  readonly status!: CoordinationRecordStatus;
  readonly failure?: CoordinationFailure | undefined;
  readonly version!: number;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
  readonly completedAt?: Date | undefined;

  private constructor(props: Partial<AgentCoordinationRecord>) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(
    props: CreateAgentCoordinationRecordProps,
    limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS
  ): AgentCoordinationRecord {
    validateBoundedDataLimits(limits);

    // Required fields check
    for (const [name, val] of [
      ["tenantId", props.tenantId],
      ["organizationId", props.organizationId],
      ["teamId", props.teamId],
      ["sourceAgentId", props.sourceAgentId],
      ["targetAgentId", props.targetAgentId],
      ["requesterId", props.requesterId],
      ["purpose", props.purpose],
    ] as const) {
      if (typeof val !== "string" || val.trim() === "") {
        throw new CoordinationDomainError(`Coordination ${name} must be a non-empty string`);
      }
    }

    if (props.sourceAgentId.trim() === props.targetAgentId.trim()) {
      throw new CoordinationDomainError("Source agent and target agent must be different");
    }

    const depth = props.depth ?? 0;
    const maxDepth = props.maxDepth ?? 3;
    if (!Number.isInteger(depth) || depth < 0) {
      throw new CoordinationDomainError("Coordination depth must be a non-negative integer");
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new CoordinationDomainError("Coordination maxDepth must be a positive integer");
    }
    if (depth >= maxDepth) {
      throw new CoordinationDepthExceededError(
        `Coordination depth ${depth} reaches or exceeds maximum allowed depth ${maxDepth}`
      );
    }

    const handoffCount = props.handoffCount ?? 0;
    const maxHandoffs = props.maxHandoffs ?? 5;
    if (!Number.isInteger(handoffCount) || handoffCount < 0) {
      throw new CoordinationDomainError("Coordination handoffCount must be a non-negative integer");
    }
    if (!Number.isInteger(maxHandoffs) || maxHandoffs < 1) {
      throw new CoordinationDomainError("Coordination maxHandoffs must be a positive integer");
    }
    if (handoffCount >= maxHandoffs) {
      throw new CoordinationDomainError(
        `Coordination handoff count ${handoffCount} reaches or exceeds maxHandoffs ${maxHandoffs}`
      );
    }

    // Cycle detection if history is provided
    if (props.history && Array.isArray(props.history)) {
      const historySet = new Set(props.history.map((id) => id.trim()));
      if (historySet.has(props.targetAgentId.trim())) {
        throw new CoordinationCycleError(
          `Coordination cycle detected: target agent '${props.targetAgentId}' already exists in execution chain [${props.history.join(" -> ")}]`
        );
      }
    }

    if (!props.inputPayload || typeof props.inputPayload !== "object" || Array.isArray(props.inputPayload)) {
      throw new CoordinationDomainError("Coordination inputPayload must be an object");
    }

    const state = { truncated: false };
    const sanitizedInput = deepFreeze(
      sanitizeBoundedValue(props.inputPayload, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    const now = new Date();
    const id = props.id?.trim() || `coord_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const correlationId = props.correlationId?.trim() || crypto.randomUUID();

    return new AgentCoordinationRecord({
      id,
      tenantId: props.tenantId.trim(),
      organizationId: props.organizationId.trim(),
      teamId: props.teamId.trim(),
      sourceAgentId: props.sourceAgentId.trim(),
      targetAgentId: props.targetAgentId.trim(),
      requesterId: props.requesterId.trim(),
      correlationId,
      ...(props.parentExecutionId?.trim() ? { parentExecutionId: props.parentExecutionId.trim() } : {}),
      purpose: props.purpose.trim(),
      inputPayload: sanitizedInput,
      depth,
      maxDepth,
      handoffCount,
      maxHandoffs,
      status: "REQUESTED",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateAgentCoordinationRecordProps): AgentCoordinationRecord {
    return new AgentCoordinationRecord({
      id: props.id,
      tenantId: props.tenantId,
      organizationId: props.organizationId,
      teamId: props.teamId,
      sourceAgentId: props.sourceAgentId,
      targetAgentId: props.targetAgentId,
      requesterId: props.requesterId,
      correlationId: props.correlationId,
      parentExecutionId: props.parentExecutionId,
      childExecutionId: props.childExecutionId,
      purpose: props.purpose,
      inputPayload: deepFreeze({ ...props.inputPayload }),
      outputPayload: props.outputPayload ? deepFreeze({ ...props.outputPayload }) : undefined,
      depth: props.depth,
      maxDepth: props.maxDepth,
      handoffCount: props.handoffCount,
      maxHandoffs: props.maxHandoffs,
      status: props.status,
      failure: props.failure ? deepFreeze({ ...props.failure }) : undefined,
      version: props.version,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
      completedAt: props.completedAt ? new Date(props.completedAt) : undefined,
    });
  }

  authorize(): AgentCoordinationRecord {
    if (this.status !== "REQUESTED") {
      throw new CoordinationDomainError(`Cannot authorize coordination in '${this.status}' status`);
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      status: "AUTHORIZED",
      version: this.version + 1,
      updatedAt: now,
    });
  }

  reject(code: string, message: string): AgentCoordinationRecord {
    if (this.status !== "REQUESTED" && this.status !== "AUTHORIZED") {
      throw new CoordinationDomainError(`Cannot reject coordination in '${this.status}' status`);
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      status: "REJECTED",
      failure: deepFreeze({ code: code.trim(), message: message.trim() }),
      version: this.version + 1,
      updatedAt: now,
      completedAt: now,
    });
  }

  dispatch(childExecutionId: string): AgentCoordinationRecord {
    if (this.status !== "AUTHORIZED") {
      throw new CoordinationDomainError(`Cannot dispatch coordination in '${this.status}' status`);
    }
    if (typeof childExecutionId !== "string" || childExecutionId.trim() === "") {
      throw new CoordinationDomainError("Child execution ID must be a non-empty string");
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      childExecutionId: childExecutionId.trim(),
      status: "DISPATCHED",
      version: this.version + 1,
      updatedAt: now,
    });
  }

  start(): AgentCoordinationRecord {
    if (this.status !== "DISPATCHED" && this.status !== "AUTHORIZED") {
      throw new CoordinationDomainError(`Cannot start coordination in '${this.status}' status`);
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      status: "RUNNING",
      version: this.version + 1,
      updatedAt: now,
    });
  }

  complete(output: Readonly<Record<string, unknown>>, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): AgentCoordinationRecord {
    if (this.status !== "RUNNING" && this.status !== "DISPATCHED") {
      throw new CoordinationDomainError(`Cannot complete coordination in '${this.status}' status`);
    }
    const state = { truncated: false };
    const sanitizedOutput = deepFreeze(
      sanitizeBoundedValue(output ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      outputPayload: sanitizedOutput,
      status: "COMPLETED",
      version: this.version + 1,
      updatedAt: now,
      completedAt: now,
    });
  }

  fail(code: string, message: string): AgentCoordinationRecord {
    if (this.status === "COMPLETED" || this.status === "CANCELLED" || this.status === "REJECTED") {
      throw new CoordinationDomainError(`Cannot fail coordination in terminal '${this.status}' status`);
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      failure: deepFreeze({ code: code.trim(), message: message.trim() }),
      status: "FAILED",
      version: this.version + 1,
      updatedAt: now,
      completedAt: now,
    });
  }

  cancel(reason = "Coordination cancelled"): AgentCoordinationRecord {
    if (this.status === "COMPLETED" || this.status === "FAILED" || this.status === "REJECTED") {
      throw new CoordinationDomainError(`Cannot cancel coordination in terminal '${this.status}' status`);
    }
    const now = new Date();
    return new AgentCoordinationRecord({
      ...this,
      failure: deepFreeze({ code: "COORDINATION_CANCELLED", message: reason.trim() }),
      status: "CANCELLED",
      version: this.version + 1,
      updatedAt: now,
      completedAt: now,
    });
  }
}
