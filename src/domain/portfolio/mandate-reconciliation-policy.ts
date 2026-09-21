/**
 * AI Operating Platform - Mandate Reconciliation Policy
 * 
 * Formal, deterministic decision matrix for reconciling in-flight, pending,
 * and historical operations when an EnterpriseGovernanceMandate is modified,
 * expired, revoked, or scoped down.
 * 
 * INVARIANTS:
 * 1. Historical Truth: COMPLETED operations are NEVER modified retroactively.
 * 2. Fail-Closed: Ambiguous, expired, or revoked mandates result in PAUSE, CANCEL, or REAUTHORIZATION_REQUIRED.
 * 3. Default Deny: Cross-enterprise operations lacking an active, valid mandate are DENIED.
 * 4. Deterministic: Given identical mandate state and resource state, the outcome is strictly identical (0 LLM inference).
 */

import { AutonomyLevel } from "../business/autonomy-level.js";
import { EnterpriseGovernanceMandate } from "./governance-mandate.js";

export type ReconciliationTriggerType =
  | "MANDATE_EXPIRED"
  | "MANDATE_REVOKED"
  | "MANDATE_CANCELLED"
  | "MANDATE_SUSPENDED"
  | "MANDATE_SCOPE_REDUCED"
  | "MANDATE_AUTONOMY_REDUCED"
  | "MANDATE_OPERATION_REMOVED"
  | "PERIODIC_AUDIT";

export type ReconciliationAction =
  | "CONTINUE"
  | "PAUSE"
  | "CANCEL"
  | "REJECT_APPROVAL"
  | "REAUTHORIZATION_REQUIRED"
  | "NO_OP";

export type ReconcilableEntityType =
  | "WORKFLOW_INSTANCE"
  | "WORKFLOW_STEP"
  | "APPROVAL_REQUEST"
  | "AUTONOMOUS_OPERATION"
  | "TASK"
  | "EXECUTION";

export interface ReconciliationEvaluationCriteria {
  readonly triggerType: ReconciliationTriggerType;
  readonly entityType: ReconcilableEntityType;
  readonly entityId: string;
  readonly currentStatus: string;
  readonly sourceEnterpriseId: string;
  readonly targetEnterpriseId: string;
  readonly operation?: string | undefined;
  readonly objectiveId?: string | undefined;
  readonly requestedAutonomy?: AutonomyLevel | undefined;
  readonly atDate?: Date | undefined;
}

export interface ReconciliationDecision {
  readonly entityType: ReconcilableEntityType;
  readonly entityId: string;
  readonly action: ReconciliationAction;
  readonly targetStatus?: string | undefined;
  readonly reason: string;
  readonly requiresHumanApproval: boolean;
  readonly isTerminalState: boolean;
}

/**
 * Deterministically evaluates the reconciliation action for a given entity
 * under the current state of the governing mandate.
 */
