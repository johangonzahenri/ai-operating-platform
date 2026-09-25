/**
 * AI Operating Platform - HITL Bridge Port
 * 
 * Formal application port defining asynchronous suspension, querying, and resumption
 * of workflows / agent actions requiring Human-In-The-Loop evaluation.
 */

import {
  HITLSuspensionRecord,
  CreateHITLSuspensionProps,
  ResumeHITLProps,
} from "../../domain/workflow/hitl-bridge.js";

export interface HITLBridgePort {
  /**
   * Suspends an execution / workflow step, persisting the record and returning it.
   */
  suspend(props: CreateHITLSuspensionProps): Promise<HITLSuspensionRecord>;

  /**
   * Resumes a suspended HITL record using token, enforcing SoD and expiration.
   */
  resume(props: ResumeHITLProps): Promise<HITLSuspensionRecord>;

  /**
   * Cancels a pending suspension.
   */
  cancel(suspensionId: string, tenantId: string, actorPrincipalId: string, reason?: string): Promise<HITLSuspensionRecord>;

  /**
   * Retrieves a suspension by ID strictly within tenant boundary.
   */
  getSuspension(suspensionId: string, tenantId: string): Promise<HITLSuspensionRecord | undefined>;

  /**
   * Lists active suspensions for a tenant.
   */
  listActiveSuspensions(tenantId: string, limit?: number): Promise<readonly HITLSuspensionRecord[]>;
}
