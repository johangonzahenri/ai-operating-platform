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
  readonly entityId: string;
  readonly entityType: string;

  constructor(
    operationOrEntityId: string,
    readonly expectedVersion: number,
    readonly currentVersion?: number,
    entityType: string = "operation"
  ) {
    super(
      `Optimistic concurrency conflict on ${entityType} '${operationOrEntityId}': expected version ${expectedVersion}` +
        (currentVersion !== undefined ? `, but current version is ${currentVersion}` : "")
    );
    this.name = "OptimisticConcurrencyError";
    this.entityId = operationOrEntityId;
    this.entityType = entityType;
  }

  get operationId(): string {
    return this.entityId;
  }
}

