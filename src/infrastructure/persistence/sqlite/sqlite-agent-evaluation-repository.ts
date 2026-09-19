import { DatabaseSync } from "node:sqlite";
import { SqliteDatabase } from "./sqlite-database.js";
import {
  AgentLifecycle,
  AgentLifecycleState,
} from "../../../domain/agent/agent-lifecycle.js";
import {
  AgentEvaluation,
  EvaluationType,
  EvaluationVerdict,
} from "../../../domain/agent/agent-evaluation.js";
import {
  AgentLifecycleRepositoryPort,
  AgentEvaluationRepositoryPort,
} from "../../../application/ports/agent-evaluation-repository-port.js";
import {
  AgentLifecycleConcurrencyConflictError,
  AgentEvaluationConcurrencyConflictError,
} from "../../../domain/agent/agent-lifecycle-errors.js";

interface AgentLifecycleRow {
  agent_id: string;
  tenant_id: string;
  state: string;
  profile_version: number;
  suspended_reason: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  revoked_reason: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  deprecated_reason: string | null;
  deprecated_by: string | null;
  deprecated_at: string | null;
  last_evaluated_at: string | null;
  last_evaluation_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AgentEvaluationRow {
  id: string;
  tenant_id: string;
  agent_id: string;
  evaluated_profile_version: number;
  evaluator_principal_id: string;
  evaluation_type: string;
  verdict: string;
  criteria_reference: string;
  evidence_json: string;
  evaluated_at: string;
  expires_at: string | null;
  version: number;
  metadata_json: string | null;
}

export class SqliteAgentLifecycleRepository implements AgentLifecycleRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(private readonly dbManager: SqliteDatabase) {
    this.db = this.dbManager.open();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_lifecycles (
        agent_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        state TEXT NOT NULL,
        profile_version INTEGER NOT NULL,
        suspended_reason TEXT,
        suspended_by TEXT,
        suspended_at TEXT,
        revoked_reason TEXT,
        revoked_by TEXT,
        revoked_at TEXT,
        deprecated_reason TEXT,
        deprecated_by TEXT,
        deprecated_at TEXT,
        last_evaluated_at TEXT,
        last_evaluation_id TEXT,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lifecycles_tenant ON agent_lifecycles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_lifecycles_state ON agent_lifecycles(state);
    `);
  }

  private mapRowToLifecycle(row: AgentLifecycleRow): AgentLifecycle {
    return AgentLifecycle.rehydrate({
      agentId: row.agent_id,
      tenantId: row.tenant_id,
      state: row.state as AgentLifecycleState,
      profileVersion: row.profile_version,
      suspendedReason: row.suspended_reason || undefined,
      suspendedBy: row.suspended_by || undefined,
      suspendedAt: row.suspended_at ? new Date(row.suspended_at) : undefined,
      revokedReason: row.revoked_reason || undefined,
      revokedBy: row.revoked_by || undefined,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
      deprecatedReason: row.deprecated_reason || undefined,
      deprecatedBy: row.deprecated_by || undefined,
      deprecatedAt: row.deprecated_at ? new Date(row.deprecated_at) : undefined,
      lastEvaluatedAt: row.last_evaluated_at ? new Date(row.last_evaluated_at) : undefined,
      lastEvaluationId: row.last_evaluation_id || undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async save(lifecycle: AgentLifecycle): Promise<AgentLifecycle> {
    const existing = await this.findByAgentId(lifecycle.agentId);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO agent_lifecycles (
          agent_id, tenant_id, state, profile_version,
          suspended_reason, suspended_by, suspended_at,
          revoked_reason, revoked_by, revoked_at,
          deprecated_reason, deprecated_by, deprecated_at,
          last_evaluated_at, last_evaluation_id,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        lifecycle.agentId,
        lifecycle.tenantId,
        lifecycle.state,
        lifecycle.profileVersion,
        lifecycle.suspendedReason ?? null,
        lifecycle.suspendedBy ?? null,
        lifecycle.suspendedAt?.toISOString() ?? null,
        lifecycle.revokedReason ?? null,
        lifecycle.revokedBy ?? null,
        lifecycle.revokedAt?.toISOString() ?? null,
        lifecycle.deprecatedReason ?? null,
        lifecycle.deprecatedBy ?? null,
        lifecycle.deprecatedAt?.toISOString() ?? null,
        lifecycle.lastEvaluatedAt?.toISOString() ?? null,
        lifecycle.lastEvaluationId ?? null,
        lifecycle.version,
        lifecycle.createdAt.toISOString(),
        lifecycle.updatedAt.toISOString()
      );
      return lifecycle;
    }

    if (existing.version >= lifecycle.version) {
      throw new AgentLifecycleConcurrencyConflictError(
        `Agent lifecycle OCC conflict for '${lifecycle.agentId}': current version is ${existing.version}, update has ${lifecycle.version}`
      );
    }

    const stmt = this.db.prepare(`
      UPDATE agent_lifecycles SET
        tenant_id = ?,
        state = ?,
        profile_version = ?,
        suspended_reason = ?,
        suspended_by = ?,
        suspended_at = ?,
        revoked_reason = ?,
        revoked_by = ?,
        revoked_at = ?,
        deprecated_reason = ?,
        deprecated_by = ?,
        deprecated_at = ?,
        last_evaluated_at = ?,
        last_evaluation_id = ?,
        version = ?,
        updated_at = ?
      WHERE agent_id = ? AND version = ?
    `);

    const result = stmt.run(
      lifecycle.tenantId,
      lifecycle.state,
      lifecycle.profileVersion,
      lifecycle.suspendedReason ?? null,
      lifecycle.suspendedBy ?? null,
      lifecycle.suspendedAt?.toISOString() ?? null,
      lifecycle.revokedReason ?? null,
      lifecycle.revokedBy ?? null,
      lifecycle.revokedAt?.toISOString() ?? null,
      lifecycle.deprecatedReason ?? null,
      lifecycle.deprecatedBy ?? null,
      lifecycle.deprecatedAt?.toISOString() ?? null,
      lifecycle.lastEvaluatedAt?.toISOString() ?? null,
      lifecycle.lastEvaluationId ?? null,
      lifecycle.version,
      lifecycle.updatedAt.toISOString(),
      lifecycle.agentId,
      existing.version
    );

    if (result.changes === 0) {
      throw new AgentLifecycleConcurrencyConflictError(
        `Agent lifecycle OCC conflict: concurrent update on '${lifecycle.agentId}'`
      );
    }

    return lifecycle;
  }

  async findByAgentId(agentId: string, tenantId?: string): Promise<AgentLifecycle | null> {
    let query = "SELECT * FROM agent_lifecycles WHERE LOWER(agent_id) = LOWER(?)";
    const params: any[] = [agentId];

    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as AgentLifecycleRow | undefined;
    if (!row) return null;
    return this.mapRowToLifecycle(row);
  }

  async findByTenantId(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentLifecycle[]> {
    let query = "SELECT * FROM agent_lifecycles WHERE tenant_id = ? ORDER BY agent_id ASC";
    const params: any[] = [tenantId];

    if (limit !== undefined) {
      query += " LIMIT ?";
      params.push(limit);
      if (offset !== undefined) {
        query += " OFFSET ?";
        params.push(offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as AgentLifecycleRow[];
    return rows.map((r) => this.mapRowToLifecycle(r));
  }

  async delete(agentId: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(
      "DELETE FROM agent_lifecycles WHERE LOWER(agent_id) = LOWER(?) AND tenant_id = ?"
    );
    const res = stmt.run(agentId, tenantId);
    return res.changes > 0;
  }
}

export class SqliteAgentEvaluationRepository implements AgentEvaluationRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(private readonly dbManager: SqliteDatabase) {
    this.db = this.dbManager.open();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_evaluations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        evaluated_profile_version INTEGER NOT NULL,
        evaluator_principal_id TEXT NOT NULL,
        evaluation_type TEXT NOT NULL,
        verdict TEXT NOT NULL,
        criteria_reference TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL,
        expires_at TEXT,
        version INTEGER NOT NULL,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_evaluations_tenant_agent ON agent_evaluations(tenant_id, agent_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_agent_type ON agent_evaluations(agent_id, evaluation_type);
      CREATE INDEX IF NOT EXISTS idx_evaluations_expires ON agent_evaluations(expires_at);
    `);
  }

