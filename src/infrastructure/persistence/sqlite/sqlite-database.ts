import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface SqliteDatabaseOptions {
  readonly dbPath?: string | undefined;
}

/**
 * Manages the connection lifecycle, directory resolution, controlled pragmas,
 * and atomic transactions for a node:sqlite DatabaseSync instance.
 */
export class SqliteDatabase {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;
  private readonly isMemory: boolean;

  constructor(options: SqliteDatabaseOptions = {}) {
    const rawPath = options.dbPath ?? "data/app.db";
    this.isMemory = rawPath === ":memory:";
    this.dbPath = this.isMemory ? ":memory:" : resolve(process.cwd(), rawPath);
  }

  /**
   * Opens the SQLite connection, creating parent directories if needed,
   * and applying platform durability & integrity pragmas.
   */
  open(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    if (!this.isMemory) {
      const dir = dirname(this.dbPath);
      mkdirSync(dir, { recursive: true });
    }

    const db = new DatabaseSync(this.dbPath);

    // Enforce foreign key constraints across all relationships
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");

    if (!this.isMemory) {
      // WAL mode provides concurrency and crash recovery durability
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = NORMAL;");
    }

    this.db = db;
    return this.db;
  }

  /**
   * Retrieves the active database connection, opening it if not already open.
   */
  getDatabase(): DatabaseSync {
    if (!this.db) {
      return this.open();
    }
    return this.db;
  }

  private inTransaction = false;

  /**
   * Executes a synchronous callback within an atomic transaction.
   * If already within a transaction, executes the callback directly (re-entrant),
   * allowing outer transactional boundaries (e.g. RestartRecoveryService) to manage the atomic scope.
   * If the callback throws, any mutations are rolled back immediately.
   */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) {
      return fn();
    }

    const db = this.getDatabase();
    db.exec("BEGIN IMMEDIATE;");
    this.inTransaction = true;
    try {
      const result = fn();
      db.exec("COMMIT;");
      this.inTransaction = false;
      return result;
    } catch (err) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // Rollback failure is secondary to original exception
      } finally {
        this.inTransaction = false;
      }
      throw err;
    }
  }

  /**
   * Closes the database connection cleanly.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  getPath(): string {
    return this.dbPath;
  }
}
