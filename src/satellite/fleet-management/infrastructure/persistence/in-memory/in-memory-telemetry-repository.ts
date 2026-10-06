/**
 * in-memory-telemetry-repository.ts
 * PROJ-03 Fleet Management & Logistics — In-Memory Telemetry History Repository Adapter
 * 
 * Invariants:
 * 1. Strict Tenant Isolation: tenantId is mandatory on every query. Fail-closed.
 * 2. Immutable Append-Only: No modifications to persisted snapshots.
 * 3. Store-and-Forward Idempotency: Duplicate (tenant_id, vehicle_id, timestamp) ignored.
 * 4. Zero Core Engine dependencies.
 */

import {
  VehicleId,
  TenantId,
  TelemetrySnapshot,
  TelemetryHistoryRepository,
  QueryTelemetryOptions,
  TelemetryAuditMetadata,
  BatchAppendResult
} from '../../../domain/index.js';
import {
  FleetSecurityViolationError
} from '../sqlite/fleet-sqlite-errors.js';

interface StoredTelemetryEntry {
  readonly tenantId: TenantId;
  readonly vehicleId: VehicleId;
  readonly timestamp: number;
  readonly snapshot: TelemetrySnapshot;
  readonly metadata?: TelemetryAuditMetadata;
}

export class InMemoryTelemetryHistoryRepository implements TelemetryHistoryRepository {
  // Key: `${tenantId}:::${vehicleId}:::${timestamp}`
  private readonly entries: Map<string, StoredTelemetryEntry> = new Map();

  public async findByVehicleAndRange(
    vehicleId: VehicleId,
    tenantId: TenantId,
    fromTimestamp: number | Date,
    toTimestamp: number | Date,
    options?: QueryTelemetryOptions
  ): Promise<readonly TelemetrySnapshot[]> {
    this.assertValidTenant(tenantId);
    if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
      throw new FleetSecurityViolationError('vehicleId es requerido y no puede ser vacío');
    }

    const from = typeof fromTimestamp === 'number' ? fromTimestamp : fromTimestamp.getTime();
    const to = typeof toTimestamp === 'number' ? toTimestamp : toTimestamp.getTime();

    if (isNaN(from) || isNaN(to)) {
      throw new FleetSecurityViolationError('Marcas temporales inválidas en la consulta de telemetría');
    }

    const matches: StoredTelemetryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (
        entry.tenantId === tenantId &&
        entry.vehicleId === vehicleId &&
        entry.timestamp >= from &&
        entry.timestamp <= to
      ) {
        matches.push(entry);
      }
    }

    if (options?.ascending) {
      matches.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      matches.sort((a, b) => b.timestamp - a.timestamp);
    }

    const result = matches.map(e => e.snapshot);

    if (options?.limit && options.limit > 0) {
      return Object.freeze(result.slice(0, options.limit));
    }

    return Object.freeze(result);
  }

  public async findLatestByVehicle(
    vehicleId: VehicleId,
    tenantId: TenantId
  ): Promise<TelemetrySnapshot | null> {
    this.assertValidTenant(tenantId);
    if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
      throw new FleetSecurityViolationError('vehicleId es requerido y no puede ser vacío');
    }

    let latest: StoredTelemetryEntry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.tenantId === tenantId && entry.vehicleId === vehicleId) {
        if (!latest || entry.timestamp > latest.timestamp) {
          latest = entry;
        }
      }
    }

    return latest ? latest.snapshot : null;
  }

  public async append(
    snapshot: TelemetrySnapshot,
    tenantId: TenantId,
    metadata?: TelemetryAuditMetadata
  ): Promise<void> {
    this.assertValidTenant(tenantId);
    if (!snapshot) {
      throw new FleetSecurityViolationError('TelemetrySnapshot no puede ser nulo');
    }

    const key = this.buildKey(tenantId, snapshot.vehicleId, snapshot.timestamp);
    if (this.entries.has(key)) {
      // Idempotente: ignorar duplicado de store-and-forward
      return;
    }

    this.entries.set(key, {
      tenantId,
      vehicleId: snapshot.vehicleId,
      timestamp: snapshot.timestamp,
      snapshot,
      metadata
    });
  }

  public async appendBatch(
    snapshots: readonly TelemetrySnapshot[],
    tenantId: TenantId
  ): Promise<BatchAppendResult> {
    this.assertValidTenant(tenantId);
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return { insertedCount: 0, duplicateCount: 0 };
    }

    let insertedCount = 0;
    let duplicateCount = 0;

    for (const snapshot of snapshots) {
      const key = this.buildKey(tenantId, snapshot.vehicleId, snapshot.timestamp);
      if (this.entries.has(key)) {
        duplicateCount++;
      } else {
        this.entries.set(key, {
          tenantId,
          vehicleId: snapshot.vehicleId,
          timestamp: snapshot.timestamp,
          snapshot
        });
        insertedCount++;
      }
    }

    return { insertedCount, duplicateCount };
  }

  public async pruneOlderThan(
    cutoffTimestamp: number | Date,
    tenantId: TenantId
  ): Promise<number> {
    this.assertValidTenant(tenantId);
    const cutoff = typeof cutoffTimestamp === 'number' ? cutoffTimestamp : cutoffTimestamp.getTime();
    if (isNaN(cutoff)) {
      throw new FleetSecurityViolationError('cutoffTimestamp inválido');
    }

    let deletedCount = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.tenantId === tenantId && entry.timestamp < cutoff) {
        this.entries.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Limpia todos los registros en memoria (útil para reinicio de tests).
   */
  public clear(): void {
    this.entries.clear();
  }

  private buildKey(tenantId: TenantId, vehicleId: VehicleId, timestamp: number): string {
    return `${tenantId}:::${vehicleId}:::${timestamp}`;
  }

  private assertValidTenant(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new FleetSecurityViolationError('tenantId es obligatorio y no puede ser nulo o vacío');
    }
  }
}
