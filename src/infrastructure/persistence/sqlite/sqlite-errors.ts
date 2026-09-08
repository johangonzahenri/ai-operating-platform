/**
 * Custom error hierarchy for SQLite persistence infrastructure.
 */

export class SqlitePersistenceError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SqlitePersistenceError";
  }
}

export class IncompatibleSchemaVersionError extends SqlitePersistenceError {
  constructor(readonly foundVersion: number, readonly expectedVersion: number) {
    super(
      `Incompatible SQLite schema version: found ${foundVersion}, expected ${expectedVersion} or lower`
    );
    this.name = "IncompatibleSchemaVersionError";
  }
}

export class OptimisticConcurrencyError extends SqlitePersistenceError {
  constructor(
    readonly operationId: string,
    readonly expectedVersion: number,
    readonly currentVersion?: number
  ) {
    super(
      `Optimistic concurrency conflict on operation '${operationId}': expected version ${expectedVersion}` +
        (currentVersion !== undefined ? `, but current version is ${currentVersion}` : "")
    );
    this.name = "OptimisticConcurrencyError";
  }
}
