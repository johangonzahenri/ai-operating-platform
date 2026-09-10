import { TransactionRunner } from "../../../application/ports/recovery-port.js";
import { SqliteDatabase } from "./sqlite-database.js";

/**
 * SQLite durable adapter for TransactionRunner, delegating to SqliteDatabase.transaction().
 */
export class SqliteTransactionRunner implements TransactionRunner {
  constructor(private readonly dbManager: SqliteDatabase) {}

  run<T>(fn: () => T): T {
    return this.dbManager.transaction(fn);
  }
}
