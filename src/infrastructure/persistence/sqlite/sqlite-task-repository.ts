import { DatabaseSync, StatementSync } from "node:sqlite";
import { TaskProjection, TaskQueryPort } from "../../../application/ports/query-ports.js";
import { Task, TaskRepository } from "../../../domain/task/task.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import {
  mapRowToTask,
  mapRowToTaskProjection,
  TaskRow,
} from "./sqlite-mapper.js";
import { initializeSchema } from "./sqlite-schema.js";

export interface SqliteTaskRepositoryOptions extends SqliteDatabaseOptions {
  readonly dbManager?: SqliteDatabase | undefined;
}

/**
 * Production SQLite durable adapter for TaskRepository and TaskQueryPort.
 * Manages atomic upsert, query projections, and fail-closed domain rehydration.
 */
export class SqliteTaskRepository implements TaskRepository, TaskQueryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectTaskStmt: StatementSync;
  private readonly selectAllTasksStmt: StatementSync;
  private readonly upsertTaskStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteTaskRepositoryOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else if (optionsOrDb && "dbManager" in optionsOrDb && optionsOrDb.dbManager) {
      this.dbManager = optionsOrDb.dbManager;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb as SqliteDatabaseOptions);
    }
    this.db = this.dbManager.open();

    initializeSchema(this.db);

    this.selectTaskStmt = this.db.prepare("SELECT * FROM tasks WHERE id = ?;");
    this.selectAllTasksStmt = this.db.prepare(
      "SELECT * FROM tasks ORDER BY created_at ASC;"
    );
    this.upsertTaskStmt = this.db.prepare(`
      INSERT INTO tasks (
        id, trace_id, agent_id, input, status, created_at,
        completed_at, output, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        trace_id = excluded.trace_id,
        agent_id = excluded.agent_id,
        input = excluded.input,
        status = excluded.status,
        completed_at = excluded.completed_at,
        output = excluded.output,
        error_code = excluded.error_code,
        error_message = excluded.error_message;
    `);
  }

  save(task: Task): void {
    this.upsertTaskStmt.run(
      task.id,
      task.traceId,
      task.request.agentId,
      JSON.stringify(task.request.input),
      task.status,
      task.createdAt.toISOString(),
      task.result?.completedAt ? task.result.completedAt.toISOString() : null,
      task.result?.output ? JSON.stringify(task.result.output) : null,
      task.error?.code ?? null,
      task.error?.message ?? null
    );
  }

  findById(id: string): Task | undefined {
    const row = this.selectTaskStmt.get(id) as TaskRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToTask(row);
  }

  findProjectionById(id: string): TaskProjection | undefined {
    const row = this.selectTaskStmt.get(id) as TaskRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToTaskProjection(row);
  }

  list(): readonly Task[] {
    const rows = this.selectAllTasksStmt.all() as unknown as TaskRow[];
    return rows.map(mapRowToTask);
  }

  listProjections(): readonly TaskProjection[] {
    const rows = this.selectAllTasksStmt.all() as unknown as TaskRow[];
    return rows.map(mapRowToTaskProjection);
  }

  getDatabase(): DatabaseSync {
    return this.db;
  }

  close(): void {
    this.dbManager.close();
  }
}
