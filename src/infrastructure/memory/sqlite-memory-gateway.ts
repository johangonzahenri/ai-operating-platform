import { DatabaseSync } from "node:sqlite";
import {
  MemoryGateway,
  MemoryItem,
  MemoryQuery,
  MemoryValidationError,
} from "../../domain/memory/memory-gateway.js";
import { SqliteDatabase } from "../persistence/sqlite/sqlite-database.js";

export class SqliteMemoryGateway implements MemoryGateway {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.getDatabase();
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS platform_memory (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0,
        UNIQUE(scope, key)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_memory_scope_key ON platform_memory(scope, key);
      CREATE INDEX IF NOT EXISTS idx_platform_memory_scope_updated ON platform_memory(scope, updated_at DESC);
    `);
  }

  async store(item: MemoryItem): Promise<MemoryItem> {
    if (!item?.scope || !item.key) {
      throw new MemoryValidationError("Memory item requires scope and key");
    }

    const scope = item.scope.trim();
    const key = item.key.trim();

    const existingRow = this.db
      .prepare("SELECT id, created_at, updated_at FROM platform_memory WHERE scope = ? AND key = ?")
      .get(scope, key) as { id: string; created_at: string; updated_at: string } | undefined;

    let id = item.id;
    let createdAt = item.createdAt;
    let updatedAt = item.updatedAt;

    if (existingRow) {
      id = existingRow.id;
      createdAt = new Date(existingRow.created_at);
      const existingUpdatedAtTime = new Date(existingRow.updated_at).getTime();
      if (item.updatedAt.getTime() <= existingUpdatedAtTime) {
        updatedAt = new Date(existingUpdatedAtTime + 1);
      }
    }

    const storedItem: MemoryItem = Object.freeze({
      id,
      scope,
      key,
      value: item.value,
      metadata: item.metadata,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
      truncated: item.truncated,
    });

    const stmt = this.db.prepare(`
      INSERT INTO platform_memory (id, scope, key, value_json, metadata_json, created_at, updated_at, truncated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, key) DO UPDATE SET
        value_json = excluded.value_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        truncated = excluded.truncated
    `);

    stmt.run(
      storedItem.id,
      storedItem.scope,
      storedItem.key,
      JSON.stringify(storedItem.value),
      JSON.stringify(storedItem.metadata),
      storedItem.createdAt.toISOString(),
      storedItem.updatedAt.toISOString(),
      storedItem.truncated ? 1 : 0
    );

    return storedItem;
  }

  async retrieve(scope: string, key: string): Promise<MemoryItem | undefined> {
    if (!scope || !key) return undefined;
    const row = this.db
      .prepare("SELECT * FROM platform_memory WHERE scope = ? AND key = ?")
      .get(scope.trim(), key.trim()) as
      | {
          id: string;
          scope: string;
          key: string;
          value_json: string;
          metadata_json: string;
          created_at: string;
          updated_at: string;
          truncated: number;
        }
      | undefined;

    if (!row) return undefined;

    return Object.freeze({
      id: row.id,
      scope: row.scope,
      key: row.key,
      value: Object.freeze(JSON.parse(row.value_json)),
      metadata: Object.freeze(JSON.parse(row.metadata_json)),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      truncated: Boolean(row.truncated),
    });
  }

  async retrieveMany(query: MemoryQuery): Promise<readonly MemoryItem[]> {
    if (!query?.scope?.trim()) {
      throw new MemoryValidationError("Memory query requires a scope");
    }

    const limit = query.limit ?? 16;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new MemoryValidationError("Memory query limit must be between 1 and 100");
    }

    const scope = query.scope.trim();
    let rows: any[];

    if (query.key !== undefined) {
      const key = query.key.trim();
      rows = this.db
        .prepare(
          "SELECT * FROM platform_memory WHERE scope = ? AND key = ? ORDER BY updated_at DESC, key ASC LIMIT ?"
        )
        .all(scope, key, limit);
    } else {
      rows = this.db
        .prepare(
          "SELECT * FROM platform_memory WHERE scope = ? ORDER BY updated_at DESC, key ASC LIMIT ?"
        )
        .all(scope, limit);
    }

    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          scope: row.scope,
          key: row.key,
          value: Object.freeze(JSON.parse(row.value_json)),
          metadata: Object.freeze(JSON.parse(row.metadata_json)),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          truncated: Boolean(row.truncated),
        })
      )
    );
  }

  async delete(scope: string, key: string): Promise<void> {
    if (!scope || !key) return;
    this.db
      .prepare("DELETE FROM platform_memory WHERE scope = ? AND key = ?")
      .run(scope.trim(), key.trim());
  }
}