export function evaluateMandateReconciliation(
  criteria: ReconciliationEvaluationCriteria,
  mandate?: EnterpriseGovernanceMandate | undefined
): ReconciliationDecision {
  const atDate = criteria.atDate ?? new Date();
  const currentStatus = criteria.currentStatus.toUpperCase();

  // 1. Terminal / Historical States Invariant: NO RETROACTIVE MUTATION
  const terminalStatuses = ["COMPLETED", "FAILED", "CANCELLED", "REJECTED", "EXPIRED", "BUDGET_EXHAUSTED"];
  if (terminalStatuses.includes(currentStatus)) {
    return {
      entityType: criteria.entityType,
      entityId: criteria.entityId,
      action: "NO_OP",
      targetStatus: currentStatus,
      reason: `Historical entity in terminal state '${currentStatus}' is immutable; no retroactive change applied`,
      requiresHumanApproval: false,
      isTerminalState: true,
    };
  }

  // 2. Same-Enterprise Operations: Not governed by cross-enterprise mandate
  if (criteria.sourceEnterpriseId === criteria.targetEnterpriseId) {
    return {
      entityType: criteria.entityType,
      entityId: criteria.entityId,
      action: "CONTINUE",
      targetStatus: currentStatus,
      reason: "Same-enterprise execution is governed by enterprise-local policies; mandate changes do not invalidate it",
      requiresHumanApproval: false,
      isTerminalState: false,
    };
  }

  // 3. Cross-Enterprise Missing / Deleted Mandate: FAIL CLOSED -> CANCEL
  if (!mandate) {
    return {
      entityType: criteria.entityType,
      entityId: criteria.entityId,
      action: "CANCEL",
      targetStatus: "CANCELLED",
      reason: "Governing cross-enterprise mandate not found or completely revoked; operation is cancelled (fail-closed)",
      requiresHumanApproval: false,
      isTerminalState: false,
    };
  }

  // 4. Mandate Revoked or Cancelled Trigger:
  if (
    criteria.triggerType === "MANDATE_REVOKED" ||
    criteria.triggerType === "MANDATE_CANCELLED" ||
    mandate.status === "REVOKED"
  ) {
    // Queued / Pending / Submitting / Created
    if (["PENDING", "QUEUED", "CREATED", "SUBMITTED"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "CANCEL",
        targetStatus: "CANCELLED",
        reason: `Mandate '${mandate.id}' is revoked/cancelled; pending work is cancelled before execution`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }

    // In-flight Running
    if (["RUNNING", "DISPATCHED", "ASSIGNING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "CANCEL",
        targetStatus: "CANCELLED",
        reason: `Mandate '${mandate.id}' is revoked/cancelled; in-flight execution is cancelled safely`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }

    // Paused / Waiting
    if (["PAUSED", "WAITING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "CANCEL",
        targetStatus: "CANCELLED",
        reason: `Mandate '${mandate.id}' is revoked/cancelled; paused execution cannot be resumed and is cancelled`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }

    // Approval Request
    if (criteria.entityType === "APPROVAL_REQUEST" || ["REQUESTED", "REVIEWING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "REJECT_APPROVAL",
        targetStatus: "REJECTED",
        reason: `Mandate '${mandate.id}' is revoked/cancelled; pending approval request is rejected`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }
  }

  // 5. Mandate Expired Trigger:
  if (
    criteria.triggerType === "MANDATE_EXPIRED" ||
    mandate.status === "EXPIRED" ||
    (mandate.validTo && atDate > mandate.validTo)
  ) {
    if (["PENDING", "QUEUED", "CREATED", "SUBMITTED"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "CANCEL",
        targetStatus: "CANCELLED",
        reason: `Mandate '${mandate.id}' has expired; pending work is cancelled`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }

    if (["RUNNING", "DISPATCHED", "ASSIGNING"].includes(currentStatus)) {
      // In-flight running work under expired mandate is safely paused for re-evaluation / reauthorization
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "PAUSE",
        targetStatus: "PAUSED",
        reason: `Mandate '${mandate.id}' expired during execution; execution safely paused for governance renewal`,
        requiresHumanApproval: true,
        isTerminalState: false,
      };
    }

    if (["PAUSED", "WAITING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "REAUTHORIZATION_REQUIRED",
        targetStatus: "PAUSED",
        reason: `Mandate '${mandate.id}' has expired; cannot resume until reauthorization / renewed mandate is provided`,
        requiresHumanApproval: true,
        isTerminalState: false,
      };
    }

    if (criteria.entityType === "APPROVAL_REQUEST" || ["REQUESTED", "REVIEWING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "REJECT_APPROVAL",
        targetStatus: "EXPIRED",
        reason: `Mandate '${mandate.id}' expired; pending approval request is expired`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }
  }

  // 6. Detailed Scope, Autonomy & Operation Authority Evaluation:
  const authorityCheck = mandate.evaluateAuthority({
    targetEnterpriseId: criteria.targetEnterpriseId,
    operation: criteria.operation ?? "*",
    objectiveId: criteria.objectiveId,
    requestedAutonomy: criteria.requestedAutonomy,
    atDate,
  });

  if (!authorityCheck.allowed) {
    // Operation no longer allowed by mandate scope/autonomy limits
    if (["PENDING", "QUEUED", "CREATED", "SUBMITTED"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "CANCEL",
        targetStatus: "CANCELLED",
        reason: `Operation rejected by modified mandate authority: ${authorityCheck.reason ?? "Scope or autonomy violation"}`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }

    if (["RUNNING", "DISPATCHED", "ASSIGNING"].includes(currentStatus)) {
      const action = criteria.triggerType === "MANDATE_AUTONOMY_REDUCED" ? "REAUTHORIZATION_REQUIRED" : "PAUSE";
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action,
        targetStatus: "PAUSED",
        reason: `In-flight step paused due to mandate restriction: ${authorityCheck.reason ?? "Scope or autonomy reduced"}`,
        requiresHumanApproval: true,
        isTerminalState: false,
      };
    }

    if (["PAUSED", "WAITING"].includes(currentStatus)) {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "REAUTHORIZATION_REQUIRED",
        targetStatus: "PAUSED",
        reason: `Paused step requires reauthorization: ${authorityCheck.reason ?? "Scope or autonomy reduced"}`,
        requiresHumanApproval: true,
        isTerminalState: false,
      };
    }

    if (criteria.entityType === "APPROVAL_REQUEST") {
      return {
        entityType: criteria.entityType,
        entityId: criteria.entityId,
        action: "REJECT_APPROVAL",
        targetStatus: "REJECTED",
        reason: `Approval request rejected because underlying mandate authority changed: ${authorityCheck.reason}`,
        requiresHumanApproval: false,
        isTerminalState: false,
      };
    }
  }

  // 7. If still authorized but requires approval (e.g. autonomy reduced to level requiring oversight)
  if (authorityCheck.requiresApproval && !["COMPLETED", "FAILED", "CANCELLED"].includes(currentStatus)) {
    return {
      entityType: criteria.entityType,
      entityId: criteria.entityId,
      action: "REAUTHORIZATION_REQUIRED",
      targetStatus: currentStatus === "RUNNING" ? "PAUSED" : currentStatus,
      reason: "Mandate evaluation requires explicit human oversight for this operation/autonomy level",
      requiresHumanApproval: true,
      isTerminalState: false,
    };
  }

  // 8. Otherwise: Fully valid & authorized -> CONTINUE
  return {
    entityType: criteria.entityType,
    entityId: criteria.entityId,
    action: "CONTINUE",
    targetStatus: currentStatus,
    reason: "Mandate is active and fully authorizes the operation",
    requiresHumanApproval: false,
    isTerminalState: false,
  };
}