  private mapRowToEvaluation(row: AgentEvaluationRow): AgentEvaluation {
    return AgentEvaluation.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      evaluatedProfileVersion: row.evaluated_profile_version,
      evaluatorPrincipalId: row.evaluator_principal_id,
      evaluationType: row.evaluation_type as EvaluationType,
      verdict: row.verdict as EvaluationVerdict,
      criteriaReference: row.criteria_reference,
      evidence: JSON.parse(row.evidence_json),
      evaluatedAt: new Date(row.evaluated_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      version: row.version,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    });
  }

  async save(evaluation: AgentEvaluation): Promise<AgentEvaluation> {
    const existing = await this.findById(evaluation.id);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO agent_evaluations (
          id, tenant_id, agent_id, evaluated_profile_version,
          evaluator_principal_id, evaluation_type, verdict,
          criteria_reference, evidence_json, evaluated_at,
          expires_at, version, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        evaluation.id,
        evaluation.tenantId,
        evaluation.agentId,
        evaluation.evaluatedProfileVersion,
        evaluation.evaluatorPrincipalId,
        evaluation.evaluationType,
        evaluation.verdict,
        evaluation.criteriaReference,
        JSON.stringify(evaluation.evidence),
        evaluation.evaluatedAt.toISOString(),
        evaluation.expiresAt?.toISOString() ?? null,
        evaluation.version,
        evaluation.metadata ? JSON.stringify(evaluation.metadata) : null
      );
      return evaluation;
    }

    if (existing.version >= evaluation.version) {
      throw new AgentEvaluationConcurrencyConflictError(
        `Agent evaluation OCC conflict for '${evaluation.id}': current version is ${existing.version}, update has ${evaluation.version}`
      );
    }

    const stmt = this.db.prepare(`
      UPDATE agent_evaluations SET
        tenant_id = ?,
        agent_id = ?,
        evaluated_profile_version = ?,
        evaluator_principal_id = ?,
        evaluation_type = ?,
        verdict = ?,
        criteria_reference = ?,
        evidence_json = ?,
        evaluated_at = ?,
        expires_at = ?,
        version = ?,
        metadata_json = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(
      evaluation.tenantId,
      evaluation.agentId,
      evaluation.evaluatedProfileVersion,
      evaluation.evaluatorPrincipalId,
      evaluation.evaluationType,
      evaluation.verdict,
      evaluation.criteriaReference,
      JSON.stringify(evaluation.evidence),
      evaluation.evaluatedAt.toISOString(),
      evaluation.expiresAt?.toISOString() ?? null,
      evaluation.version,
      evaluation.metadata ? JSON.stringify(evaluation.metadata) : null,
      evaluation.id,
      existing.version
    );

    if (result.changes === 0) {
      throw new AgentEvaluationConcurrencyConflictError(
        `Agent evaluation OCC conflict: concurrent update on '${evaluation.id}'`
      );
    }

    return evaluation;
  }

  async findById(id: string, tenantId?: string): Promise<AgentEvaluation | null> {
    let query = "SELECT * FROM agent_evaluations WHERE id = ?";
    const params: any[] = [id];

    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as AgentEvaluationRow | undefined;
    if (!row) return null;
    return this.mapRowToEvaluation(row);
  }

  async findByAgentId(
    agentId: string,
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentEvaluation[]> {
    let query = `
      SELECT * FROM agent_evaluations
      WHERE tenant_id = ? AND LOWER(agent_id) = LOWER(?)
      ORDER BY evaluated_at DESC
    `;
    const params: any[] = [tenantId, agentId];

    if (limit !== undefined) {
      query += " LIMIT ?";
      params.push(limit);
      if (offset !== undefined) {
        query += " OFFSET ?";
        params.push(offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as AgentEvaluationRow[];
    return rows.map((r) => this.mapRowToEvaluation(r));
  }

  async findLatestByAgentAndType(
    agentId: string,
    evaluationType: EvaluationType,
    tenantId: string
  ): Promise<AgentEvaluation | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_evaluations
      WHERE tenant_id = ? AND LOWER(agent_id) = LOWER(?) AND evaluation_type = ?
      ORDER BY evaluated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(tenantId, agentId, evaluationType) as AgentEvaluationRow | undefined;
    if (!row) return null;
    return this.mapRowToEvaluation(row);
  }

  async findExpiringBefore(date: Date, tenantId?: string): Promise<readonly AgentEvaluation[]> {
    let query = `
      SELECT * FROM agent_evaluations
      WHERE expires_at IS NOT NULL
        AND expires_at <= ?
        AND verdict != 'EXPIRED'
    `;
    const params: any[] = [date.toISOString()];

    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as AgentEvaluationRow[];
    return rows.map((r) => this.mapRowToEvaluation(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(
      "DELETE FROM agent_evaluations WHERE id = ? AND tenant_id = ?"
    );
    const res = stmt.run(id, tenantId);
    return res.changes > 0;
  }
}
