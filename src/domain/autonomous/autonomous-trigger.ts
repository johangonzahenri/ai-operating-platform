/**
 * AI Operating Platform - Autonomous Trigger Aggregate Root
 * 
 * Formal trigger model governing when an autonomous evaluation or executive cycle is initiated.
 * Supports SCHEDULED, EVENT_DRIVEN, THRESHOLD, and MANUAL trigger mechanisms.
 */

import { AutonomousRuntimeValidationError } from "./autonomous-runtime-errors.js";
import { AutonomyLevel } from "../business/autonomy-level.js";

export type TriggerType = "SCHEDULED" | "EVENT_DRIVEN" | "THRESHOLD" | "MANUAL";
export type TriggerStatus = "ENABLED" | "DISABLED" | "PAUSED";

export interface ScheduleConfig {
  readonly intervalMs: number;
  readonly lastFiredAt?: Date | undefined;
  readonly nextRunAt: Date;
}

export interface EventFilterConfig {
  readonly sourceEventType: string;
  readonly filterKey?: string | undefined;
  readonly filterValue?: string | undefined;
  readonly debounceMs?: number | undefined;
}

export interface ThresholdConfig {
  readonly metricId: string;
  readonly operator: "GREATER_THAN" | "LESS_THAN" | "EQUALS" | "NOT_EQUALS";
  readonly thresholdValue: number;
}

export interface AutonomousTriggerProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly triggerType: TriggerType;
  readonly status: TriggerStatus;
  readonly targetObjectiveId?: string | undefined;
  readonly targetInitiativeId?: string | undefined;
  readonly autonomyLevel: AutonomyLevel;
  readonly scheduleConfig?: ScheduleConfig | undefined;
  readonly eventConfig?: EventFilterConfig | undefined;
  readonly thresholdConfig?: ThresholdConfig | undefined;
  readonly fireCount: number;
  readonly lastFiredAt?: Date | undefined;
  readonly lastFiredCycleId?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAutonomousTriggerProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly triggerType: TriggerType;
  readonly targetObjectiveId?: string | undefined;
  readonly targetInitiativeId?: string | undefined;
  readonly autonomyLevel?: AutonomyLevel | undefined;
  readonly scheduleConfig?: {
    readonly intervalMs: number;
  } | undefined;
  readonly eventConfig?: EventFilterConfig | undefined;
  readonly thresholdConfig?: ThresholdConfig | undefined;
}

