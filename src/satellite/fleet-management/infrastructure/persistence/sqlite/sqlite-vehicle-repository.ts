/**
 * sqlite-vehicle-repository.ts
 * PROJ-03 Fleet Management & Logistics — Isolated SQLite Vehicle Repository Adapter
 * 
 * Invariants:
 * 1. Strict Tenant Isolation: tenantId is mandatory on every query. Fail-closed.
 * 2. Optimistic Concurrency Control (OCC): Prevents silent overwrite using version column.
 * 3. Identity uniqueness: Enforces unique VIN and license plate per tenant.
 * 4. Zero Core Engine dependencies.
 */

import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  Vehicle,
  VehicleId,
  TenantId,
  VehicleRepository,
  VehicleFilter
} from '../../../domain/index.js';
import { FleetSqliteDatabase, FleetSqliteDatabaseOptions } from './fleet-sqlite-database.js';
import { initializeFleetSchema } from './fleet-sqlite-schema.js';
import {
  mapRowToVehicle,
  mapVehicleToRow,
  VehicleRow
} from './fleet-mapper.js';
import {
  FleetSecurityViolationError,
  FleetOptimisticConcurrencyError,
  FleetDuplicateVehicleError
} from './fleet-sqlite-errors.js';

export class SqliteVehicleRepository implements VehicleRepository {
  private readonly dbManager: FleetSqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectByIdStmt: StatementSync;
  private readonly selectByVinStmt: StatementSync;
  private readonly selectByPlateStmt: StatementSync;
  private readonly insertVehicleStmt: StatementSync;
  private readonly updateVehicleStmt: StatementSync;

  constructor(optionsOrDb: FleetSqliteDatabase | FleetSqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof FleetSqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new FleetSqliteDatabase(optionsOrDb);
    }

    this.db = this.dbManager.open();
    initializeFleetSchema(this.db);

    this.selectByIdStmt = this.db.prepare(
      'SELECT * FROM fleet_vehicles WHERE tenant_id = ? AND id = ?;'
    );
    this.selectByVinStmt = this.db.prepare(
      'SELECT * FROM fleet_vehicles WHERE tenant_id = ? AND vin = ?;'
    );
    this.selectByPlateStmt = this.db.prepare(
      'SELECT * FROM fleet_vehicles WHERE tenant_id = ? AND plate_number = ?;'
    );

    this.insertVehicleStmt = this.db.prepare(`
      INSERT INTO fleet_vehicles (
        id, tenant_id, fleet_id, vin, plate_number, make, model, year,
        state, odometer_km, assigned_device_id, assigned_route_plan_id,
        current_telemetry_json, status_history_json, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    this.updateVehicleStmt = this.db.prepare(`
      UPDATE fleet_vehicles SET
        fleet_id = ?,
        vin = ?,
        plate_number = ?,
        make = ?,
        model = ?,
        year = ?,
        state = ?,
        odometer_km = ?,
        assigned_device_id = ?,
        assigned_route_plan_id = ?,
        current_telemetry_json = ?,
        status_history_json = ?,
        updated_at = ?,
        version = version + 1
      WHERE tenant_id = ? AND id = ? AND version = ?;
    `);
  }

  public async findById(vehicleId: VehicleId, tenantId: TenantId): Promise<Vehicle | null> {
    this.assertValidTenant(tenantId);
    if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
      throw new FleetSecurityViolationError('vehicleId es requerido y no puede ser vacío');
    }

    const row = this.selectByIdStmt.get(tenantId, vehicleId) as VehicleRow | undefined;
    if (!row) {
      return null;
    }
    return mapRowToVehicle(row);
  }

  public async findByVin(vin: string, tenantId: TenantId): Promise<Vehicle | null> {
    this.assertValidTenant(tenantId);
    if (!vin || typeof vin !== 'string' || vin.trim() === '') {
      throw new FleetSecurityViolationError('vin es requerido y no puede ser vacío');
    }

    const row = this.selectByVinStmt.get(tenantId, vin) as VehicleRow | undefined;
    if (!row) {
      return null;
    }
    return mapRowToVehicle(row);
  }

  public async listByTenant(tenantId: TenantId, filter?: VehicleFilter): Promise<readonly Vehicle[]> {
    this.assertValidTenant(tenantId);

    let sql = 'SELECT * FROM fleet_vehicles WHERE tenant_id = ?';
    const params: (string | number)[] = [tenantId];

    if (filter?.status) {
      sql += ' AND state = ?';
      params.push(filter.status);
    }
    if (filter?.fleetId) {
      sql += ' AND fleet_id = ?';
      params.push(filter.fleetId);
    }
    if (filter?.make) {
      sql += ' AND make = ?';
      params.push(filter.make);
    }

    sql += ' ORDER BY created_at ASC';

    if (filter?.limit && filter.limit > 0) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as VehicleRow[];
    return Object.freeze(rows.map(mapRowToVehicle));
  }

  public async save(vehicle: Vehicle): Promise<void> {
    this.assertValidTenant(vehicle.tenantId);

    const row = mapVehicleToRow(vehicle);

    this.dbManager.transaction(() => {
      const existing = this.selectByIdStmt.get(vehicle.tenantId, vehicle.vehicleId) as VehicleRow | undefined;

      if (!existing) {
        // Verificar que no existan colisiones de VIN o Patente dentro del mismo tenant
        const vinConflict = this.selectByVinStmt.get(vehicle.tenantId, vehicle.vin) as VehicleRow | undefined;
        if (vinConflict) {
          throw new FleetDuplicateVehicleError('vin', vehicle.vin);
        }
        const plateConflict = this.selectByPlateStmt.get(vehicle.tenantId, vehicle.licensePlate) as VehicleRow | undefined;
        if (plateConflict) {
          throw new FleetDuplicateVehicleError('licensePlate', vehicle.licensePlate);
        }

        // Insertar nuevo vehículo en versión 1
        this.insertVehicleStmt.run(
          row.id,
          row.tenant_id,
          row.fleet_id,
          row.vin,
          row.plate_number,
          row.make,
          row.model,
          row.year,
          row.state,
          row.odometer_km,
          row.assigned_device_id,
          row.assigned_route_plan_id,
          row.current_telemetry_json,
          row.status_history_json,
          row.created_at,
          row.updated_at,
          row.version
        );
      } else {
        // Validación estricta de OCC
        if (existing.version !== vehicle.version) {
          throw new FleetOptimisticConcurrencyError(
            vehicle.vehicleId,
            vehicle.version,
            existing.version
          );
        }

        const info = this.updateVehicleStmt.run(
          row.fleet_id,
          row.vin,
          row.plate_number,
          row.make,
          row.model,
          row.year,
          row.state,
          row.odometer_km,
          row.assigned_device_id,
          row.assigned_route_plan_id,
          row.current_telemetry_json,
          row.status_history_json,
          row.updated_at,
          row.tenant_id,
          row.id,
          row.version
        );

        if (info.changes === 0) {
          throw new FleetOptimisticConcurrencyError(
            vehicle.vehicleId,
            vehicle.version,
            existing.version
          );
        }

        // Incrementar versión en el agregado en memoria tras éxito
        vehicle.incrementVersion();
      }
    });
  }

  private assertValidTenant(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new FleetSecurityViolationError('tenantId es obligatorio y no puede ser nulo o vacío');
    }
  }
}
