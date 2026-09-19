/**
 * AI Operating Platform - Autonomous Events Factory
 * 
 * Factory functions creating typed DomainEvents for the Autonomous Operations Runtime.
 */

import { DomainEvent, event } from "../events/events.js";

export function createAutonomousRuntimeStartedEvent(
  tenantId: string,
  runtimeInstanceId: string,
  traceId = "trace-autonomous-runtime"
): DomainEvent {
  return event(
    "autonomous.runtime.started" as any,
    traceId,
    tenantId,
    { tenantId, runtimeInstanceId, action: "STARTED" }
  );
}

export function createAutonomousRuntimePausedEvent(
  tenantId: string,
  traceId = "trace-autonomous-runtime"
): DomainEvent {
  return event(
    "autonomous.runtime.paused" as any,
    traceId,
    tenantId,
    { tenantId, action: "PAUSED" }
  );
}

export function createAutonomousRuntimeResumedEvent(
  tenantId: string,
  traceId = "trace-autonomous-runtime"
): DomainEvent {
  return event(
    "autonomous.runtime.resumed" as any,
    traceId,
    tenantId,
    { tenantId, action: "RESUMED" }
  );
}

export function createAutonomousRuntimeStoppedEvent(
  tenantId: string,
  traceId = "trace-autonomous-runtime"
): DomainEvent {
  return event(
    "autonomous.runtime.stopped" as any,
    traceId,
    tenantId,
    { tenantId, action: "STOPPED" }
  );
}

export function createAutonomousTriggerCreatedEvent(
  triggerId: string,
  tenantId: string,
  triggerType: string,
  traceId = "trace-autonomous-trigger"
): DomainEvent {
  return event(
    "autonomous.trigger.created" as any,
    traceId,
    triggerId,
    { triggerId, tenantId, triggerType }
  );
}

export function createAutonomousTriggerEnabledEvent(
  triggerId: string,
  tenantId: string,
  traceId = "trace-autonomous-trigger"
): DomainEvent {
  return event(
    "autonomous.trigger.enabled" as any,
    traceId,
    triggerId,
    { triggerId, tenantId }
  );
}

export function createAutonomousTriggerDisabledEvent(
  triggerId: string,
  tenantId: string,
  traceId = "trace-autonomous-trigger"
): DomainEvent {
  return event(
    "autonomous.trigger.disabled" as any,
    traceId,
    triggerId,
    { triggerId, tenantId }
  );
}

export function createAutonomousTriggerFiredEvent(
  triggerId: string,
  tenantId: string,
  cycleId: string,
  traceId = "trace-autonomous-trigger"
): DomainEvent {
  return event(
    "autonomous.trigger.fired" as any,
    traceId,
    triggerId,
    { triggerId, tenantId, cycleId }
  );
}

export function createAutonomousCycleQueuedEvent(
  cycleId: string,
  triggerId: string,
  tenantId: string,
  traceId = "trace-autonomous-cycle"
): DomainEvent {
  return event(
    "autonomous.cycle.queued" as any,
    traceId,
    cycleId,
    { cycleId, triggerId, tenantId }
  );
}

export function createAutonomousSafetyHaltedEvent(
  tenantId: string,
  reason: string,
  consecutiveFailures: number,
  traceId = "trace-autonomous-safety"
): DomainEvent {
  return event(
    "autonomous.safety.halted" as any,
    traceId,
    tenantId,
    { tenantId, reason, consecutiveFailures }
  );
}

export function createRuntimeLeaseAcquiredEvent(
  leaseId: string,
  resourceId: string,
  tenantId: string,
  ownerRuntimeId: string,
  traceId = "trace-autonomous-lease"
): DomainEvent {
  return event(
    "autonomous.lease.acquired" as any,
    traceId,
    leaseId,
    { leaseId, resourceId, tenantId, ownerRuntimeId }
  );
}

export function createRuntimeLeaseReleasedEvent(
  leaseId: string,
  resourceId: string,
  tenantId: string,
  traceId = "trace-autonomous-lease"
): DomainEvent {
  return event(
    "autonomous.lease.released" as any,
    traceId,
    leaseId,
    { leaseId, resourceId, tenantId }
  );
}