export class AutonomousTrigger {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly triggerType: TriggerType;
  readonly status: TriggerStatus;
  readonly targetObjectiveId?: string | undefined;
  readonly targetInitiativeId?: string | undefined;
  readonly autonomyLevel: AutonomyLevel;
  readonly scheduleConfig?: ScheduleConfig | undefined;
  readonly eventConfig?: EventFilterConfig | undefined;
  readonly thresholdConfig?: ThresholdConfig | undefined;
  readonly fireCount: number;
  readonly lastFiredAt?: Date | undefined;
  readonly lastFiredCycleId?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AutonomousTriggerProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.name = props.name;
    this.description = props.description;
    this.triggerType = props.triggerType;
    this.status = props.status;
    this.targetObjectiveId = props.targetObjectiveId;
    this.targetInitiativeId = props.targetInitiativeId;
    this.autonomyLevel = props.autonomyLevel;
    this.scheduleConfig = props.scheduleConfig ? Object.freeze({ ...props.scheduleConfig }) : undefined;
    this.eventConfig = props.eventConfig ? Object.freeze({ ...props.eventConfig }) : undefined;
    this.thresholdConfig = props.thresholdConfig ? Object.freeze({ ...props.thresholdConfig }) : undefined;
    this.fireCount = props.fireCount;
    this.lastFiredAt = props.lastFiredAt;
    this.lastFiredCycleId = props.lastFiredCycleId;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateAutonomousTriggerProps, now = new Date()): AutonomousTrigger {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new AutonomousRuntimeValidationError("AutonomousTrigger requires a non-empty id");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new AutonomousRuntimeValidationError("AutonomousTrigger requires a non-empty tenantId");
    }
    if (!props.enterpriseId || typeof props.enterpriseId !== "string" || !props.enterpriseId.trim()) {
      throw new AutonomousRuntimeValidationError("AutonomousTrigger requires a non-empty enterpriseId");
    }
    if (!props.name || typeof props.name !== "string" || !props.name.trim()) {
      throw new AutonomousRuntimeValidationError("AutonomousTrigger requires a non-empty name");
    }

    let scheduleConfig: ScheduleConfig | undefined = undefined;
    if (props.triggerType === "SCHEDULED") {
      if (!props.scheduleConfig || typeof props.scheduleConfig.intervalMs !== "number" || props.scheduleConfig.intervalMs < 1000) {
        throw new AutonomousRuntimeValidationError("SCHEDULED trigger requires scheduleConfig with intervalMs >= 1000");
      }
      scheduleConfig = {
        intervalMs: props.scheduleConfig.intervalMs,
        lastFiredAt: undefined,
        nextRunAt: new Date(now.getTime() + props.scheduleConfig.intervalMs),
      };
    }

    if (props.triggerType === "EVENT_DRIVEN") {
      if (!props.eventConfig || !props.eventConfig.sourceEventType || !props.eventConfig.sourceEventType.trim()) {
        throw new AutonomousRuntimeValidationError("EVENT_DRIVEN trigger requires eventConfig with sourceEventType");
      }
    }

    if (props.triggerType === "THRESHOLD") {
      if (!props.thresholdConfig || !props.thresholdConfig.metricId || typeof props.thresholdConfig.thresholdValue !== "number") {
        throw new AutonomousRuntimeValidationError("THRESHOLD trigger requires thresholdConfig with metricId and thresholdValue");
      }
    }

    return new AutonomousTrigger({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      enterpriseId: props.enterpriseId.trim(),
      name: props.name.trim(),
      description: props.description?.trim(),
      triggerType: props.triggerType,
      status: "ENABLED",
      targetObjectiveId: props.targetObjectiveId?.trim(),
      targetInitiativeId: props.targetInitiativeId?.trim(),
      autonomyLevel: props.autonomyLevel ?? "LEVEL_2_GOVERNED_AUTOMATION",
      scheduleConfig,
      eventConfig: props.eventConfig,
      thresholdConfig: props.thresholdConfig,
      fireCount: 0,
      lastFiredAt: undefined,
      lastFiredCycleId: undefined,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: AutonomousTriggerProps): AutonomousTrigger {
    return new AutonomousTrigger(props);
  }

  enable(now = new Date()): AutonomousTrigger {
    let nextRun = this.scheduleConfig?.nextRunAt;
    if (this.triggerType === "SCHEDULED" && this.scheduleConfig) {
      nextRun = new Date(now.getTime() + this.scheduleConfig.intervalMs);
    }

    return new AutonomousTrigger({
      ...this,
      status: "ENABLED",
      scheduleConfig: this.scheduleConfig ? { ...this.scheduleConfig, nextRunAt: nextRun! } : undefined,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  disable(now = new Date()): AutonomousTrigger {
    return new AutonomousTrigger({
      ...this,
      status: "DISABLED",
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  pause(now = new Date()): AutonomousTrigger {
    return new AutonomousTrigger({
      ...this,
      status: "PAUSED",
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  recordFiring(cycleId: string, now = new Date()): AutonomousTrigger {
    let nextRun = this.scheduleConfig?.nextRunAt;
    if (this.triggerType === "SCHEDULED" && this.scheduleConfig) {
      nextRun = new Date(now.getTime() + this.scheduleConfig.intervalMs);
    }

    return new AutonomousTrigger({
      ...this,
      fireCount: this.fireCount + 1,
      lastFiredAt: now,
      lastFiredCycleId: cycleId,
      scheduleConfig: this.scheduleConfig ? { ...this.scheduleConfig, lastFiredAt: now, nextRunAt: nextRun! } : undefined,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: now,
    });
  }

  matchesEvent(eventType: string, payload: Record<string, unknown>): boolean {
    if (this.status !== "ENABLED" || this.triggerType !== "EVENT_DRIVEN" || !this.eventConfig) {
      return false;
    }
    if (this.eventConfig.sourceEventType !== eventType && this.eventConfig.sourceEventType !== "*") {
      return false;
    }
    if (this.eventConfig.filterKey) {
      const val = String(payload[this.eventConfig.filterKey] ?? "");
      if (this.eventConfig.filterValue !== undefined && val !== this.eventConfig.filterValue) {
        return false;
      }
    }
    return true;
  }

  matchesThreshold(metricId: string, currentValue: number): boolean {
    if (this.status !== "ENABLED" || this.triggerType !== "THRESHOLD" || !this.thresholdConfig) {
      return false;
    }
    if (this.thresholdConfig.metricId !== metricId) {
      return false;
    }
    const target = this.thresholdConfig.thresholdValue;
    switch (this.thresholdConfig.operator) {
      case "GREATER_THAN":
        return currentValue > target;
      case "LESS_THAN":
        return currentValue < target;
      case "EQUALS":
        return currentValue === target;
      case "NOT_EQUALS":
        return currentValue !== target;
      default:
        return false;
    }
  }
}
