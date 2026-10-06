/**
 * fleet-sqlite-errors.ts
 * PROJ-03 Fleet Management & Logistics — Satellite Persistence Errors
 * 
 * Typed domain/infrastructure error models for isolated SQLite operations.
 * Zero platform Core Engine dependencies.
 */

export class FleetPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetPersistenceError';
  }
}

export class FleetDatabaseLockedError extends FleetPersistenceError {
  constructor(message: string = 'La base de datos de flotas está bloqueada por operaciones concurrentes (SQLITE_BUSY)') {
    super(message);
    this.name = 'FleetDatabaseLockedError';
  }
}

export class FleetOptimisticConcurrencyError extends FleetPersistenceError {
  public readonly aggregateId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion?: number;

  constructor(aggregateId: string, expectedVersion: number, actualVersion?: number) {
    super(
      `Conflicto de concurrencia optimista en vehículo '${aggregateId}': versión esperada ${expectedVersion}, versión actual ${actualVersion ?? 'desconocida'}`
    );
    this.name = 'FleetOptimisticConcurrencyError';
    this.aggregateId = aggregateId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class FleetVehicleNotFoundError extends FleetPersistenceError {
  public readonly vehicleId: string;
  public readonly tenantId: string;

  constructor(vehicleId: string, tenantId: string) {
    super(`Vehículo con ID '${vehicleId}' no encontrado en tenant '${tenantId}'`);
    this.name = 'FleetVehicleNotFoundError';
    this.vehicleId = vehicleId;
    this.tenantId = tenantId;
  }
}

export class FleetDuplicateVehicleError extends FleetPersistenceError {
  public readonly identityKey: string;
  public readonly value: string;

  constructor(identityKey: string, value: string) {
    super(`Conflicto de identidad vehicular duplicada: clave '${identityKey}' con valor '${value}' ya existe`);
    this.name = 'FleetDuplicateVehicleError';
    this.identityKey = identityKey;
    this.value = value;
  }
}

export class FleetSecurityViolationError extends FleetPersistenceError {
  constructor(message: string) {
    super(`Violación de seguridad / frontera multi-tenant en persistencia: ${message}`);
    this.name = 'FleetSecurityViolationError';
  }
}
