import {
  BudgetValidationError,
  BudgetExhaustedError,
  BudgetSuspendedError,
} from "./organization-errors.js";

export type BudgetStatus = "ACTIVE" | "EXHAUSTED" | "SUSPENDED";
export type BudgetWindow = "LIFETIME" | "DAILY" | "MONTHLY";

export interface BudgetLimits {
  readonly maxExecutions: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxAutonomousSteps: number;
  readonly maxDurationMs: number;
  readonly maxTokens?: number | undefined;
}

export interface BudgetConsumed {
  readonly executions: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly autonomousSteps: number;
  readonly durationMs: number;
  readonly tokens?: number | undefined;
}

export interface BudgetRemaining {
  readonly executions: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly autonomousSteps: number;
  readonly durationMs: number;
  readonly tokens?: number | undefined;
}

export interface ResourceConsumptionRequest {
  readonly executions?: number | undefined;
  readonly modelCalls?: number | undefined;
  readonly toolCalls?: number | undefined;
  readonly autonomousSteps?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly tokens?: number | undefined;
}

export interface CreateTeamResourceBudgetProps {
  readonly id?: string | undefined;
  readonly teamId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly limits: BudgetLimits;
  readonly window?: BudgetWindow | undefined;
}

export interface TeamResourceBudgetRehydrateProps {
  readonly id: string;
  readonly teamId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly limits: BudgetLimits;
  readonly consumed: BudgetConsumed;
  readonly status: BudgetStatus;
  readonly window: BudgetWindow;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATUSES: readonly BudgetStatus[] = ["ACTIVE", "EXHAUSTED", "SUSPENDED"];
const VALID_WINDOWS: readonly BudgetWindow[] = ["LIFETIME", "DAILY", "MONTHLY"];

function validateId(id: unknown, fieldName: string): string {
  if (typeof id !== "string") {
    throw new BudgetValidationError(`${fieldName} must be a string`);
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new BudgetValidationError(`${fieldName} must be alphanumeric, dashes or underscores (1-128 chars)`);
  }
  return trimmed;
}

function validateNonNegativeInteger(val: unknown, fieldName: string): number {
  if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
    throw new BudgetValidationError(`${fieldName} must be a non-negative integer`);
  }
  return val;
}

function validateLimits(limits: unknown): BudgetLimits {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new BudgetValidationError("Budget limits must be a valid non-null object");
  }
  const raw = limits as Record<string, unknown>;
  const maxExecutions = validateNonNegativeInteger(raw.maxExecutions, "maxExecutions");
  const maxModelCalls = validateNonNegativeInteger(raw.maxModelCalls, "maxModelCalls");
  const maxToolCalls = validateNonNegativeInteger(raw.maxToolCalls, "maxToolCalls");
  const maxAutonomousSteps = validateNonNegativeInteger(raw.maxAutonomousSteps, "maxAutonomousSteps");
  const maxDurationMs = validateNonNegativeInteger(raw.maxDurationMs, "maxDurationMs");

  let maxTokens: number | undefined = undefined;
  if (raw.maxTokens !== undefined) {
    maxTokens = validateNonNegativeInteger(raw.maxTokens, "maxTokens");
  }

  return Object.freeze({
    maxExecutions,
    maxModelCalls,
    maxToolCalls,
    maxAutonomousSteps,
    maxDurationMs,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  });
}

function validateConsumed(consumed: unknown): BudgetConsumed {
  if (!consumed || typeof consumed !== "object" || Array.isArray(consumed)) {
    throw new BudgetValidationError("Budget consumed must be a valid non-null object");
  }
  const raw = consumed as Record<string, unknown>;
  const executions = validateNonNegativeInteger(raw.executions, "consumed.executions");
  const modelCalls = validateNonNegativeInteger(raw.modelCalls, "consumed.modelCalls");
  const toolCalls = validateNonNegativeInteger(raw.toolCalls, "consumed.toolCalls");
  const autonomousSteps = validateNonNegativeInteger(raw.autonomousSteps, "consumed.autonomousSteps");
  const durationMs = validateNonNegativeInteger(raw.durationMs, "consumed.durationMs");

  let tokens: number | undefined = undefined;
  if (raw.tokens !== undefined) {
    tokens = validateNonNegativeInteger(raw.tokens, "consumed.tokens");
  }

  return Object.freeze({
    executions,
    modelCalls,
    toolCalls,
    autonomousSteps,
    durationMs,
    ...(tokens !== undefined ? { tokens } : {}),
  });
}

