/**
 * AI Operating Platform - Autonomous Runtime State Aggregate Root
 * 
 * Tracks the live daemon status of the Autonomous Operations Runtime per tenant.
 * Enforces circuit breaker safety halts, active cycle monitoring, and bounded failure recovery.
 */

import {
  InvalidRuntimeStateTransitionError,
  AutonomousRuntimeValidationError,
  RuntimeSafetyHaltError,
} from "./autonomous-runtime-errors.js";

export type AutonomousRuntimeStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "PAUSED"
  | "STOPPING"
  | "SAFETY_HALTED";

const ALLOWED_RUNTIME_TRANSITIONS: Readonly<Record<AutonomousRuntimeStatus, readonly AutonomousRuntimeStatus[]>> = {
  STOPPED: ["STARTING", "RUNNING"],
  STARTING: ["RUNNING", "STOPPED", "SAFETY_HALTED"],
  RUNNING: ["PAUSED", "STOPPING", "STOPPED", "SAFETY_HALTED"],
  PAUSED: ["RUNNING", "STOPPING", "STOPPED", "SAFETY_HALTED"],
  STOPPING: ["STOPPED", "SAFETY_HALTED"],
  SAFETY_HALTED: ["STOPPED", "STARTING", "RUNNING"],
};

export interface AutonomousRuntimeStateProps {
  readonly tenantId: string;
  readonly status: AutonomousRuntimeStatus;
  readonly runtimeInstanceId: string;
  readonly activeCycleIds: readonly string[];
  readonly consecutiveFailureCount: number;
  readonly maxConsecutiveFailures: number;
  readonly safetyHaltReason?: string | undefined;
  readonly lastHeartbeatAt: Date;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAutonomousRuntimeStateProps {
  readonly tenantId: string;
  readonly runtimeInstanceId?: string | undefined;
  readonly maxConsecutiveFailures?: number | undefined;
}

export class AutonomousRuntimeState {
  readonly tenantId: string;
  readonly status: AutonomousRuntimeStatus;
  readonly runtimeInstanceId: string;
  readonly activeCycleIds: readonly string[];
  readonly consecutiveFailureCount: number;
  readonly maxConsecutiveFailures: number;
  readonly safetyHaltReason?: string | undefined;
  readonly lastHeartbeatAt: Date;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AutonomousRuntimeStateProps) {
    this.tenantId = props.tenantId;
    this.status = props.status;
    this.runtimeInstanceId = props.runtimeInstanceId;
    this.activeCycleIds = props.activeCycleIds;
    this.consecutiveFailureCount = props.consecutiveFailureCount;
    this.maxConsecutiveFailures = props.maxConsecutiveFailures;
    this.safetyHaltReason = props.safetyHaltReason;
    this.lastHeartbeatAt = props.lastHeartbeatAt;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateAutonomousRuntimeStateProps, now = new Date()): AutonomousRuntimeState {
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new AutonomousRuntimeValidationError("AutonomousRuntimeState requires a non-empty tenantId");
    }

    return new AutonomousRuntimeState({
      tenantId: props.tenantId.trim(),
      status: "STOPPED",
      runtimeInstanceId: props.runtimeInstanceId?.trim() ?? "default-runtime-instance",
      activeCycleIds: Object.freeze([]),
      consecutiveFailureCount: 0,
      maxConsecutiveFailures: props.maxConsecutiveFailures ?? 5,
      safetyHaltReason: undefined,
      lastHeartbeatAt: now,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: AutonomousRuntimeStateProps): AutonomousRuntimeState {
    return new AutonomousRuntimeState(props);
  }

  private transitionTo(toState: AutonomousRuntimeStatus, now = new Date()): void {
    const allowed = ALLOWED_RUNTIME_TRANSITIONS[this.status] ?? [];
    if (!allowed.includes(toState)) {
      throw new InvalidRuntimeStateTransitionError(this.status, toState);
    }
  }

  start(runtimeInstanceId: string, now = new Date()): AutonomousRuntimeState {
    this.transitionTo("RUNNING", now);
    return new AutonomousRuntimeState({
      ...this,
      status: "RUNNING",
      runtimeInstanceId,
      safetyHaltReason: undefined,
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  pause(now = new Date()): AutonomousRuntimeState {
    this.transitionTo("PAUSED", now);
    return new AutonomousRuntimeState({
      ...this,
      status: "PAUSED",
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  resume(now = new Date()): AutonomousRuntimeState {
    this.transitionTo("RUNNING", now);
    return new AutonomousRuntimeState({
      ...this,
      status: "RUNNING",
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  stop(now = new Date()): AutonomousRuntimeState {
    this.transitionTo("STOPPED", now);
    return new AutonomousRuntimeState({
      ...this,
      status: "STOPPED",
      activeCycleIds: Object.freeze([]),
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  registerCycleStarted(cycleId: string, now = new Date()): AutonomousRuntimeState {
    if (this.status !== "RUNNING") {
      throw new AutonomousRuntimeValidationError(`Cannot start cycle '${cycleId}' while runtime is in '${this.status}' state`);
    }

    const set = new Set(this.activeCycleIds);
    set.add(cycleId);

    return new AutonomousRuntimeState({
      ...this,
      activeCycleIds: Object.freeze([...set]),
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  registerCycleSuccess(cycleId: string, now = new Date()): AutonomousRuntimeState {
    const active = this.activeCycleIds.filter((id) => id !== cycleId);

    return new AutonomousRuntimeState({
      ...this,
      activeCycleIds: Object.freeze(active),
      consecutiveFailureCount: 0,
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  registerCycleFailure(cycleId: string, reason: string, now = new Date()): AutonomousRuntimeState {
    const active = this.activeCycleIds.filter((id) => id !== cycleId);
    const newFailureCount = this.consecutiveFailureCount + 1;

    let nextStatus: AutonomousRuntimeStatus = this.status;
    let safetyReason = this.safetyHaltReason;

    if (newFailureCount >= this.maxConsecutiveFailures) {
      nextStatus = "SAFETY_HALTED";
      safetyReason = `Exceeded max consecutive failures threshold (${this.maxConsecutiveFailures}): ${reason}`;
    }

    return new AutonomousRuntimeState({
      ...this,
      status: nextStatus,
      activeCycleIds: Object.freeze(active),
      consecutiveFailureCount: newFailureCount,
      safetyHaltReason: safetyReason,
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  heartbeat(now = new Date()): AutonomousRuntimeState {
    return new AutonomousRuntimeState({
      ...this,
      lastHeartbeatAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }
}
