import { DatabaseSync } from "node:sqlite";
import { IncompatibleSchemaVersionError, SqlitePersistenceError } from "./sqlite-errors.js";

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Initializes and validates the SQLite durable relational schema.
 * Operates non-destructively: never drops existing tables during bootstrap.
 */
export function initializeSchema(db: DatabaseSync): void {
  try {
    // Check if schema_metadata exists
    const checkStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_metadata';"
    );
    const hasMetadata = checkStmt.get() !== undefined;

    if (hasMetadata) {
      const versionStmt = db.prepare(
        "SELECT value FROM schema_metadata WHERE key = 'schema_version';"
      );
      const row = versionStmt.get() as { value: string } | undefined;
      if (row) {
        const foundVersion = parseInt(row.value, 10);
        if (Number.isInteger(foundVersion) && foundVersion > CURRENT_SCHEMA_VERSION) {
          throw new IncompatibleSchemaVersionError(foundVersion, CURRENT_SCHEMA_VERSION);
        }
      }
    }

    // Initialize core relational tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUBMITTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BUDGET_EXHAUSTED')),
        budget_max_steps INTEGER NOT NULL CHECK (budget_max_steps > 0),
        budget_max_duration_ms INTEGER NOT NULL CHECK (budget_max_duration_ms > 0),
        budget_max_tool_calls INTEGER NOT NULL CHECK (budget_max_tool_calls >= 0),
        budget_max_tokens INTEGER,
        consumption_steps_used INTEGER NOT NULL DEFAULT 0 CHECK (consumption_steps_used >= 0),
        consumption_elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (consumption_elapsed_ms >= 0),
        consumption_tool_calls_used INTEGER NOT NULL DEFAULT 0 CHECK (consumption_tool_calls_used >= 0),
        consumption_tokens_used INTEGER,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        termination_reason TEXT,
        failure_error_code TEXT,
        failure_error_message TEXT,
        result_output TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
      );

      CREATE INDEX IF NOT EXISTS idx_operations_agent_id ON operations(agent_id);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
      CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        total_steps INTEGER NOT NULL CHECK (total_steps >= 1),
        created_at TEXT NOT NULL,
        FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_plans_operation_id ON plans(operation_id);

      CREATE TABLE IF NOT EXISTS plan_steps (
        id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        step_order INTEGER NOT NULL CHECK (step_order >= 1),
        action TEXT NOT NULL,
        input TEXT NOT NULL,
        metadata TEXT,
        PRIMARY KEY (plan_id, id),
        UNIQUE (plan_id, step_order),
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
        FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_plan_steps_operation_id ON plan_steps(operation_id);
      CREATE INDEX IF NOT EXISTS idx_plan_steps_plan_order ON plan_steps(plan_id, step_order);

      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'CANCELLED')),
        duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
        tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (tool_calls >= 0),
        output TEXT,
        error_code TEXT,
        error_message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_operation_id ON observations(operation_id);
      CREATE INDEX IF NOT EXISTS idx_observations_step_id ON observations(step_id);

      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('EXECUTE_STEP', 'COMPLETE', 'STOP', 'FAIL')),
        step_id TEXT,
        action TEXT,
        input TEXT,
        output TEXT,
        reason TEXT,
        failure_error_code TEXT,
        failure_error_message TEXT,
        decided_at TEXT NOT NULL,
        FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_operation_id ON decisions(operation_id);
    `);

    // Record schema version
    const nowIso = new Date().toISOString();
    const setVersionStmt = db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
    `);
    setVersionStmt.run(CURRENT_SCHEMA_VERSION.toString(), nowIso);
  } catch (err) {
    if (err instanceof IncompatibleSchemaVersionError) {
      throw err;
    }
    throw new SqlitePersistenceError("Failed to initialize SQLite schema", err);
  }
}
