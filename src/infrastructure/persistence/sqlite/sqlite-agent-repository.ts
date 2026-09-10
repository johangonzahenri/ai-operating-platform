import { DatabaseSync, StatementSync } from "node:sqlite";
import { AgentProjection, AgentQueryPort } from "../../../application/ports/query-ports.js";
import {
  Agent,
  AgentAlreadyExistsError,
  AgentNotFoundError,
} from "../../../domain/agent/agent.js";
import { AgentRegistry } from "../../../domain/agent/agent-registry.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { OptimisticConcurrencyError, SqlitePersistenceError } from "./sqlite-errors.js";
import {
  AgentRow,
  mapRowToAgent,
  mapRowToAgentProjection,
} from "./sqlite-mapper.js";
import { initializeSchema } from "./sqlite-schema.js";

export interface SqliteAgentRepositoryOptions extends SqliteDatabaseOptions {
  readonly dbManager?: SqliteDatabase | undefined;
}

/**
 * Production SQLite durable adapter for AgentRegistry and AgentQueryPort.
 * Enforces strict OCC versioning on updates, duplicate detection on registration,
 * query projections, and fail-closed domain rehydration.
 */
export class SqliteAgentRepository implements AgentRegistry, AgentQueryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectAgentStmt: StatementSync;
  private readonly selectAllAgentsStmt: StatementSync;
  private readonly insertAgentStmt: StatementSync;
  private readonly updateAgentStmt: StatementSync;
  private readonly deleteAgentStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteAgentRepositoryOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else if (optionsOrDb && "dbManager" in optionsOrDb && optionsOrDb.dbManager) {
      this.dbManager = optionsOrDb.dbManager;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb as SqliteDatabaseOptions);
    }
    this.db = this.dbManager.open();

    initializeSchema(this.db);

    this.selectAgentStmt = this.db.prepare("SELECT * FROM agents WHERE id = ?;");
    this.selectAllAgentsStmt = this.db.prepare(
      "SELECT * FROM agents ORDER BY created_at ASC;"
    );
    this.insertAgentStmt = this.db.prepare(`
      INSERT INTO agents (
        id, name, description, model, instructions, tools,
        memory_scope, status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    this.updateAgentStmt = this.db.prepare(`
      UPDATE agents SET
        name = ?, description = ?, model = ?, instructions = ?, tools = ?,
        memory_scope = ?, status = ?, version = ?, updated_at = ?
      WHERE id = ? AND version = ?;
    `);
    this.deleteAgentStmt = this.db.prepare("DELETE FROM agents WHERE id = ?;");
  }

  register(agent: Agent): void {
    const existing = this.selectAgentStmt.get(agent.id) as AgentRow | undefined;
    if (existing) {
      throw new AgentAlreadyExistsError(agent.id);
    }

    try {
      this.insertAgentStmt.run(
        agent.id,
        agent.name,
        agent.description,
        agent.model,
        agent.instructions,
        JSON.stringify(agent.tools),
        agent.memoryScope ?? `agent-${agent.id}`,
        agent.status,
        agent.version,
        agent.createdAt.toISOString(),
        agent.updatedAt.toISOString()
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
        throw new AgentAlreadyExistsError(agent.id);
      }
      throw new SqlitePersistenceError(`Failed to register agent '${agent.id}'`, err);
    }
  }

  findById(id: string): Agent | undefined {
    const row = this.selectAgentStmt.get(id) as AgentRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToAgent(row);
  }

  findProjectionById(id: string): AgentProjection | undefined {
    const row = this.selectAgentStmt.get(id) as AgentRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToAgentProjection(row);
  }

  list(): readonly Agent[] {
    const rows = this.selectAllAgentsStmt.all() as unknown as AgentRow[];
    return rows.map(mapRowToAgent);
  }

  listProjections(): readonly AgentProjection[] {
    const rows = this.selectAllAgentsStmt.all() as unknown as AgentRow[];
    return rows.map(mapRowToAgentProjection);
  }

  update(agent: Agent): void {
    const existing = this.selectAgentStmt.get(agent.id) as AgentRow | undefined;
    if (!existing) {
      throw new AgentNotFoundError(agent.id);
    }

    const currentDbVersion = existing.version;

    // Detect if caller snapshot is based on an older version
    if (agent.version < currentDbVersion) {
      throw new OptimisticConcurrencyError(
        agent.id,
        agent.version,
        currentDbVersion,
        "agent"
      );
    }

    let expectedVersion: number;
    let targetVersion: number;

    if (agent.version === currentDbVersion + 1) {
      // Standard progression from agent.update()
      expectedVersion = currentDbVersion;
      targetVersion = agent.version;
    } else if (agent.version === currentDbVersion) {
      // State transition preserving version (activate/deactivate)
      // Verify configuration has not diverged from currentDbVersion snapshot
      let toolsMatch = false;
      try {
        const existingTools = JSON.parse(existing.tools);
        toolsMatch =
          Array.isArray(existingTools) &&
          existingTools.length === agent.tools.length &&
          existingTools.every((t, i) => t === agent.tools[i]);
      } catch {
        toolsMatch = false;
      }

      const configMatches =
        agent.name === existing.name &&
        agent.description === existing.description &&
        agent.model === existing.model &&
        agent.instructions === existing.instructions &&
        (agent.memoryScope ?? `agent-${agent.id}`) === existing.memory_scope &&
        toolsMatch;

      if (!configMatches) {
        // Configuration diverged: this is an update derived from an older version
        throw new OptimisticConcurrencyError(
          agent.id,
          agent.version - 1,
          currentDbVersion,
          "agent"
        );
      }

      expectedVersion = currentDbVersion;
      targetVersion = currentDbVersion;
    } else {
      // Version jumped ahead by more than 1
      throw new OptimisticConcurrencyError(
        agent.id,
        agent.version,
        currentDbVersion,
        "agent"
      );
    }

    const result = this.updateAgentStmt.run(
      agent.name,
      agent.description,
      agent.model,
      agent.instructions,
      JSON.stringify(agent.tools),
      agent.memoryScope ?? `agent-${agent.id}`,
      agent.status,
      targetVersion,
      agent.updatedAt.toISOString(),
      agent.id,
      expectedVersion
    );

    if (result.changes === 0) {
      throw new OptimisticConcurrencyError(
        agent.id,
        expectedVersion,
        undefined,
        "agent"
      );
    }
  }


  delete(id: string): void {
    this.deleteAgentStmt.run(id);
  }

  getDatabase(): DatabaseSync {
    return this.db;
  }

  close(): void {
    this.dbManager.close();
  }
}