export class TeamResourceBudget {
  readonly id: string;
  readonly teamId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly limits: BudgetLimits;
  readonly consumed: BudgetConsumed;
  readonly status: BudgetStatus;
  readonly window: BudgetWindow;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly id: string;
    readonly teamId: string;
    readonly organizationId: string;
    readonly tenantId: string;
    readonly limits: BudgetLimits;
    readonly consumed: BudgetConsumed;
    readonly status: BudgetStatus;
    readonly window: BudgetWindow;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.id = props.id;
    this.teamId = props.teamId;
    this.organizationId = props.organizationId;
    this.tenantId = props.tenantId;
    this.limits = props.limits;
    this.consumed = props.consumed;
    this.status = props.status;
    this.window = props.window;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  get budgetId(): string {
    return this.id;
  }

  static create(props: CreateTeamResourceBudgetProps): TeamResourceBudget {
    const id = props.id ? validateId(props.id, "Budget id") : `trb_${props.teamId}`;
    const teamId = validateId(props.teamId, "Team id");
    const organizationId = validateId(props.organizationId, "Organization id");
    const tenantId = validateId(props.tenantId, "Tenant id");
    const limits = validateLimits(props.limits);
    const window = props.window ?? "LIFETIME";

    if (!VALID_WINDOWS.includes(window)) {
      throw new BudgetValidationError(`Invalid budget window: '${window}'`);
    }

    const now = new Date();
    const consumed: BudgetConsumed = Object.freeze({
      executions: 0,
      modelCalls: 0,
      toolCalls: 0,
      autonomousSteps: 0,
      durationMs: 0,
      ...(limits.maxTokens !== undefined ? { tokens: 0 } : {}),
    });

    return new TeamResourceBudget({
      id,
      teamId,
      organizationId,
      tenantId,
      limits,
      consumed,
      status: "ACTIVE",
      window,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: TeamResourceBudgetRehydrateProps): TeamResourceBudget {
    const id = validateId(props.id, "Rehydrated budget id");
    const teamId = validateId(props.teamId, "Rehydrated team id");
    const organizationId = validateId(props.organizationId, "Rehydrated organization id");
    const tenantId = validateId(props.tenantId, "Rehydrated tenant id");
    const limits = validateLimits(props.limits);
    const consumed = validateConsumed(props.consumed);

    if (!VALID_STATUSES.includes(props.status)) {
      throw new BudgetValidationError(`Invalid budget status: '${props.status}'`);
    }
    if (!VALID_WINDOWS.includes(props.window)) {
      throw new BudgetValidationError(`Invalid budget window: '${props.window}'`);
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new BudgetValidationError("Rehydrated budget version must be an integer >= 1");
    }
    if (!(props.createdAt instanceof Date) || isNaN(props.createdAt.getTime())) {
      throw new BudgetValidationError("Rehydrated budget createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || isNaN(props.updatedAt.getTime())) {
      throw new BudgetValidationError("Rehydrated budget updatedAt must be a valid Date");
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new BudgetValidationError("Rehydrated budget updatedAt cannot precede createdAt");
    }

    return new TeamResourceBudget({
      id,
      teamId,
      organizationId,
      tenantId,
      limits,
      consumed,
      status: props.status,
      window: props.window,
      version: props.version,
      createdAt: new Date(props.createdAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  getRemaining(): BudgetRemaining {
    const remExecutions = Math.max(0, this.limits.maxExecutions - this.consumed.executions);
    const remModelCalls = Math.max(0, this.limits.maxModelCalls - this.consumed.modelCalls);
    const remToolCalls = Math.max(0, this.limits.maxToolCalls - this.consumed.toolCalls);
    const remAutonomousSteps = Math.max(0, this.limits.maxAutonomousSteps - this.consumed.autonomousSteps);
    const remDurationMs = Math.max(0, this.limits.maxDurationMs - this.consumed.durationMs);

    let remTokens: number | undefined = undefined;
    if (this.limits.maxTokens !== undefined) {
      remTokens = Math.max(0, this.limits.maxTokens - (this.consumed.tokens ?? 0));
    }

    return Object.freeze({
      executions: remExecutions,
      modelCalls: remModelCalls,
      toolCalls: remToolCalls,
      autonomousSteps: remAutonomousSteps,
      durationMs: remDurationMs,
      ...(remTokens !== undefined ? { tokens: remTokens } : {}),
    });
  }

  isExhausted(): boolean {
    const rem = this.getRemaining();
    return (
      rem.executions <= 0 ||
      (this.limits.maxExecutions > 0 && this.consumed.executions >= this.limits.maxExecutions) ||
      (this.limits.maxModelCalls > 0 && this.consumed.modelCalls >= this.limits.maxModelCalls) ||
      (this.limits.maxToolCalls > 0 && this.consumed.toolCalls >= this.limits.maxToolCalls) ||
      (this.limits.maxAutonomousSteps > 0 && this.consumed.autonomousSteps >= this.limits.maxAutonomousSteps) ||
      (this.limits.maxDurationMs > 0 && this.consumed.durationMs >= this.limits.maxDurationMs) ||
      (this.limits.maxTokens !== undefined && (this.consumed.tokens ?? 0) >= this.limits.maxTokens)
    );
  }

  canConsume(request: ResourceConsumptionRequest): { allowed: boolean; reason?: string; remaining: BudgetRemaining } {
    const remaining = this.getRemaining();

    if (this.status === "SUSPENDED") {
      return {
        allowed: false,
        reason: `Budget for team '${this.teamId}' is SUSPENDED`,
        remaining,
      };
    }

    const reqExec = request.executions ?? 0;
    const reqModel = request.modelCalls ?? 0;
    const reqTool = request.toolCalls ?? 0;
    const reqSteps = request.autonomousSteps ?? 0;
    const reqDuration = request.durationMs ?? 0;
    const reqTokens = request.tokens ?? 0;

    if (reqExec < 0 || reqModel < 0 || reqTool < 0 || reqSteps < 0 || reqDuration < 0 || reqTokens < 0) {
      throw new BudgetValidationError("Resource consumption request amounts must be non-negative");
    }

    if (reqExec > 0 && reqExec > remaining.executions) {
      return {
        allowed: false,
        reason: `Insufficient execution quota: requested ${reqExec}, remaining ${remaining.executions}`,
        remaining,
      };
    }

    if (reqModel > 0 && reqModel > remaining.modelCalls) {
      return {
        allowed: false,
        reason: `Insufficient model calls quota: requested ${reqModel}, remaining ${remaining.modelCalls}`,
        remaining,
      };
    }

    if (reqTool > 0 && reqTool > remaining.toolCalls) {
      return {
        allowed: false,
        reason: `Insufficient tool calls quota: requested ${reqTool}, remaining ${remaining.toolCalls}`,
        remaining,
      };
    }

    if (reqSteps > 0 && reqSteps > remaining.autonomousSteps) {
      return {
        allowed: false,
        reason: `Insufficient autonomous steps quota: requested ${reqSteps}, remaining ${remaining.autonomousSteps}`,
        remaining,
      };
    }

    if (reqDuration > 0 && reqDuration > remaining.durationMs) {
      return {
        allowed: false,
        reason: `Insufficient duration quota: requested ${reqDuration}ms, remaining ${remaining.durationMs}ms`,
        remaining,
      };
    }

    if (this.limits.maxTokens !== undefined && reqTokens > 0) {
      const remTok = remaining.tokens ?? 0;
      if (reqTokens > remTok) {
        return {
          allowed: false,
          reason: `Insufficient token quota: requested ${reqTokens}, remaining ${remTok}`,
          remaining,
        };
      }
    }

    return {
      allowed: true,
      remaining,
    };
  }

  consume(request: ResourceConsumptionRequest): TeamResourceBudget {
    const check = this.canConsume(request);
    if (!check.allowed) {
      if (this.status === "SUSPENDED") {
        throw new BudgetSuspendedError(this.teamId);
      }
      throw new BudgetExhaustedError(this.teamId, check.reason);
    }

    const nextConsumed: BudgetConsumed = Object.freeze({
      executions: this.consumed.executions + (request.executions ?? 0),
      modelCalls: this.consumed.modelCalls + (request.modelCalls ?? 0),
      toolCalls: this.consumed.toolCalls + (request.toolCalls ?? 0),
      autonomousSteps: this.consumed.autonomousSteps + (request.autonomousSteps ?? 0),
      durationMs: this.consumed.durationMs + (request.durationMs ?? 0),
      ...(this.limits.maxTokens !== undefined
        ? { tokens: (this.consumed.tokens ?? 0) + (request.tokens ?? 0) }
        : {}),
    });

    const willExhaust =
      nextConsumed.executions >= this.limits.maxExecutions ||
      nextConsumed.modelCalls >= this.limits.maxModelCalls ||
      nextConsumed.toolCalls >= this.limits.maxToolCalls ||
      nextConsumed.autonomousSteps >= this.limits.maxAutonomousSteps ||
      nextConsumed.durationMs >= this.limits.maxDurationMs ||
      (this.limits.maxTokens !== undefined && (nextConsumed.tokens ?? 0) >= this.limits.maxTokens);

    const nextStatus: BudgetStatus = willExhaust ? "EXHAUSTED" : "ACTIVE";

    return new TeamResourceBudget({
      id: this.id,
      teamId: this.teamId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      limits: this.limits,
      consumed: nextConsumed,
      status: nextStatus,
      window: this.window,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  updateLimits(newLimits: Partial<BudgetLimits>): TeamResourceBudget {
    if (this.status === "SUSPENDED") {
      throw new BudgetValidationError("Cannot update limits on a suspended budget");
    }

    const mergedLimits: BudgetLimits = validateLimits({
      maxExecutions: newLimits.maxExecutions ?? this.limits.maxExecutions,
      maxModelCalls: newLimits.maxModelCalls ?? this.limits.maxModelCalls,
      maxToolCalls: newLimits.maxToolCalls ?? this.limits.maxToolCalls,
      maxAutonomousSteps: newLimits.maxAutonomousSteps ?? this.limits.maxAutonomousSteps,
      maxDurationMs: newLimits.maxDurationMs ?? this.limits.maxDurationMs,
      maxTokens: newLimits.maxTokens !== undefined ? newLimits.maxTokens : this.limits.maxTokens,
    });

    const isNowExhausted =
      this.consumed.executions >= mergedLimits.maxExecutions ||
      this.consumed.modelCalls >= mergedLimits.maxModelCalls ||
      this.consumed.toolCalls >= mergedLimits.maxToolCalls ||
      this.consumed.autonomousSteps >= mergedLimits.maxAutonomousSteps ||
      this.consumed.durationMs >= mergedLimits.maxDurationMs ||
      (mergedLimits.maxTokens !== undefined && (this.consumed.tokens ?? 0) >= mergedLimits.maxTokens);

    const nextStatus: BudgetStatus = isNowExhausted ? "EXHAUSTED" : "ACTIVE";

    return new TeamResourceBudget({
      id: this.id,
      teamId: this.teamId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      limits: mergedLimits,
      consumed: this.consumed,
      status: nextStatus,
      window: this.window,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  suspend(): TeamResourceBudget {
    if (this.status === "SUSPENDED") return this;

    return new TeamResourceBudget({
      id: this.id,
      teamId: this.teamId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      limits: this.limits,
      consumed: this.consumed,
      status: "SUSPENDED",
      window: this.window,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  reactivate(): TeamResourceBudget {
    if (this.status === "ACTIVE") return this;

    const isExhausted = this.isExhausted();
    const nextStatus: BudgetStatus = isExhausted ? "EXHAUSTED" : "ACTIVE";

    return new TeamResourceBudget({
      id: this.id,
      teamId: this.teamId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      limits: this.limits,
      consumed: this.consumed,
      status: nextStatus,
      window: this.window,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
