/**
 * AI Operating Platform - SqliteAISolutionRepository & SqliteAISolutionInstanceRepository
 * 
 * Durable SQLite WAL persistence adapters with OCC conflict detection,
 * tenant composite indexes, and strict serialization.
 */

import { DatabaseSync } from "node:sqlite";
import { SqliteDatabase } from "./sqlite-database.js";
import {
  AISolution,
  SolutionLifecycleState,
} from "../../../domain/solution/ai-solution.js";
import {
  SolutionBlueprint,
  SolutionBlueprintValidationReport,
} from "../../../domain/solution/solution-blueprint.js";
import { SolutionInstance } from "../../../domain/solution/solution-instance.js";
import {
  AISolutionRepositoryPort,
  AISolutionInstanceRepositoryPort,
  SolutionFilter,
} from "../../../application/ports/solution-repository-port.js";
import { SolutionConcurrencyConflictError } from "../../../domain/solution/solution-errors.js";

interface AISolutionRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  version: number;
  lifecycle_state: string;
  blueprint_json: string;
  owner_principal_id: string;
  last_validation_json: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string;
  concurrency_version: number;
}

interface AISolutionInstanceRow {
  id: string;
  solution_id: string;
  solution_version: number;
  tenant_id: string;
  name: string;
  status: string;
  config_json: string;
  operator_principal_id: string;
  created_at: string;
  updated_at: string;
}

