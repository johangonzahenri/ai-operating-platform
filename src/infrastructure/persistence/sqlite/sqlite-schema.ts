import { DatabaseSync } from "node:sqlite";
import { IncompatibleSchemaVersionError, SqlitePersistenceError } from "./sqlite-errors.js";

export const CURRENT_SCHEMA_VERSION = 3;

export const V1_CORE_DDL = `
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
`;

export const V2_ADDITIONS_DDL = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '[]',
    memory_scope TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version INTEGER NOT NULL CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    input TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN (
        'CREATED',
        'QUEUED',
        'RUNNING',
        'WAITING',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
      )
    ),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    output TEXT,
    error_code TEXT,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_trace_id ON tasks(trace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN (
        'CREATED',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
      )
    ),
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    result_metadata TEXT,
    error_code TEXT,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
  CREATE INDEX IF NOT EXISTS idx_executions_trace_id ON executions(trace_id);
  CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
  CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
`;

export const V3_ADDITIONS_DDL = `
  CREATE TABLE IF NOT EXISTS events (
    sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT,
    occurred_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
  CREATE INDEX IF NOT EXISTS idx_events_trace_id ON events(trace_id);
  CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
  CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
`;

/**
 * Migrates a database from schema V1 to V2 inside an atomic transaction.
 * Rolls back automatically if any statement or metadata update fails.
 */
export function migrateV1ToV2(db: DatabaseSync, customDdl?: string): void {
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(customDdl ?? V2_ADDITIONS_DDL);

    const updateVersionStmt = db.prepare(`
      UPDATE schema_metadata
      SET value = ?, updated_at = ?
      WHERE key = 'schema_version';
    `);
    updateVersionStmt.run("2", new Date().toISOString());

    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Secondary rollback failure
    }
    throw new SqlitePersistenceError("Failed to migrate SQLite schema from v1 to v2", err);
  }
}

/**
 * Migrates a database from schema V2 to V3 inside an atomic transaction.
 * Rolls back automatically if any statement or metadata update fails.
 */
export function migrateV2ToV3(db: DatabaseSync, customDdl?: string): void {
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(customDdl ?? V3_ADDITIONS_DDL);

    const updateVersionStmt = db.prepare(`
      UPDATE schema_metadata
      SET value = ?, updated_at = ?
      WHERE key = 'schema_version';
    `);
    updateVersionStmt.run("3", new Date().toISOString());

    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Secondary rollback failure
    }
    throw new SqlitePersistenceError("Failed to migrate SQLite schema from v2 to v3", err);
  }
}

/**
 * Initializes and validates the SQLite durable relational schema.
 * Handles fresh database bootstrap (V3), transactional migrations (V1 -> V2 -> V3, V2 -> V3),
 * idempotent no-op (V3), and fail-closed validation on future versions (V4+).
 */
export function initializeSchema(db: DatabaseSync): void {
  try {
    const checkStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_metadata';"
    );
    const hasMetadata = checkStmt.get() !== undefined;

    if (!hasMetadata) {
      // Case A: Fresh database -> bootstrap V1, V2, and V3 tables, set version to 3
      db.exec("BEGIN IMMEDIATE;");
      try {
        db.exec(V1_CORE_DDL);
        db.exec(V2_ADDITIONS_DDL);
        db.exec(V3_ADDITIONS_DDL);

        const nowIso = new Date().toISOString();
        const setVersionStmt = db.prepare(`
          INSERT INTO schema_metadata (key, value, updated_at)
          VALUES ('schema_version', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
        `);
        setVersionStmt.run(CURRENT_SCHEMA_VERSION.toString(), nowIso);

        db.exec("COMMIT;");
      } catch (freshErr) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          // Secondary rollback failure
        }
        throw freshErr;
      }
      return;
    }

    // Existing metadata table found
    const versionStmt = db.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'schema_version';"
    );
    const row = versionStmt.get() as { value: string } | undefined;
    const foundVersion = row ? parseInt(row.value, 10) : 0;

    if (!Number.isInteger(foundVersion) || foundVersion < 1) {
      throw new SqlitePersistenceError(
        `Corrupted schema metadata: invalid schema_version '${row?.value}'`
      );
    }

    // Case D: Future version detected -> fail closed immediately
    if (foundVersion > CURRENT_SCHEMA_VERSION) {
      throw new IncompatibleSchemaVersionError(foundVersion, CURRENT_SCHEMA_VERSION);
    }

    // Case B1: Existing V1 -> run transactional migration V1 to V2, then V2 to V3
    if (foundVersion === 1) {
      migrateV1ToV2(db);
      migrateV2ToV3(db);
      return;
    }

    // Case B2: Existing V2 -> run transactional migration V2 to V3
    if (foundVersion === 2) {
      migrateV2ToV3(db);
      return;
    }

    // Case C: Existing V3 -> idempotent verification
    if (foundVersion === 3) {
      db.exec(V1_CORE_DDL);
      db.exec(V2_ADDITIONS_DDL);
      db.exec(V3_ADDITIONS_DDL);
    }
  } catch (err) {
    if (err instanceof IncompatibleSchemaVersionError || err instanceof SqlitePersistenceError) {
      throw err;
    }
    throw new SqlitePersistenceError("Failed to initialize SQLite schema", err);
  }
}

