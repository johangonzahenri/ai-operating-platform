import {
  AgentLifecycleValidationError,
  AgentLifecycleConcurrencyConflictError,
  InvalidLifecycleTransitionError,
  SelfGovernanceError,
} from "./agent-lifecycle-errors.js";

export type AgentLifecycleState =
  | "REGISTERED"
  | "EVALUATION_PENDING"
  | "VERIFIED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | "DEPRECATED";

export const VALID_LIFECYCLE_STATES: readonly AgentLifecycleState[] = [
  "REGISTERED",
  "EVALUATION_PENDING",
  "VERIFIED",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "DEPRECATED",
];

const ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

export interface AgentLifecycleProps {
  readonly agentId: string;
  readonly tenantId: string;
  readonly state?: AgentLifecycleState | undefined;
  readonly profileVersion?: number | undefined;
  readonly suspendedReason?: string | undefined;
  readonly suspendedBy?: string | undefined;
  readonly suspendedAt?: Date | undefined;
  readonly revokedReason?: string | undefined;
  readonly revokedBy?: string | undefined;
  readonly revokedAt?: Date | undefined;
  readonly deprecatedReason?: string | undefined;
  readonly deprecatedBy?: string | undefined;
  readonly deprecatedAt?: Date | undefined;
  readonly lastEvaluatedAt?: Date | undefined;
  readonly lastEvaluationId?: string | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface RehydrateAgentLifecycleProps {
  readonly agentId: string;
  readonly tenantId: string;
  readonly state: AgentLifecycleState;
  readonly profileVersion: number;
  readonly suspendedReason?: string | undefined;
  readonly suspendedBy?: string | undefined;
  readonly suspendedAt?: Date | undefined;
  readonly revokedReason?: string | undefined;
  readonly revokedBy?: string | undefined;
  readonly revokedAt?: Date | undefined;
  readonly deprecatedReason?: string | undefined;
  readonly deprecatedBy?: string | undefined;
  readonly deprecatedAt?: Date | undefined;
  readonly lastEvaluatedAt?: Date | undefined;
  readonly lastEvaluationId?: string | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function validateId(val: unknown, fieldName: string): string {
  if (typeof val !== "string" || !val.trim() || !ID_REGEX.test(val.trim())) {
    throw new AgentLifecycleValidationError(`${fieldName} must be a valid non-empty string matching ${ID_REGEX}`);
  }
  return val.trim();
}

export class AgentLifecycle {
  readonly agentId: string;
  readonly tenantId: string;
  readonly state: AgentLifecycleState;
  readonly profileVersion: number;
  readonly suspendedReason?: string | undefined;
  readonly suspendedBy?: string | undefined;
  readonly suspendedAt?: Date | undefined;
  readonly revokedReason?: string | undefined;
  readonly revokedBy?: string | undefined;
  readonly revokedAt?: Date | undefined;
  readonly deprecatedReason?: string | undefined;
  readonly deprecatedBy?: string | undefined;
  readonly deprecatedAt?: Date | undefined;
  readonly lastEvaluatedAt?: Date | undefined;
  readonly lastEvaluationId?: string | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly agentId: string;
    readonly tenantId: string;
    readonly state: AgentLifecycleState;
    readonly profileVersion: number;
    readonly suspendedReason?: string | undefined;
    readonly suspendedBy?: string | undefined;
    readonly suspendedAt?: Date | undefined;
    readonly revokedReason?: string | undefined;
    readonly revokedBy?: string | undefined;
    readonly revokedAt?: Date | undefined;
    readonly deprecatedReason?: string | undefined;
    readonly deprecatedBy?: string | undefined;
    readonly deprecatedAt?: Date | undefined;
    readonly lastEvaluatedAt?: Date | undefined;
    readonly lastEvaluationId?: string | undefined;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.agentId = props.agentId;
    this.tenantId = props.tenantId;
    this.state = props.state;
    this.profileVersion = props.profileVersion;
    this.suspendedReason = props.suspendedReason;
    this.suspendedBy = props.suspendedBy;
    this.suspendedAt = props.suspendedAt;
    this.revokedReason = props.revokedReason;
    this.revokedBy = props.revokedBy;
    this.revokedAt = props.revokedAt;
    this.deprecatedReason = props.deprecatedReason;
    this.deprecatedBy = props.deprecatedBy;
    this.deprecatedAt = props.deprecatedAt;
    this.lastEvaluatedAt = props.lastEvaluatedAt;
    this.lastEvaluationId = props.lastEvaluationId;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: AgentLifecycleProps, now: Date = new Date()): AgentLifecycle {
    const agentId = validateId(props.agentId, "agentId");
    const tenantId = validateId(props.tenantId, "tenantId");
    const state: AgentLifecycleState = props.state ?? "REGISTERED";
    if (!VALID_LIFECYCLE_STATES.includes(state)) {
      throw new AgentLifecycleValidationError(`Invalid lifecycle state: '${state}'`);
    }
    const profileVersion = typeof props.profileVersion === "number" && props.profileVersion >= 1 ? props.profileVersion : 1;
    const version = typeof props.version === "number" && props.version >= 1 ? props.version : 1;
    const createdAt = props.createdAt ? new Date(props.createdAt.getTime()) : new Date(now.getTime());
    const updatedAt = props.updatedAt ? new Date(props.updatedAt.getTime()) : new Date(now.getTime());

    return new AgentLifecycle({
      agentId,
      tenantId,
      state,
      profileVersion,
      suspendedReason: props.suspendedReason?.trim() || undefined,
      suspendedBy: props.suspendedBy?.trim() || undefined,
      suspendedAt: props.suspendedAt ? new Date(props.suspendedAt.getTime()) : undefined,
      revokedReason: props.revokedReason?.trim() || undefined,
      revokedBy: props.revokedBy?.trim() || undefined,
      revokedAt: props.revokedAt ? new Date(props.revokedAt.getTime()) : undefined,
      deprecatedReason: props.deprecatedReason?.trim() || undefined,
      deprecatedBy: props.deprecatedBy?.trim() || undefined,
      deprecatedAt: props.deprecatedAt ? new Date(props.deprecatedAt.getTime()) : undefined,
      lastEvaluatedAt: props.lastEvaluatedAt ? new Date(props.lastEvaluatedAt.getTime()) : undefined,
      lastEvaluationId: props.lastEvaluationId?.trim() || undefined,
      version,
      createdAt,
      updatedAt,
    });
  }

  static rehydrate(props: RehydrateAgentLifecycleProps): AgentLifecycle {
    const agentId = validateId(props.agentId, "agentId");
    const tenantId = validateId(props.tenantId, "tenantId");
    if (!VALID_LIFECYCLE_STATES.includes(props.state)) {
      throw new AgentLifecycleValidationError(`Invalid lifecycle state: '${props.state}'`);
    }
    if (typeof props.profileVersion !== "number" || props.profileVersion < 1) {
      throw new AgentLifecycleValidationError("profileVersion must be an integer >= 1");
    }
    if (typeof props.version !== "number" || props.version < 1) {
      throw new AgentLifecycleValidationError("version must be an integer >= 1");
    }
    if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
      throw new AgentLifecycleValidationError("createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || Number.isNaN(props.updatedAt.getTime())) {
      throw new AgentLifecycleValidationError("updatedAt must be a valid Date");
    }

    return new AgentLifecycle({
      agentId,
      tenantId,
      state: props.state,
      profileVersion: props.profileVersion,
      suspendedReason: props.suspendedReason,
      suspendedBy: props.suspendedBy,
      suspendedAt: props.suspendedAt ? new Date(props.suspendedAt.getTime()) : undefined,
      revokedReason: props.revokedReason,
      revokedBy: props.revokedBy,
      revokedAt: props.revokedAt ? new Date(props.revokedAt.getTime()) : undefined,
      deprecatedReason: props.deprecatedReason,
      deprecatedBy: props.deprecatedBy,
      deprecatedAt: props.deprecatedAt ? new Date(props.deprecatedAt.getTime()) : undefined,
      lastEvaluatedAt: props.lastEvaluatedAt ? new Date(props.lastEvaluatedAt.getTime()) : undefined,
      lastEvaluationId: props.lastEvaluationId,
      version: props.version,
      createdAt: new Date(props.createdAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  private ensureNotSelfGovernance(operatorPrincipalId: string, action: string): void {
    if (operatorPrincipalId && operatorPrincipalId.trim().toLowerCase() === this.agentId.toLowerCase()) {
      throw new SelfGovernanceError(this.agentId, action);
    }
  }

  private ensureExpectedVersion(expectedVersion?: number): void {
    if (expectedVersion !== undefined && expectedVersion !== this.version) {
      throw new AgentLifecycleConcurrencyConflictError(
        `Agent lifecycle OCC conflict: expected version ${expectedVersion}, but current version is ${this.version}`
      );
    }
  }

  updateProfileVersion(newVersion: number, now: Date = new Date()): AgentLifecycle {
    if (typeof newVersion !== "number" || newVersion < this.profileVersion) {
      throw new AgentLifecycleValidationError(`New profile version must be >= current version ${this.profileVersion}`);
    }
    if (newVersion === this.profileVersion) {
      return this;
    }
    return new AgentLifecycle({
      ...this,
      profileVersion: newVersion,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  startEvaluation(operatorPrincipalId: string, expectedVersion?: number, now: Date = new Date()): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "startEvaluation");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED") {
      throw new InvalidLifecycleTransitionError(this.state, "EVALUATION_PENDING", "Revoked agents cannot enter evaluation");
    }
    if (this.state === "DEPRECATED") {
      throw new InvalidLifecycleTransitionError(this.state, "EVALUATION_PENDING", "Deprecated agents cannot enter evaluation");
    }
    if (this.state === "EVALUATION_PENDING") {
      return this;
    }

    return new AgentLifecycle({
      ...this,
      state: "EVALUATION_PENDING",
      version: this.version + 1,
      updatedAt: now,
    });
  }

  markVerified(
    evaluationId: string,
    operatorPrincipalId: string,
    expectedVersion?: number,
    now: Date = new Date()
  ): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "markVerified");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED" || this.state === "DEPRECATED") {
      throw new InvalidLifecycleTransitionError(this.state, "VERIFIED", `Agent is ${this.state}`);
    }

    return new AgentLifecycle({
      ...this,
      state: "VERIFIED",
      lastEvaluatedAt: now,
      lastEvaluationId: validateId(evaluationId, "evaluationId"),
      version: this.version + 1,
      updatedAt: now,
    });
  }

  activate(operatorPrincipalId: string, expectedVersion?: number, now: Date = new Date()): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "activate");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED") {
      throw new InvalidLifecycleTransitionError(this.state, "ACTIVE", "Revoked agents cannot be activated without formal governance reinstatement");
    }
    if (this.state === "DEPRECATED") {
      throw new InvalidLifecycleTransitionError(this.state, "ACTIVE", "Deprecated agents cannot be directly activated");
    }
    if (this.state === "ACTIVE") {
      return this;
    }