export class SqliteAISolutionRepository implements AISolutionRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_solutions (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        version INTEGER NOT NULL,
        lifecycle_state TEXT NOT NULL,
        blueprint_json TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        last_validation_json TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        concurrency_version INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_solutions_tenant_state
        ON ai_solutions (tenant_id, lifecycle_state);

      CREATE INDEX IF NOT EXISTS idx_ai_solutions_tenant_owner
        ON ai_solutions (tenant_id, owner_principal_id);
    `);
  }

  public async save(solution: AISolution): Promise<void> {
    const existing = this.db
      .prepare(
        `SELECT concurrency_version FROM ai_solutions WHERE id = ? AND tenant_id = ? AND version = ?`
      )
      .get(solution.id, solution.tenantId, solution.version) as { concurrency_version: number } | undefined;

    if (existing) {
      if (
        existing.concurrency_version !== solution.concurrencyVersion - 1 &&
        existing.concurrency_version !== solution.concurrencyVersion
      ) {
        if (existing.concurrency_version >= solution.concurrencyVersion) {
          throw new SolutionConcurrencyConflictError(
            solution.id,
            solution.concurrencyVersion - 1,
            existing.concurrency_version
          );
        }
      }

      this.db
        .prepare(
          `UPDATE ai_solutions SET
            name = ?,
            description = ?,
            lifecycle_state = ?,
            blueprint_json = ?,
            owner_principal_id = ?,
            last_validation_json = ?,
            published_at = ?,
            updated_at = ?,
            metadata_json = ?,
            concurrency_version = ?
          WHERE id = ? AND tenant_id = ? AND version = ?`
        )
        .run(
          solution.name,
          solution.description,
          solution.lifecycleState,
          JSON.stringify(solution.blueprint.toJSON()),
          solution.ownerPrincipalId,
          solution.lastValidationReport ? JSON.stringify(solution.lastValidationReport) : null,
          solution.publishedAt ? solution.publishedAt.toISOString() : null,
          solution.updatedAt.toISOString(),
          JSON.stringify(solution.metadata),
          solution.concurrencyVersion,
          solution.id,
          solution.tenantId,
          solution.version
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO ai_solutions (
            id, tenant_id, name, description, version, lifecycle_state,
            blueprint_json, owner_principal_id, last_validation_json,
            published_at, created_at, updated_at, metadata_json, concurrency_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          solution.id,
          solution.tenantId,
          solution.name,
          solution.description,
          solution.version,
          solution.lifecycleState,
          JSON.stringify(solution.blueprint.toJSON()),
          solution.ownerPrincipalId,
          solution.lastValidationReport ? JSON.stringify(solution.lastValidationReport) : null,
          solution.publishedAt ? solution.publishedAt.toISOString() : null,
          solution.createdAt.toISOString(),
          solution.updatedAt.toISOString(),
          JSON.stringify(solution.metadata),
          solution.concurrencyVersion
        );
    }
  }

  public async findById(id: string, tenantId: string): Promise<AISolution | undefined> {
    const row = this.db
      .prepare(
        `SELECT * FROM ai_solutions WHERE id = ? AND tenant_id = ? ORDER BY version DESC LIMIT 1`
      )
      .get(id, tenantId) as unknown as AISolutionRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  public async findByIdAndVersion(
    id: string,
    version: number,
    tenantId: string
  ): Promise<AISolution | undefined> {
    const row = this.db
      .prepare(
        `SELECT * FROM ai_solutions WHERE id = ? AND version = ? AND tenant_id = ?`
      )
      .get(id, version, tenantId) as unknown as AISolutionRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  public async listVersions(id: string, tenantId: string): Promise<readonly AISolution[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM ai_solutions WHERE id = ? AND tenant_id = ? ORDER BY version ASC`
      )
      .all(id, tenantId) as unknown as AISolutionRow[];

    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  public async list(
    filter: SolutionFilter,
    limit: number = 50,
    offset: number = 0
  ): Promise<readonly AISolution[]> {
    // Get latest version per solution id for tenant
    let query = `
      SELECT a.* FROM ai_solutions a
      INNER JOIN (
        SELECT id, tenant_id, MAX(version) as max_version
        FROM ai_solutions
        WHERE tenant_id = ?
        GROUP BY id, tenant_id
      ) b ON a.id = b.id AND a.tenant_id = b.tenant_id AND a.version = b.max_version
      WHERE a.tenant_id = ?
    `;
    const params: (string | number | null)[] = [filter.tenantId, filter.tenantId];

    if (filter.lifecycleState) {
      query += ` AND a.lifecycle_state = ?`;
      params.push(filter.lifecycleState);
    }

    if (filter.ownerPrincipalId) {
      query += ` AND a.owner_principal_id = ?`;
      params.push(filter.ownerPrincipalId);
    }

    if (filter.search) {
      query += ` AND (a.name LIKE ? OR a.description LIKE ? OR a.id LIKE ?)`;
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    query += ` ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...(params as any)) as unknown as AISolutionRow[];
    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  public async count(filter: SolutionFilter): Promise<number> {
    let query = `
      SELECT COUNT(*) as count FROM (
        SELECT id FROM ai_solutions
        WHERE tenant_id = ?
    `;
    const params: (string | number | null)[] = [filter.tenantId];

    if (filter.lifecycleState) {
      query += ` AND lifecycle_state = ?`;
      params.push(filter.lifecycleState);
    }

    if (filter.ownerPrincipalId) {
      query += ` AND owner_principal_id = ?`;
      params.push(filter.ownerPrincipalId);
    }

    if (filter.search) {
      query += ` AND (name LIKE ? OR description LIKE ? OR id LIKE ?)`;
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    query += ` GROUP BY id)`;

    const row = this.db.prepare(query).get(...(params as any)) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private mapRow(row: AISolutionRow): AISolution {
    let blueprint: SolutionBlueprint;
    try {
      blueprint = SolutionBlueprint.fromJSON(JSON.parse(row.blueprint_json));
    } catch {
      blueprint = new SolutionBlueprint();
    }

    let lastValidationReport: SolutionBlueprintValidationReport | undefined;
    if (row.last_validation_json) {
      try {
        const parsed = JSON.parse(row.last_validation_json);
        lastValidationReport = {
          ...parsed,
          validatedAt: new Date(parsed.validatedAt),
        };
      } catch {
        lastValidationReport = undefined;
      }
    }

    let metadata: Record<string, unknown> = {};
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch {
        metadata = {};
      }
    }

    return AISolution.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      version: row.version,
      lifecycleState: row.lifecycle_state as SolutionLifecycleState,
      blueprint,
      ownerPrincipalId: row.owner_principal_id,
      lastValidationReport,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata,
      concurrencyVersion: row.concurrency_version,
    });
  }
}

export class SqliteAISolutionInstanceRepository implements AISolutionInstanceRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_solution_instances (
        id TEXT NOT NULL,
        solution_id TEXT NOT NULL,
        solution_version INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        operator_principal_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_solution_instances_sol
        ON ai_solution_instances (tenant_id, solution_id);
    `);
  }

  public async save(instance: SolutionInstance): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_solution_instances (
          id, solution_id, solution_version, tenant_id, name, status,
          config_json, operator_principal_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instance.id,
        instance.solutionId,
        instance.solutionVersion,
        instance.tenantId,
        instance.name,
        instance.status,
        JSON.stringify(instance.config),
        instance.operatorPrincipalId,
        instance.createdAt.toISOString(),
        instance.updatedAt.toISOString()
      );
  }

  public async findById(id: string, tenantId: string): Promise<SolutionInstance | undefined> {
    const row = this.db
      .prepare(`SELECT * FROM ai_solution_instances WHERE id = ? AND tenant_id = ?`)
      .get(id, tenantId) as unknown as AISolutionInstanceRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  public async listBySolution(
    solutionId: string,
    tenantId: string
  ): Promise<readonly SolutionInstance[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM ai_solution_instances WHERE solution_id = ? AND tenant_id = ? ORDER BY created_at DESC`
      )
      .all(solutionId, tenantId) as unknown as AISolutionInstanceRow[];

    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  private mapRow(row: AISolutionInstanceRow): SolutionInstance {
    let config: Record<string, unknown> = {};
    if (row.config_json) {
      try {
        config = JSON.parse(row.config_json);
      } catch {
        config = {};
      }
    }

    return SolutionInstance.rehydrate({
      id: row.id,
      solutionId: row.solution_id,
      solutionVersion: row.solution_version,
      tenantId: row.tenant_id,
      name: row.name,
      status: row.status as any,
      config,
      operatorPrincipalId: row.operator_principal_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
