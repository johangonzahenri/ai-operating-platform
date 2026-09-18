import { DatabaseSync, StatementSync } from "node:sqlite";
import { CoordinationRepositoryPort } from "../../../application/ports/coordination-repository-port.js";
import {
  AgentCoordinationRecord,
  CoordinationRecordStatus,
} from "../../../domain/organization/organizational-coordination.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { SqlitePersistenceError, OptimisticConcurrencyError } from "./sqlite-errors.js";

interface CoordinationRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  team_id: string;
  source_agent_id: string;
  target_agent_id: string;
  requester_id: string;
  correlation_id: string;
  parent_execution_id: string | null;
  child_execution_id: string | null;
  purpose: string;
  input_payload: string;
  output_payload: string | null;
  depth: number;
  max_depth: number;
  handoff_count: number;
  max_handoffs: number;
  status: CoordinationRecordStatus;
  failure_code: string | null;
  failure_message: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class SqliteCoordinationRepository implements CoordinationRepositoryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectByIdStmt: StatementSync;
  private readonly selectByTenantStmt: StatementSync;
  private readonly selectByTeamStmt: StatementSync;
  private readonly selectByParentExecStmt: StatementSync;
  private readonly insertStmt: StatementSync;
  private readonly updateStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb);
    }
    this.db = this.dbManager.open();

    this.initSchema();

    this.selectByIdStmt = this.db.prepare("SELECT * FROM agent_coordinations WHERE id = ?;");
    this.selectByTenantStmt = this.db.prepare(
      "SELECT * FROM agent_coordinations WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;"
    );
    this.selectByTeamStmt = this.db.prepare(
      "SELECT * FROM agent_coordinations WHERE team_id = ? AND (? IS NULL OR tenant_id = ?) ORDER BY created_at DESC LIMIT ? OFFSET ?;"
    );
    this.selectByParentExecStmt = this.db.prepare(
      "SELECT * FROM agent_coordinations WHERE parent_execution_id = ? AND (? IS NULL OR tenant_id = ?) ORDER BY created_at DESC;"
    );

    this.insertStmt = this.db.prepare(`
      INSERT INTO agent_coordinations (
        id, tenant_id, organization_id, team_id, source_agent_id, target_agent_id,
        requester_id, correlation_id, parent_execution_id, child_execution_id,
        purpose, input_payload, output_payload, depth, max_depth, handoff_count, max_handoffs,
        status, failure_code, failure_message, version, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      );
    `);

    this.updateStmt = this.db.prepare(`
      UPDATE agent_coordinations SET
        tenant_id = ?,
        organization_id = ?,
        team_id = ?,
        source_agent_id = ?,
        target_agent_id = ?,
        requester_id = ?,
        correlation_id = ?,
        parent_execution_id = ?,
        child_execution_id = ?,
        purpose = ?,
        input_payload = ?,
        output_payload = ?,
        depth = ?,
        max_depth = ?,
        handoff_count = ?,
        max_handoffs = ?,
        status = ?,
        failure_code = ?,
        failure_message = ?,
        version = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ? AND version = ?;
    `);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_coordinations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        target_agent_id TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        parent_execution_id TEXT,
        child_execution_id TEXT,
        purpose TEXT NOT NULL,
        input_payload TEXT NOT NULL,
        output_payload TEXT,
        depth INTEGER NOT NULL DEFAULT 0,
        max_depth INTEGER NOT NULL DEFAULT 3,
        handoff_count INTEGER NOT NULL DEFAULT 0,
        max_handoffs INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'AUTHORIZED', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')),
        failure_code TEXT,
        failure_message TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_coordinations_tenant_id ON agent_coordinations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_coordinations_team_id ON agent_coordinations(team_id);
      CREATE INDEX IF NOT EXISTS idx_coordinations_parent_exec ON agent_coordinations(parent_execution_id);
      CREATE INDEX IF NOT EXISTS idx_coordinations_status ON agent_coordinations(status);
    `);
  }

  private mapRowToRecord(row: CoordinationRow): AgentCoordinationRecord {
    return AgentCoordinationRecord.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      teamId: row.team_id,
      sourceAgentId: row.source_agent_id,
      targetAgentId: row.target_agent_id,
      requesterId: row.requester_id,
      correlationId: row.correlation_id,
      parentExecutionId: row.parent_execution_id ?? undefined,
      childExecutionId: row.child_execution_id ?? undefined,
      purpose: row.purpose,
      inputPayload: JSON.parse(row.input_payload),
      outputPayload: row.output_payload ? JSON.parse(row.output_payload) : undefined,
      depth: row.depth,
      maxDepth: row.max_depth,
      handoffCount: row.handoff_count,
      maxHandoffs: row.max_handoffs,
      status: row.status,
      failure: row.failure_code ? { code: row.failure_code, message: row.failure_message ?? "" } : undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    });
  }

  async save(record: AgentCoordinationRecord): Promise<AgentCoordinationRecord> {
    try {
      const existing = await this.findById(record.id);

      if (!existing) {
        this.insertStmt.run(
          record.id,
          record.tenantId,
          record.organizationId,
          record.teamId,
          record.sourceAgentId,
          record.targetAgentId,
          record.requesterId,
          record.correlationId,
          record.parentExecutionId ?? null,
          record.childExecutionId ?? null,
          record.purpose,
          JSON.stringify(record.inputPayload),
          record.outputPayload ? JSON.stringify(record.outputPayload) : null,
          record.depth,
          record.maxDepth,
          record.handoffCount,
          record.maxHandoffs,
          record.status,
          record.failure?.code ?? null,
          record.failure?.message ?? null,
          record.version,
          record.createdAt.toISOString(),
          record.updatedAt.toISOString(),
          record.completedAt?.toISOString() ?? null
        );
        return record;
      }

      // Optimistic concurrency update
      const expectedOldVersion = record.version - 1;
      const result = this.updateStmt.run(
        record.tenantId,
        record.organizationId,
        record.teamId,
        record.sourceAgentId,
        record.targetAgentId,
        record.requesterId,
        record.correlationId,
        record.parentExecutionId ?? null,
        record.childExecutionId ?? null,
        record.purpose,
        JSON.stringify(record.inputPayload),
        record.outputPayload ? JSON.stringify(record.outputPayload) : null,
        record.depth,
        record.maxDepth,
        record.handoffCount,
        record.maxHandoffs,
        record.status,
        record.failure?.code ?? null,
        record.failure?.message ?? null,
        record.version,
        record.updatedAt.toISOString(),
        record.completedAt?.toISOString() ?? null,
        record.id,
        expectedOldVersion
      );

      if ((result.changes ?? 0) === 0) {
        throw new OptimisticConcurrencyError(record.id, expectedOldVersion, record.version, "coordination");
      }

      return record;
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw error;
      }
      throw new SqlitePersistenceError(`Failed to save coordination '${record.id}'`, error);
    }
  }

  async findById(id: string, tenantId?: string): Promise<AgentCoordinationRecord | undefined> {
    try {
      const row = this.selectByIdStmt.get(id) as CoordinationRow | undefined;
      if (!row) return undefined;
      if (tenantId && row.tenant_id !== tenantId) return undefined;
      return this.mapRowToRecord(row);
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find coordination '${id}'`, error);
    }
  }

  async findByTenantId(tenantId: string, limit = 50, offset = 0): Promise<readonly AgentCoordinationRecord[]> {
    try {
      const rows = this.selectByTenantStmt.all(tenantId, limit, offset) as unknown as CoordinationRow[];
      return rows.map((r) => this.mapRowToRecord(r));
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find coordinations for tenant '${tenantId}'`, error);
    }
  }

  async findByTeamId(
    teamId: string,
    tenantId?: string,
    limit = 50,
    offset = 0
  ): Promise<readonly AgentCoordinationRecord[]> {
    try {
      const rows = this.selectByTeamStmt.all(teamId, tenantId ?? null, tenantId ?? null, limit, offset) as unknown as CoordinationRow[];
      return rows.map((r) => this.mapRowToRecord(r));
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find coordinations for team '${teamId}'`, error);
    }
  }

  async findByParentExecutionId(
    parentExecutionId: string,
    tenantId?: string
  ): Promise<readonly AgentCoordinationRecord[]> {
    try {
      const rows = this.selectByParentExecStmt.all(
        parentExecutionId,
        tenantId ?? null,
        tenantId ?? null
      ) as unknown as CoordinationRow[];
      return rows.map((r) => this.mapRowToRecord(r));
    } catch (error) {
      throw new SqlitePersistenceError(
        `Failed to find coordinations for parent execution '${parentExecutionId}'`,
        error
      );
    }
  }
}
