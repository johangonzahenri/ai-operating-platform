/**
 * fleet-sqlite-database.ts
 * PROJ-03 Fleet Management & Logistics — Isolated Satellite SQLite Connection Manager
 * 
 * Invariants:
 * 1. Dedicated file: Uses data/fleet-management.db or :memory:, NEVER data/platform.db.
 * 2. Pragma governance: Foreign keys ON, WAL mode, 5000ms busy timeout.
 * 3. Atomic transactions: Re-entrant safe BEGIN IMMEDIATE / COMMIT / ROLLBACK.
 * 4. Zero Platform Core dependencies: Native node:sqlite DatabaseSync instance.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FleetDatabaseLockedError, FleetPersistenceError } from './fleet-sqlite-errors.js';

export interface FleetSqliteDatabaseOptions {
  readonly dbPath?: string | undefined;
  readonly filename?: string | undefined;
}

export class FleetSqliteDatabase {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;
  private readonly isMemory: boolean;
  private inTransaction: boolean = false;

  constructor(options: FleetSqliteDatabaseOptions = {}) {
    const rawPath = options.dbPath ?? options.filename ?? 'data/fleet-management.db';
    this.isMemory = rawPath === ':memory:';
    this.dbPath = this.isMemory ? ':memory:' : resolve(process.cwd(), rawPath);
  }

  /**
   * Abre la conexión SQLite dedicada y aplica los pragmas de integridad y durabilidad.
   */
  public open(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    if (!this.isMemory) {
      const dir = dirname(this.dbPath);
      mkdirSync(dir, { recursive: true });
    }

    try {
      const db = new DatabaseSync(this.dbPath);

      // 1. Integridad referencial
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');

      // 2. Concurrencia y durabilidad WAL (solo en disco)
      if (!this.isMemory) {
        db.exec('PRAGMA journal_mode = WAL;');
        db.exec('PRAGMA synchronous = NORMAL;');
      }

      this.db = db;
      return this.db;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('busy') || message.includes('locked')) {
        throw new FleetDatabaseLockedError();
      }
      throw new FleetPersistenceError(`Error al inicializar base de datos satélite SQLite: ${message}`);
    }
  }

  /**
   * Devuelve la instancia activa de DatabaseSync, inicializándola si no está abierta.
   */
  public getDatabase(): DatabaseSync {
    if (!this.db) {
      return this.open();
    }
    return this.db;
  }

  /**
   * Indica si la conexión se encuentra actualmente abierta.
   */
  public isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * Cierra de forma determinista la conexión activa liberando los descriptores de archivo.
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } finally {
        this.db = null;
        this.inTransaction = false;
      }
    }
  }

  /**
   * Ejecuta una función dentro de una transacción atómica BEGIN IMMEDIATE ... COMMIT.
   * En caso de excepción, ejecuta ROLLBACK y relanza el error.
   */
  public transaction<T>(fn: () => T): T {
    const db = this.getDatabase();

    // Soporte re-entrante si ya nos encontramos en una transacción
    if (this.inTransaction) {
      return fn();
    }

    this.inTransaction = true;
    try {
      db.exec('BEGIN IMMEDIATE;');
      const result = fn();
      db.exec('COMMIT;');
      return result;
    } catch (err: unknown) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Rollback silencioso si ya se había abortado
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('busy') || message.includes('locked')) {
        throw new FleetDatabaseLockedError();
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}
