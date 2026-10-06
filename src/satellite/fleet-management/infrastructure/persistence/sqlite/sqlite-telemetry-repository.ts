/**
 * sqlite-telemetry-repository.ts
 * PROJ-03 Fleet Management & Logistics — Isolated SQLite Telemetry History Repository Adapter
 * 
 * Invariants:
 * 1. Strict Tenant Isolation: tenantId is mandatory on every operation. Fail-closed.
 * 2. Immutable Append-Only: No UPDATEs allowed on telemetry series.
 * 3. Store-and-Forward Idempotency: Duplicate (tenant_id, vehicle_id, timestamp) packets
 *    are safely ignored without crashing batch processing.
 * 4. Zero Core Engine dependencies.
 */

import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  VehicleId,
  TenantId,
  TelemetrySnapshot,
  TelemetryHistoryRepository,
  QueryTelemetryOptions,
  TelemetryAuditMetadata,
  BatchAppendResult
} from '../../../domain/index.js';
import { FleetSqliteDatabase, FleetSqliteDatabaseOptions } from './fleet-sqlite-database.js';
import { initializeFleetSchema } from './fleet-sqlite-schema.js';
import {
  mapRowToTelemetrySnapshot,
  mapTelemetrySnapshotToRow,
  TelemetryRow
} from './fleet-mapper.js';
import {
  FleetSecurityViolationError
} from './fleet-sqlite-errors.js';

export class SqliteTelemetryHistoryRepository implements TelemetryHistoryRepository {
  private readonly dbManager: FleetSqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly insertTelemetryStmt: StatementSync;
  private readonly selectLatestStmt: StatementSync;
  private readonly pruneStmt: StatementSync;

  constructor(optionsOrDb: FleetSqliteDatabase | FleetSqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof FleetSqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new FleetSqliteDatabase(optionsOrDb);
    }

    this.db = this.dbManager.open();
    initializeFleetSchema(this.db);

    this.insertTelemetryStmt = this.db.prepare(`
      INSERT OR IGNORE INTO fleet_telemetry_history (
        id, tenant_id, vehicle_id, device_id, timestamp,
        latitude, longitude, altitude_m, speed_kmh, heading_deg,
        odometer_km, engine_rpm, fuel_percent, coolant_temp_c,
        dtc_codes_json, raw_json, ingested_at, is_out_of_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    this.selectLatestStmt = this.db.prepare(`
      SELECT * FROM fleet_telemetry_history
      WHERE tenant_id = ? AND vehicle_id = ?
      ORDER BY timestamp DESC
      LIMIT 1;
    `);

    this.pruneStmt = this.db.prepare(`
      DELETE FROM fleet_telemetry_history
      WHERE tenant_id = ? AND timestamp < ?;
    `);
  }

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

    const orderDirection = options?.ascending ? 'ASC' : 'DESC';
    let sql = `
      SELECT * FROM fleet_telemetry_history
      WHERE tenant_id = ? AND vehicle_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ${orderDirection}
    `;

    const params: (string | number)[] = [tenantId, vehicleId, from, to];

    if (options?.limit && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as TelemetryRow[];
    return Object.freeze(rows.map(mapRowToTelemetrySnapshot));
  }

  public async findLatestByVehicle(
    vehicleId: VehicleId,
    tenantId: TenantId
  ): Promise<TelemetrySnapshot | null> {
    this.assertValidTenant(tenantId);
    if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
      throw new FleetSecurityViolationError('vehicleId es requerido y no puede ser vacío');
    }

    const row = this.selectLatestStmt.get(tenantId, vehicleId) as TelemetryRow | undefined;
    if (!row) {
      return null;
    }
    return mapRowToTelemetrySnapshot(row);
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

    const row = mapTelemetrySnapshotToRow(snapshot, tenantId, metadata);

    this.insertTelemetryStmt.run(
      row.id,
      row.tenant_id,
      row.vehicle_id,
      row.device_id,
      row.timestamp,
      row.latitude,
      row.longitude,
      row.altitude_m,
      row.speed_kmh,
      row.heading_deg,
      row.odometer_km,
      row.engine_rpm,
      row.fuel_percent,
      row.coolant_temp_c,
      row.dtc_codes_json,
      row.raw_json,
      row.ingested_at,
      row.is_out_of_order
    );
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

    this.dbManager.transaction(() => {
      for (const snapshot of snapshots) {
        const row = mapTelemetrySnapshotToRow(snapshot, tenantId);
        const info = this.insertTelemetryStmt.run(
          row.id,
          row.tenant_id,
          row.vehicle_id,
          row.device_id,
          row.timestamp,
          row.latitude,
          row.longitude,
          row.altitude_m,
          row.speed_kmh,
          row.heading_deg,
          row.odometer_km,
          row.engine_rpm,
          row.fuel_percent,
          row.coolant_temp_c,
          row.dtc_codes_json,
          row.raw_json,
          row.ingested_at,
          row.is_out_of_order
        );

        if (info.changes > 0) {
          insertedCount++;
        } else {
          duplicateCount++;
        }
      }
    });

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

    const info = this.pruneStmt.run(tenantId, cutoff);
    return info.changes;
  }

  private assertValidTenant(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new FleetSecurityViolationError('tenantId es obligatorio y no puede ser nulo o vacío');
    }
  }
}