    return new AgentLifecycle({
      ...this,
      state: "ACTIVE",
      suspendedReason: undefined,
      suspendedBy: undefined,
      suspendedAt: undefined,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  suspend(
    reason: string,
    operatorPrincipalId: string,
    expectedVersion?: number,
    now: Date = new Date()
  ): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "suspend");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED") {
      throw new InvalidLifecycleTransitionError(this.state, "SUSPENDED", "Cannot suspend a revoked agent");
    }
    if (this.state === "DEPRECATED") {
      throw new InvalidLifecycleTransitionError(this.state, "SUSPENDED", "Cannot suspend a deprecated agent");
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new AgentLifecycleValidationError("Suspension reason is mandatory");
    }

    return new AgentLifecycle({
      ...this,
      state: "SUSPENDED",
      suspendedReason: trimmedReason,
      suspendedBy: operatorPrincipalId.trim(),
      suspendedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  revoke(
    reason: string,
    operatorPrincipalId: string,
    expectedVersion?: number,
    now: Date = new Date()
  ): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "revoke");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED") {
      return this;
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new AgentLifecycleValidationError("Revocation reason is mandatory");
    }

    return new AgentLifecycle({
      ...this,
      state: "REVOKED",
      revokedReason: trimmedReason,
      revokedBy: operatorPrincipalId.trim(),
      revokedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  deprecate(
    reason: string,
    operatorPrincipalId: string,
    expectedVersion?: number,
    now: Date = new Date()
  ): AgentLifecycle {
    this.ensureNotSelfGovernance(operatorPrincipalId, "deprecate");
    this.ensureExpectedVersion(expectedVersion);

    if (this.state === "REVOKED") {
      throw new InvalidLifecycleTransitionError(this.state, "DEPRECATED", "Revoked agent cannot be transitioned to deprecated");
    }
    if (this.state === "DEPRECATED") {
      return this;
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new AgentLifecycleValidationError("Deprecation reason is mandatory");
    }

    return new AgentLifecycle({
      ...this,
      state: "DEPRECATED",
      deprecatedReason: trimmedReason,
      deprecatedBy: operatorPrincipalId.trim(),
      deprecatedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  isEligibleForExecution(): boolean {
    return this.state === "ACTIVE";
  }

  isEligibleForDiscovery(): boolean {
    return this.state === "ACTIVE" || this.state === "VERIFIED";
  }
}
