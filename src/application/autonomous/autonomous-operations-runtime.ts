/**
 * AI Operating Platform - AutonomousOperationsRuntime
 * 
 * Central coordinator for continuous governed business operations:
 * - Scheduler (controlled timer evaluations, bounded intervals, zero busy loops)
 * - Event-Driven Trigger Dispatcher (Event Bus listener)
 * - Concurrency Control, Claims & Leases (prevents double execution across instances)
 * - Idempotency & Deduplication
 * - Circuit Breaker / Safety Halt
 * - Executive Cycle Governance Integration
 */

import crypto from "node:crypto";
import { AutonomousTrigger, TriggerType, CreateAutonomousTriggerProps } from "../../domain/autonomous/autonomous-trigger.js";
import { RuntimeLease } from "../../domain/autonomous/runtime-lease.js";
import { AutonomousRuntimeState } from "../../domain/autonomous/autonomous-runtime-state.js";
import {
  AutonomousTriggerRepositoryPort,
  RuntimeLeaseRepositoryPort,
  AutonomousRuntimeStateRepositoryPort,
} from "../ports/autonomous-runtime-port.js";
import { ExecutiveOrchestratorService } from "../executive/executive-orchestrator-service.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import {
  AutonomousRuntimeValidationError,
  AutonomousTriggerNotFoundError,
  RuntimeLeaseConflictError,
  RuntimeSafetyHaltError,
  RuntimeUnauthorizedError,
  DuplicateTriggerExecutionError,
} from "../../domain/autonomous/autonomous-runtime-errors.js";
import {
  createAutonomousRuntimeStartedEvent,
  createAutonomousRuntimePausedEvent,
  createAutonomousRuntimeResumedEvent,
  createAutonomousRuntimeStoppedEvent,
  createAutonomousTriggerCreatedEvent,
  createAutonomousTriggerEnabledEvent,
  createAutonomousTriggerDisabledEvent,
  createAutonomousTriggerFiredEvent,
  createAutonomousCycleQueuedEvent,
  createAutonomousSafetyHaltedEvent,
  createRuntimeLeaseAcquiredEvent,
  createRuntimeLeaseReleasedEvent,
} from "../../domain/autonomous/autonomous-events.js";

export interface AutonomousOperationsRuntimeDependencies {
  readonly triggerRepo: AutonomousTriggerRepositoryPort;
  readonly leaseRepo: RuntimeLeaseRepositoryPort;
  readonly stateRepo: AutonomousRuntimeStateRepositoryPort;
  readonly executiveOrchestrator: ExecutiveOrchestratorService;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly eventPublisher?: EventPublisher | undefined;
  readonly runtimeInstanceId?: string | undefined;
  readonly schedulerTickIntervalMs?: number | undefined;
}

export class AutonomousOperationsRuntime {
  private readonly triggerRepo: AutonomousTriggerRepositoryPort;
  private readonly leaseRepo: RuntimeLeaseRepositoryPort;
  private readonly stateRepo: AutonomousRuntimeStateRepositoryPort;
  private readonly executiveOrchestrator: ExecutiveOrchestratorService;
  private readonly policyGateway?: PolicyGateway | undefined;
  private readonly eventPublisher?: EventPublisher | undefined;
  readonly runtimeInstanceId: string;
  private readonly schedulerTickIntervalMs: number;

  private timerHandle?: NodeJS.Timeout | undefined;
  private isProcessingTick = false;
  private isShuttingDown = false;
  private readonly executedWindows = new Set<string>();

  constructor(deps: AutonomousOperationsRuntimeDependencies) {
    this.triggerRepo = deps.triggerRepo;
    this.leaseRepo = deps.leaseRepo;
    this.stateRepo = deps.stateRepo;
    this.executiveOrchestrator = deps.executiveOrchestrator;
    this.policyGateway = deps.policyGateway;
    this.eventPublisher = deps.eventPublisher;
    this.runtimeInstanceId = deps.runtimeInstanceId ?? `runtime_${crypto.randomUUID().slice(0, 8)}`;
    this.schedulerTickIntervalMs = deps.schedulerTickIntervalMs ?? 1000;
  }

