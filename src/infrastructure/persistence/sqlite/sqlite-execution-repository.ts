import { DatabaseSync, StatementSync } from "node:sqlite";
import { ExecutionProjection, ExecutionQueryPort } from "../../../application/ports/query-ports.js";
import { Execution, ExecutionRepository } from "../../../domain/execution/execution.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import {
  ExecutionRow,
  mapRowToExecution,
  mapRowToExecutionProjection,
} from "./sqlite-mapper.js";
import { initializeSchema } from "./sqlite-schema.js";

export interface SqliteExecutionRepositoryOptions extends SqliteDatabaseOptions {
  readonly dbManager?: SqliteDatabase | undefined;
}

/**
 * Production SQLite durable adapter for ExecutionRepository and ExecutionQueryPort.
 * Implements atomic upsert, query projections, and fail-closed domain rehydration.
 * Crucially, executions maintain logical identity references without physical FK constraints to tasks.
 */
export class SqliteExecutionRepository implements ExecutionRepository, ExecutionQueryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectExecStmt: StatementSync;
  private readonly selectAllExecsStmt: StatementSync;
  private readonly upsertExecStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteExecutionRepositoryOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else if (optionsOrDb && "dbManager" in optionsOrDb && optionsOrDb.dbManager) {
      this.dbManager = optionsOrDb.dbManager;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb as SqliteDatabaseOptions);
    }
    this.db = this.dbManager.open();

    initializeSchema(this.db);

    this.selectExecStmt = this.db.prepare("SELECT * FROM executions WHERE id = ?;");
    this.selectAllExecsStmt = this.db.prepare(
      "SELECT * FROM executions ORDER BY created_at ASC;"
    );
    this.upsertExecStmt = this.db.prepare(`
      INSERT INTO executions (
        id, task_id, trace_id, status, created_at,
        started_at, completed_at, result_metadata, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        trace_id = excluded.trace_id,
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        result_metadata = excluded.result_metadata,
        error_code = excluded.error_code,
        error_message = excluded.error_message;
    `);
  }

  save(execution: Execution): void {
    this.upsertExecStmt.run(
      execution.id,
      execution.taskId,
      execution.traceId,
      execution.status,
      execution.createdAt.toISOString(),
      execution.startedAt ? execution.startedAt.toISOString() : null,
      execution.completedAt ? execution.completedAt.toISOString() : null,
      execution.resultMetadata ? JSON.stringify(execution.resultMetadata) : null,
      execution.error?.code ?? null,
      execution.error?.message ?? null
    );
  }

  findById(id: string): Execution | undefined {
    const row = this.selectExecStmt.get(id) as ExecutionRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToExecution(row);
  }

  findProjectionById(id: string): ExecutionProjection | undefined {
    const row = this.selectExecStmt.get(id) as ExecutionRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToExecutionProjection(row);
  }

  list(): readonly Execution[] {
    const rows = this.selectAllExecsStmt.all() as unknown as ExecutionRow[];
    return rows.map(mapRowToExecution);
  }

  listProjections(): readonly ExecutionProjection[] {
    const rows = this.selectAllExecsStmt.all() as unknown as ExecutionRow[];
    return rows.map(mapRowToExecutionProjection);
  }

  getDatabase(): DatabaseSync {
    return this.db;
  }

  close(): void {
    this.dbManager.close();
  }
}
