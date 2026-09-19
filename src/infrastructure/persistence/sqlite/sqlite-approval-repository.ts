import { DatabaseSync, StatementSync } from "node:sqlite";
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalAuthority,
} from "../../../domain/workflow/approval-request.js";
import { ApprovalConcurrencyConflictError } from "../../../domain/workflow/approval-errors.js";
import {
  ApprovalFilterCriteria,
  ApprovalRequestRepositoryPort,
} from "../../../application/ports/approval-repository-port.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { MembershipRole } from "../../../domain/organization/agent-membership.js";

interface ApprovalRequestRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly workflow_id: string;
  readonly workflow_instance_id: string;
  readonly workflow_step_id: string;
  readonly task_id: string | null;
  readonly execution_id: string | null;
  readonly verification_result_id: string | null;
  readonly requester_principal_id: string;
  readonly producer_principal_id: string | null;
  readonly reviewer_principal_id: string | null;
  readonly approver_principal_id: string | null;
  readonly purpose: string;
  readonly required_authority_json: string | null;
  readonly required_role: string | null;
  readonly status: string;
  readonly decision_reason: string | null;
  readonly decision_metadata_json: string | null;
  readonly escalation_target: string | null;
  readonly expires_at: string | null;
  readonly decided_at: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteApprovalRequestRepository implements ApprovalRequestRepositoryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectByIdStmt: StatementSync;
  private readonly selectByInstanceStmt: StatementSync;
  private readonly selectByStepStmt: StatementSync;
  private readonly selectByExecutionStmt: StatementSync;
  private readonly insertStmt: StatementSync;
  private readonly updateStmt: StatementSync;
  private readonly deleteStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb);
    }
    this.db = this.dbManager.open();

    this.initSchema();

    this.selectByIdStmt = this.db.prepare(
      "SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?;"
    );
    this.selectByInstanceStmt = this.db.prepare(
      "SELECT * FROM approval_requests WHERE workflow_instance_id = ? AND tenant_id = ? ORDER BY created_at ASC;"
    );
    this.selectByStepStmt = this.db.prepare(
      "SELECT * FROM approval_requests WHERE workflow_instance_id = ? AND workflow_step_id = ? AND tenant_id = ? ORDER BY created_at ASC;"
    );
    this.selectByExecutionStmt = this.db.prepare(
      "SELECT * FROM approval_requests WHERE execution_id = ? AND tenant_id = ? ORDER BY created_at ASC;"
    );
    this.insertStmt = this.db.prepare(`
      INSERT INTO approval_requests (
        id, tenant_id, workflow_id, workflow_instance_id, workflow_step_id,
        task_id, execution_id, verification_result_id, requester_principal_id,
        producer_principal_id, reviewer_principal_id, approver_principal_id,
        purpose, required_authority_json, required_role, status,
        decision_reason, decision_metadata_json, escalation_target,
        expires_at, decided_at, version, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?
      );
    `);
    this.updateStmt = this.db.prepare(`
      UPDATE approval_requests SET
        reviewer_principal_id = ?,
        approver_principal_id = ?,
        status = ?,
        decision_reason = ?,
        decision_metadata_json = ?,
        escalation_target = ?,
        decided_at = ?,
        version = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ? AND version = ?;
    `);
    this.deleteStmt = this.db.prepare(
      "DELETE FROM approval_requests WHERE id = ? AND tenant_id = ?;"
    );
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_instance_id TEXT NOT NULL,
        workflow_step_id TEXT NOT NULL,
        task_id TEXT,
        execution_id TEXT,
        verification_result_id TEXT,
        requester_principal_id TEXT NOT NULL,
        producer_principal_id TEXT,
        reviewer_principal_id TEXT,
        approver_principal_id TEXT,
        purpose TEXT NOT NULL,
        required_authority_json TEXT,
        required_role TEXT,
        status TEXT NOT NULL,
        decision_reason TEXT,
        decision_metadata_json TEXT,
        escalation_target TEXT,
        expires_at TEXT,
        decided_at TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_approval_tenant ON approval_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_instance ON approval_requests(workflow_instance_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_step ON approval_requests(workflow_instance_id, workflow_step_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_approval_expires ON approval_requests(expires_at, status);
    `);
  }

  async save(approval: ApprovalRequest): Promise<ApprovalRequest> {
    const existingRow = this.selectByIdStmt.get(approval.id, approval.tenantId) as
      | ApprovalRequestRow
      | undefined;

    if (!existingRow) {
      this.insertStmt.run(
        approval.id,
        approval.tenantId,
        approval.workflowId,
        approval.workflowInstanceId,
        approval.workflowStepId,
        approval.taskId ?? null,
        approval.executionId ?? null,
        approval.verificationResultId ?? null,
        approval.requesterPrincipalId,
        approval.producerPrincipalId ?? null,
        approval.reviewerPrincipalId ?? null,
        approval.approverPrincipalId ?? null,
        approval.purpose,
        approval.requiredAuthority ? JSON.stringify(approval.requiredAuthority) : null,
        approval.requiredRole ?? null,
        approval.status,
        approval.decisionReason ?? null,
        approval.decisionMetadata ? JSON.stringify(approval.decisionMetadata) : null,
        approval.escalationTarget ?? null,
        approval.expiresAt ? approval.expiresAt.toISOString() : null,
        approval.decidedAt ? approval.decidedAt.toISOString() : null,
        approval.version,
        approval.createdAt.toISOString(),
        approval.updatedAt.toISOString()
      );
      return approval;
    }

    const previousVersion = approval.version - 1;
    const result = this.updateStmt.run(
      approval.reviewerPrincipalId ?? null,
      approval.approverPrincipalId ?? null,
      approval.status,
      approval.decisionReason ?? null,
      approval.decisionMetadata ? JSON.stringify(approval.decisionMetadata) : null,
      approval.escalationTarget ?? null,
      approval.decidedAt ? approval.decidedAt.toISOString() : null,
      approval.version,
      approval.updatedAt.toISOString(),
      approval.id,
      approval.tenantId,
      previousVersion
    );

    if (result.changes === 0) {
      throw new ApprovalConcurrencyConflictError(approval.id, previousVersion, existingRow.version);
    }

    return approval;
  }

  async findById(id: string, tenantId: string): Promise<ApprovalRequest | null> {
    const row = this.selectByIdStmt.get(id, tenantId) as ApprovalRequestRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  async findByInstanceId(instanceId: string, tenantId: string): Promise<readonly ApprovalRequest[]> {
    const rows = this.selectByInstanceStmt.all(instanceId, tenantId) as unknown as ApprovalRequestRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async findByStepId(
    instanceId: string,
    stepId: string,
    tenantId: string
  ): Promise<readonly ApprovalRequest[]> {
    const rows = this.selectByStepStmt.all(instanceId, stepId, tenantId) as unknown as ApprovalRequestRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async findByExecutionId(executionId: string, tenantId: string): Promise<readonly ApprovalRequest[]> {
    const rows = this.selectByExecutionStmt.all(executionId, tenantId) as unknown as ApprovalRequestRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async findAll(
    criteria: ApprovalFilterCriteria,
    limit = 50,
    offset = 0
  ): Promise<readonly ApprovalRequest[]> {
    const clauses: string[] = ["tenant_id = ?"];
    const params: unknown[] = [criteria.tenantId];

    if (criteria.workflowId) {
      clauses.push("workflow_id = ?");
      params.push(criteria.workflowId);
    }
    if (criteria.workflowInstanceId) {
      clauses.push("workflow_instance_id = ?");
      params.push(criteria.workflowInstanceId);
    }
    if (criteria.workflowStepId) {
      clauses.push("workflow_step_id = ?");
      params.push(criteria.workflowStepId);
    }
    if (criteria.status) {
      clauses.push("status = ?");
      params.push(criteria.status);
    }
    if (criteria.requesterPrincipalId) {
      clauses.push("requester_principal_id = ?");
      params.push(criteria.requesterPrincipalId);
    }
    if (criteria.reviewerPrincipalId) {
      clauses.push("reviewer_principal_id = ?");
      params.push(criteria.reviewerPrincipalId);
    }
    if (criteria.approverPrincipalId) {
      clauses.push("approver_principal_id = ?");
      params.push(criteria.approverPrincipalId);
    }

    params.push(limit, offset);

    const query = `
      SELECT * FROM approval_requests
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?;
    `;

    const rows = this.db.prepare(query).all(...(params as any)) as unknown as ApprovalRequestRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async findPendingExpired(tenantId: string, now: Date = new Date()): Promise<readonly ApprovalRequest[]> {
    const query = `
      SELECT * FROM approval_requests
      WHERE tenant_id = ?
        AND status IN ('REQUESTED', 'REVIEWING')
        AND expires_at IS NOT NULL
        AND expires_at < ?
      ORDER BY created_at ASC;
    `;
    const rows = this.db.prepare(query).all(tenantId, now.toISOString()) as unknown as ApprovalRequestRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = this.deleteStmt.run(id, tenantId);
    return result.changes > 0;
  }

  private mapRow(row: ApprovalRequestRow): ApprovalRequest {
    let requiredAuthority: ApprovalAuthority | undefined;
    if (row.required_authority_json) {
      try {
        requiredAuthority = JSON.parse(row.required_authority_json);
      } catch {
        // Fallback
      }
    }

    let decisionMetadata: Record<string, unknown> | undefined;
    if (row.decision_metadata_json) {
      try {
        decisionMetadata = JSON.parse(row.decision_metadata_json);
      } catch {
        // Fallback
      }
    }

    return ApprovalRequest.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      workflowId: row.workflow_id,
      workflowInstanceId: row.workflow_instance_id,
      workflowStepId: row.workflow_step_id,
      taskId: row.task_id ?? undefined,
      executionId: row.execution_id ?? undefined,
      verificationResultId: row.verification_result_id ?? undefined,
      requesterPrincipalId: row.requester_principal_id,
      producerPrincipalId: row.producer_principal_id ?? undefined,
      reviewerPrincipalId: row.reviewer_principal_id ?? undefined,
      approverPrincipalId: row.approver_principal_id ?? undefined,
      purpose: row.purpose,
      requiredAuthority,
      requiredRole: (row.required_role as MembershipRole) ?? undefined,
      status: row.status as ApprovalStatus,
      decisionReason: row.decision_reason ?? undefined,
      decisionMetadata,
      escalationTarget: row.escalation_target ?? undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
