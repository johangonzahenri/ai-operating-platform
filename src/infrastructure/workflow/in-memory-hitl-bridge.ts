/**
 * AI Operating Platform - In-Memory HITL Bridge Adapter
 * 
 * In-memory reference implementation of HITLBridgePort with audit event emission,
 * tenant isolation, atomic state transitions, replay protection, and SoD enforcement.
 */

import { HITLBridgePort } from "../../application/ports/hitl-bridge-port.js";
import {
  HITLSuspensionRecord,
  CreateHITLSuspensionProps,
  ResumeHITLProps,
  HITLSuspensionNotFoundError,
  HITLTenantMismatchError,
} from "../../domain/workflow/hitl-bridge.js";
import { EventPublisher, event } from "../../domain/events/events.js";

export class InMemoryHITLBridge implements HITLBridgePort {
  private readonly records = new Map<string, HITLSuspensionRecord>();
  private readonly eventPublisher?: EventPublisher;

  constructor(eventPublisher?: EventPublisher) {
    this.eventPublisher = eventPublisher;
  }

  async suspend(props: CreateHITLSuspensionProps): Promise<HITLSuspensionRecord> {
    const record = HITLSuspensionRecord.create(props);
    this.records.set(record.suspensionId, record);

    if (this.eventPublisher) {
      const eventType =
        record.suspensionType === "APPROVAL"
          ? "hitl.approval_required"
          : record.suspensionType === "INPUT"
          ? "hitl.input_required"
          : "hitl.suspended";

      this.eventPublisher.publish(
        event(
          eventType,
          record.traceId ?? record.suspensionId,
          record.suspensionId,
          {
            suspensionId: record.suspensionId,
            tenantId: record.tenantId,
            applicationId: record.applicationId,
            workflowId: record.workflowId,
            workflowInstanceId: record.workflowInstanceId,
            stepId: record.stepId,
            taskId: record.taskId,
            executionId: record.executionId,
            suspensionType: record.suspensionType,
            reason: record.reason,
            requestedAction: record.requestedAction,
            requesterPrincipalId: record.requesterPrincipalId,
            producerPrincipalId: record.producerPrincipalId,
            expiresAt: record.expiresAt?.toISOString(),
          }
        )
      );
    }

    return record;
  }

  async resume(props: ResumeHITLProps): Promise<HITLSuspensionRecord> {
    // 1. Find record matching token or retrieve
    // For fast retrieval with token or ID, we search by token
    let existing: HITLSuspensionRecord | undefined;
    for (const rec of this.records.values()) {
      if (rec.resumptionToken === props.resumptionToken) {
        existing = rec;
        break;
      }
    }

    if (!existing) {
      throw new HITLSuspensionNotFoundError(`token:${props.resumptionToken}`);
    }

    if (existing.tenantId !== props.tenantId) {
      throw new HITLTenantMismatchError(props.tenantId, existing.tenantId);
    }

    try {
      const updated = existing.resume(props);
      this.records.set(updated.suspensionId, updated);

      if (this.eventPublisher) {
        const eventType =
          updated.status === "APPROVED"
            ? "hitl.approved"
            : updated.status === "REJECTED"
            ? "hitl.rejected"
            : "hitl.resumed";

        this.eventPublisher.publish(
          event(
            eventType,
            updated.traceId ?? updated.suspensionId,
            updated.suspensionId,
            {
              suspensionId: updated.suspensionId,
              tenantId: updated.tenantId,
              actorPrincipalId: props.actorPrincipalId,
              outcome: updated.resolutionOutcome,
              resolvedAt: updated.resolvedAt?.toISOString(),
              resolutionData: updated.resolutionData,
            }
          )
        );
      }

      return updated;
    } catch (err) {
      if (this.eventPublisher) {
        this.eventPublisher.publish(
          event(
            "hitl.resume_rejected",
            existing.traceId ?? existing.suspensionId,
            existing.suspensionId,
            {
              suspensionId: existing.suspensionId,
              tenantId: props.tenantId,
              actorPrincipalId: props.actorPrincipalId,
              error: (err as Error).message,
            }
          )
        );
      }
      throw err;
    }
  }

  async cancel(
    suspensionId: string,
    tenantId: string,
    actorPrincipalId: string,
    reason?: string
  ): Promise<HITLSuspensionRecord> {
    const existing = this.records.get(suspensionId);
    if (!existing) {
      throw new HITLSuspensionNotFoundError(suspensionId);
    }
    if (existing.tenantId !== tenantId) {
      throw new HITLTenantMismatchError(tenantId, existing.tenantId);
    }

    const cancelled = existing.cancel(actorPrincipalId, reason);
    this.records.set(cancelled.suspensionId, cancelled);

    if (this.eventPublisher) {
      this.eventPublisher.publish(
        event(
          "hitl.cancelled",
          cancelled.traceId ?? cancelled.suspensionId,
          cancelled.suspensionId,
          {
            suspensionId: cancelled.suspensionId,
            tenantId: cancelled.tenantId,
            actorPrincipalId,
            reason,
          }
        )
      );
    }

    return cancelled;
  }

  async getSuspension(suspensionId: string, tenantId: string): Promise<HITLSuspensionRecord | undefined> {
    const record = this.records.get(suspensionId);
    if (!record) return undefined;
    if (record.tenantId !== tenantId) {
      throw new HITLTenantMismatchError(tenantId, record.tenantId);
    }
    return record;
  }

  async listActiveSuspensions(tenantId: string, limit = 100): Promise<readonly HITLSuspensionRecord[]> {
    const list: HITLSuspensionRecord[] = [];
    const now = new Date();

    for (const record of this.records.values()) {
      if (record.tenantId === tenantId && !record.isTerminal()) {
        if (record.isExpired(now)) {
          const expired = record.markExpired();
          this.records.set(expired.suspensionId, expired);
          if (this.eventPublisher) {
            this.eventPublisher.publish(
              event(
                "hitl.expired",
                expired.traceId ?? expired.suspensionId,
                expired.suspensionId,
                { suspensionId: expired.suspensionId, tenantId: expired.tenantId }
              )
            );
          }
        } else {
          list.push(record);
          if (list.length >= limit) break;
        }
      }
    }

    return Object.freeze(list);
  }
}