  private publish(event: DomainEvent): void {
    if (this.eventPublisher) {
      try {
        this.eventPublisher.publish(event);
      } catch (err) {
        console.error("Failed to publish autonomous runtime event:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 1. LIFECYCLE MANAGEMENT (START / STOP / PAUSE / RESUME)
  // ---------------------------------------------------------------------------

  async start(tenantId: string, traceId = "trace-runtime-start"): Promise<AutonomousRuntimeState> {
    let state = await this.stateRepo.findByTenant(tenantId);
    if (!state) {
      state = AutonomousRuntimeState.create({ tenantId, runtimeInstanceId: this.runtimeInstanceId });
    }

    if (state.status === "RUNNING") {
      return state;
    }

    state = state.start(this.runtimeInstanceId);
    await this.stateRepo.save(state);

    this.publish(createAutonomousRuntimeStartedEvent(tenantId, this.runtimeInstanceId, traceId));

    if (!this.timerHandle && !this.isShuttingDown) {
      this.timerHandle = setInterval(() => {
        this.onSchedulerTick(tenantId).catch((err) => {
          console.error(`Scheduler tick error for tenant ${tenantId}:`, err);
        });
      }, this.schedulerTickIntervalMs);
    }

    return state;
  }

  async pause(tenantId: string, traceId = "trace-runtime-pause"): Promise<AutonomousRuntimeState> {
    let state = await this.stateRepo.findByTenant(tenantId);
    if (!state) throw new AutonomousRuntimeValidationError(`Runtime state for tenant '${tenantId}' not found`);

    if (state.status === "PAUSED") {
      return state;
    }

    state = state.pause();
    await this.stateRepo.save(state);

    this.publish(createAutonomousRuntimePausedEvent(tenantId, traceId));
    return state;
  }

  async resume(tenantId: string, traceId = "trace-runtime-resume"): Promise<AutonomousRuntimeState> {
    let state = await this.stateRepo.findByTenant(tenantId);
    if (!state) throw new AutonomousRuntimeValidationError(`Runtime state for tenant '${tenantId}' not found`);

    if (state.status === "RUNNING") {
      return state;
    }

    state = state.resume();
    await this.stateRepo.save(state);

    this.publish(createAutonomousRuntimeResumedEvent(tenantId, traceId));
    return state;
  }

  async stop(tenantId: string, traceId = "trace-runtime-stop"): Promise<AutonomousRuntimeState> {
    this.isShuttingDown = true;
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = undefined;
    }

    let state = await this.stateRepo.findByTenant(tenantId);
    if (state && state.status !== "STOPPED") {
      state = state.stop();
      await this.stateRepo.save(state);
    }

    // Release all active leases held by this instance
    await this.leaseRepo.clearExpired(tenantId, new Date(Date.now() + 86400000));

    this.publish(createAutonomousRuntimeStoppedEvent(tenantId, traceId));
    this.isShuttingDown = false;
    return state ?? AutonomousRuntimeState.create({ tenantId });
  }

  async getRuntimeState(tenantId: string): Promise<AutonomousRuntimeState> {
    const state = await this.stateRepo.findByTenant(tenantId);
    if (!state) {
      return AutonomousRuntimeState.create({ tenantId, runtimeInstanceId: this.runtimeInstanceId });
    }
    return state;
  }

  // ---------------------------------------------------------------------------
  // 2. TRIGGER MANAGEMENT
  // ---------------------------------------------------------------------------

  async createTrigger(
    props: CreateAutonomousTriggerProps,
    traceId = "trace-trigger-create"
  ): Promise<AutonomousTrigger> {
    const trigger = AutonomousTrigger.create(props);
    await this.triggerRepo.save(trigger);
    this.publish(createAutonomousTriggerCreatedEvent(trigger.id, trigger.tenantId, trigger.triggerType, traceId));
    return trigger;
  }

  async enableTrigger(
    triggerId: string,
    tenantId: string,
    traceId = "trace-trigger-enable"
  ): Promise<AutonomousTrigger> {
    let trigger = await this.triggerRepo.findById(triggerId, tenantId);
    if (!trigger) throw new AutonomousTriggerNotFoundError(triggerId, tenantId);

    trigger = trigger.enable();
    await this.triggerRepo.save(trigger);
    this.publish(createAutonomousTriggerEnabledEvent(trigger.id, tenantId, traceId));
    return trigger;
  }

  async disableTrigger(
    triggerId: string,
    tenantId: string,
    traceId = "trace-trigger-disable"
  ): Promise<AutonomousTrigger> {
    let trigger = await this.triggerRepo.findById(triggerId, tenantId);
    if (!trigger) throw new AutonomousTriggerNotFoundError(triggerId, tenantId);

    trigger = trigger.disable();
    await this.triggerRepo.save(trigger);
    this.publish(createAutonomousTriggerDisabledEvent(trigger.id, tenantId, traceId));
    return trigger;
  }

  async listTriggers(tenantId: string, enterpriseId?: string): Promise<readonly AutonomousTrigger[]> {
    if (enterpriseId) {
      return this.triggerRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.triggerRepo.listByTenant(tenantId);
  }

  async getTrigger(triggerId: string, tenantId: string): Promise<AutonomousTrigger> {
    const trigger = await this.triggerRepo.findById(triggerId, tenantId);
    if (!trigger) throw new AutonomousTriggerNotFoundError(triggerId, tenantId);
    return trigger;
  }

  // ---------------------------------------------------------------------------
  // 3. SCHEDULER EVALUATION LOOP & TICK
  // ---------------------------------------------------------------------------

  async onSchedulerTick(tenantId: string, now = new Date()): Promise<void> {
    if (this.isProcessingTick || this.isShuttingDown) return;
    this.isProcessingTick = true;

    try {
      const state = await this.stateRepo.findByTenant(tenantId);
      if (!state || state.status !== "RUNNING") {
        return;
      }

      // Heartbeat
      await this.stateRepo.save(state.heartbeat(now));

      const activeTriggers = await this.triggerRepo.listActive(tenantId);
      for (const trigger of activeTriggers) {
        if (trigger.triggerType === "SCHEDULED" && trigger.scheduleConfig) {
          if (now.getTime() >= trigger.scheduleConfig.nextRunAt.getTime()) {
            const windowKey = `${trigger.id}::${Math.floor(trigger.scheduleConfig.nextRunAt.getTime() / 1000)}`;
            if (this.executedWindows.has(windowKey)) continue;

            await this.fireTrigger(trigger, { windowKey }, `trace-sched-${trigger.id}-${Date.now()}`);
          }
        }
      }
    } finally {
      this.isProcessingTick = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. EVENT-DRIVEN INGESTION & THRESHOLD DISPATCH
  // ---------------------------------------------------------------------------

  async handleDomainEvent(event: DomainEvent): Promise<void> {
    const tenantId = (event.payload?.tenantId as string) || (event.payload?.tenant_id as string);
    if (!tenantId) return; // Strict isolation: omit events without tenant context

    const state = await this.stateRepo.findByTenant(tenantId);
    if (!state || state.status !== "RUNNING") return;

    const activeTriggers = await this.triggerRepo.listActive(tenantId);
    for (const trigger of activeTriggers) {
      if (trigger.matchesEvent(event.type, event.payload as Record<string, unknown>)) {
        const eventWindowKey = `${trigger.id}::event_${event.id}`;
        if (this.executedWindows.has(eventWindowKey)) continue;

        await this.fireTrigger(trigger, { eventId: event.id, eventPayload: event.payload }, event.traceId);
      }

      // Threshold matching for metric updates
      if (event.type === "metric.updated" && trigger.triggerType === "THRESHOLD") {
        const metricId = event.payload?.metricId as string;
        const val = Number(event.payload?.value ?? event.payload?.currentValue ?? 0);
        if (metricId && trigger.matchesThreshold(metricId, val)) {
          const thresholdWindowKey = `${trigger.id}::thresh_${metricId}_${Date.now()}`;
          await this.fireTrigger(trigger, { metricId, value: val }, event.traceId);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. GOVERNED EXECUTION & LEASE CLAIM
  // ---------------------------------------------------------------------------

  async fireTrigger(
    trigger: AutonomousTrigger,
    contextInfo: { windowKey?: string; eventId?: string; metricId?: string; [key: string]: unknown } = {},
    traceId = "trace-autonomous-fire"
  ): Promise<{ cycle: any; lease: RuntimeLease }> {
    const tenantId = trigger.tenantId;

    // A. Check Runtime State & Circuit Breaker
    let state = await this.stateRepo.findByTenant(tenantId);
    if (state && state.status === "SAFETY_HALTED") {
      throw new RuntimeSafetyHaltError(tenantId, state.consecutiveFailureCount, state.safetyHaltReason ?? "Safety halted");
    }
    if (state && state.status !== "RUNNING" && state.status !== "STOPPED") {
      throw new AutonomousRuntimeValidationError(`Cannot fire trigger while runtime is in '${state.status}' state`);
    }

    // B. Concurrency Claim / Lease
    const resourceKey = `trig_${trigger.id}_${trigger.enterpriseId}`;
    const leaseId = `lease_${trigger.id}_${Date.now()}`;
    const lease = RuntimeLease.create({
      leaseId,
      resourceId: resourceKey,
      tenantId,
      ownerRuntimeId: this.runtimeInstanceId,
      ttlMs: 30000,
    });

    const acquired = await this.leaseRepo.acquire(lease);
    if (!acquired) {
      const existing = await this.leaseRepo.findByResource(resourceKey, tenantId);
      throw new RuntimeLeaseConflictError(resourceKey, existing?.ownerRuntimeId ?? "unknown", this.runtimeInstanceId);
    }
    this.publish(createRuntimeLeaseAcquiredEvent(lease.leaseId, resourceKey, tenantId, this.runtimeInstanceId, traceId));

    if (contextInfo.windowKey) this.executedWindows.add(contextInfo.windowKey);
    if (contextInfo.eventId) this.executedWindows.add(`${trigger.id}::event_${contextInfo.eventId}`);

    // C. Dispatch Executive Cycle
    const cycleId = `cycle_auto_${trigger.id}_${Date.now()}`;
    if (state) {
      state = state.registerCycleStarted(cycleId);
      await this.stateRepo.save(state);
    }

    try {
      this.publish(createAutonomousTriggerFiredEvent(trigger.id, tenantId, cycleId, traceId));
      this.publish(createAutonomousCycleQueuedEvent(cycleId, trigger.id, tenantId, traceId));

      const startResult = await this.executiveOrchestrator.startCycle({
        id: cycleId,
        tenantId,
        enterpriseId: trigger.enterpriseId,
        autonomyLevel: trigger.autonomyLevel,
      }, traceId);

      // Record trigger success firing
      const updatedTrigger = trigger.recordFiring(cycleId);
      await this.triggerRepo.save(updatedTrigger);

      if (state) {
        state = state.registerCycleSuccess(cycleId);
        await this.stateRepo.save(state);
      }

      return { cycle: startResult.cycle, lease };
    } catch (err: any) {
      if (state) {
        state = state.registerCycleFailure(cycleId, err.message ?? "Executive cycle execution failed");
        await this.stateRepo.save(state);
        if (state.status === "SAFETY_HALTED") {
          this.publish(createAutonomousSafetyHaltedEvent(tenantId, state.safetyHaltReason!, state.consecutiveFailureCount, traceId));
        }
      }
      throw err;
    } finally {
      // Release lease
      await this.leaseRepo.release(resourceKey, this.runtimeInstanceId, tenantId);
      this.publish(createRuntimeLeaseReleasedEvent(lease.leaseId, resourceKey, tenantId, traceId));
    }
  }

  // ---------------------------------------------------------------------------
  // 6. CRASH RECOVERY & RECONCILIATION
  // ---------------------------------------------------------------------------

  async reconcileState(tenantId: string, now = new Date()): Promise<{ clearedLeases: number; runtimeStatus: string }> {
    const cleared = await this.leaseRepo.clearExpired(tenantId, now);
    let state = await this.stateRepo.findByTenant(tenantId);
    if (!state) {
      state = AutonomousRuntimeState.create({ tenantId, runtimeInstanceId: this.runtimeInstanceId }, now);
      await this.stateRepo.save(state);
    } else if (state.status === "RUNNING") {
      // Clean up orphaned cycle claims
      state = state.stop(now);
      await this.stateRepo.save(state);
    }

    return { clearedLeases: cleared, runtimeStatus: state.status };
  }
}
