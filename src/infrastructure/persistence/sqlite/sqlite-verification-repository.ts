import { DatabaseSync, StatementSync } from "node:sqlite";
import {
  VerificationResult,
  VerificationVerdict,
  VerificationMethod,
  VerifierSource,
} from "../../../domain/workflow/verification-result.js";
import { VerificationConcurrencyConflictError } from "../../../domain/workflow/verification-errors.js";
import { VerificationResultRepositoryPort } from "../../../application/ports/verification-repository-port.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";

interface VerificationResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly workflow_id: string;
  readonly workflow_instance_id: string;
  readonly workflow_step_id: string;
  readonly task_id: string | null;
  readonly execution_id: string | null;
  readonly producer_principal_id: string | null;
  readonly verifier_principal_id: string;
  readonly verifier_source: string;
  readonly verdict: string;
  readonly method: string;
  readonly evidence_json: string | null;
  readonly reason: string | null;
  readonly verified_at: string;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteVerificationResultRepository implements VerificationResultRepositoryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectByIdStmt: StatementSync;
  private readonly selectByInstanceStmt: StatementSync;
  private readonly selectByExecutionStmt: StatementSync;
  private readonly selectByStepStmt: StatementSync;
  private readonly selectByTenantStmt: StatementSync;
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
      "SELECT * FROM verification_results WHERE id = ? AND tenant_id = ?;"
    );
    this.selectByInstanceStmt = this.db.prepare(
      "SELECT * FROM verification_results WHERE workflow_instance_id = ? AND tenant_id = ? ORDER BY verified_at ASC;"
    );
    this.selectByExecutionStmt = this.db.prepare(
      "SELECT * FROM verification_results WHERE execution_id = ? AND tenant_id = ? ORDER BY verified_at ASC;"
    );
    this.selectByStepStmt = this.db.prepare(
      "SELECT * FROM verification_results WHERE workflow_instance_id = ? AND workflow_step_id = ? AND tenant_id = ? ORDER BY verified_at ASC;"
    );
    this.selectByTenantStmt = this.db.prepare(
      "SELECT * FROM verification_results WHERE tenant_id = ? ORDER BY verified_at DESC LIMIT ? OFFSET ?;"
    );
    this.insertStmt = this.db.prepare(`
      INSERT INTO verification_results (
        id, tenant_id, workflow_id, workflow_instance_id, workflow_step_id,
        task_id, execution_id, producer_principal_id, verifier_principal_id,
        verifier_source, verdict, method, evidence_json, reason,
        verified_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    this.updateStmt = this.db.prepare(`
      UPDATE verification_results
      SET
        verdict = ?,
        method = ?,
        evidence_json = ?,
        reason = ?,
        verified_at = ?,
        version = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ? AND version = ?;
    `);
    this.deleteStmt = this.db.prepare(
      "DELETE FROM verification_results WHERE id = ? AND tenant_id = ?;"
    );
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS verification_results (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_instance_id TEXT NOT NULL,
        workflow_step_id TEXT NOT NULL,
        task_id TEXT,
        execution_id TEXT,
        producer_principal_id TEXT,
        verifier_principal_id TEXT NOT NULL,
        verifier_source TEXT NOT NULL,
        verdict TEXT NOT NULL,
        method TEXT NOT NULL,
        evidence_json TEXT,
        reason TEXT,
        verified_at TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verifications_tenant ON verification_results(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_instance ON verification_results(tenant_id, workflow_instance_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_execution ON verification_results(tenant_id, execution_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_step ON verification_results(tenant_id, workflow_instance_id, workflow_step_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_verdict ON verification_results(verdict);
    `);
  }

  private mapRowToVerification(row: VerificationResultRow): VerificationResult {
    return VerificationResult.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      workflowId: row.workflow_id,
      workflowInstanceId: row.workflow_instance_id,
      workflowStepId: row.workflow_step_id,
      taskId: row.task_id ?? undefined,
      executionId: row.execution_id ?? undefined,
      producerPrincipalId: row.producer_principal_id ?? undefined,
      verifierPrincipalId: row.verifier_principal_id,
      verifierSource: row.verifier_source as VerifierSource,
      verdict: row.verdict as VerificationVerdict,
      method: row.method as VerificationMethod,
      evidence: row.evidence_json ? JSON.parse(row.evidence_json) : undefined,
      reason: row.reason ?? undefined,
      verifiedAt: new Date(row.verified_at),
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async save(verification: VerificationResult): Promise<VerificationResult> {
    const existing = await this.findById(verification.id, verification.tenantId);

    if (!existing) {
      this.insertStmt.run(
        verification.id,
        verification.tenantId,
        verification.workflowId,
        verification.workflowInstanceId,
        verification.workflowStepId,
        verification.taskId ?? null,
        verification.executionId ?? null,
        verification.producerPrincipalId ?? null,
        verification.verifierPrincipalId,
        verification.verifierSource,
        verification.verdict,
        verification.method,
        verification.evidence ? JSON.stringify(verification.evidence) : null,
        verification.reason ?? null,
        verification.verifiedAt.toISOString(),
        verification.version,
        verification.createdAt.toISOString(),
        verification.updatedAt.toISOString()
      );
      return verification;
    }

    const expectedVersion = verification.version - 1;
    const result = this.updateStmt.run(
      verification.verdict,
      verification.method,
      verification.evidence ? JSON.stringify(verification.evidence) : null,
      verification.reason ?? null,
      verification.verifiedAt.toISOString(),
      verification.version,
      verification.updatedAt.toISOString(),
      verification.id,
      verification.tenantId,
      expectedVersion
    ) as { changes: number | bigint };

    if (Number(result.changes) === 0) {
      throw new VerificationConcurrencyConflictError(
        verification.id,
        existing.version,
        verification.version
      );
    }

    return verification;
  }

  async findById(id: string, tenantId: string): Promise<VerificationResult | null> {
    const row = this.selectByIdStmt.get(id, tenantId) as unknown as VerificationResultRow | undefined;
    return row ? this.mapRowToVerification(row) : null;
  }

  async findByInstanceId(
    instanceId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const rows = this.selectByInstanceStmt.all(instanceId, tenantId) as unknown as VerificationResultRow[];
    return rows.map((r) => this.mapRowToVerification(r));
  }

  async findByExecutionId(
    executionId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const rows = this.selectByExecutionStmt.all(executionId, tenantId) as unknown as VerificationResultRow[];
    return rows.map((r) => this.mapRowToVerification(r));
  }

  async findByStepId(
    instanceId: string,
    stepId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const rows = this.selectByStepStmt.all(instanceId, stepId, tenantId) as unknown as VerificationResultRow[];
    return rows.map((r) => this.mapRowToVerification(r));
  }

  async findByTenantId(
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<readonly VerificationResult[]> {
    const rows = this.selectByTenantStmt.all(tenantId, limit, offset) as unknown as VerificationResultRow[];
    return rows.map((r) => this.mapRowToVerification(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = this.deleteStmt.run(id, tenantId) as { changes: number | bigint };
    return Number(res.changes) > 0;
  }
}
