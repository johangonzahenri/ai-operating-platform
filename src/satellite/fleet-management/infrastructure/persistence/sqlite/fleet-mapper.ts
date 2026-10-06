/**
 * fleet-mapper.ts
 * PROJ-03 Fleet Management & Logistics — Persistence Data Mapper
 * 
 * Explicit bidirectional mapping between domain aggregate/value objects
 * and relational SQLite rows. Zero reflection or magic stringification.
 */

import {
  Vehicle,
  VehicleOperationalStatus,
  TelemetrySnapshot,
  StateTransitionRecord
} from '../../../domain/index.js';
import { TelemetryAuditMetadata } from '../../../domain/repository-ports.js';

export interface VehicleRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly fleet_id: string;
  readonly vin: string;
  readonly plate_number: string;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly state: string;
  readonly odometer_km: number;
  readonly assigned_device_id: string | null;
  readonly assigned_route_plan_id: string | null;
  readonly current_telemetry_json: string | null;
  readonly status_history_json: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly version: number;
}

export interface TelemetryRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly vehicle_id: string;
  readonly device_id: string;
  readonly timestamp: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude_m: number | null;
  readonly speed_kmh: number;
  readonly heading_deg: number;
  readonly odometer_km: number;
  readonly engine_rpm: number | null;
  readonly fuel_percent: number | null;
  readonly coolant_temp_c: number | null;
  readonly dtc_codes_json: string | null;
  readonly raw_json: string;
  readonly ingested_at: number;
  readonly is_out_of_order: number;
}

/**
 * Convierte una fila relacional de SQLite en una instancia íntegra rehidratada de Vehicle.
 */
export function mapRowToVehicle(row: VehicleRow): Vehicle {
  let currentTelemetry: TelemetrySnapshot | undefined;
  if (row.current_telemetry_json) {
    try {
      const parsed = JSON.parse(row.current_telemetry_json);
      currentTelemetry = TelemetrySnapshot.create(parsed);
    } catch {
      // Ignorar si el JSON estuviera corrupto
    }
  }

  let statusHistory: StateTransitionRecord[] | undefined;
  if (row.status_history_json) {
    try {
      statusHistory = JSON.parse(row.status_history_json);
    } catch {
      statusHistory = [];
    }
  }

  return Vehicle.rehydrate({
    vehicleId: row.id,
    tenantId: row.tenant_id,
    fleetId: row.fleet_id,
    vin: row.vin,
    licensePlate: row.plate_number,
    make: row.make,
    model: row.model,
    year: row.year,
    operationalStatus: row.state as VehicleOperationalStatus,
    assignedDeviceId: row.assigned_device_id ?? undefined,
    assignedRoutePlanId: row.assigned_route_plan_id ?? undefined,
    currentTelemetry,
    odometerKm: row.odometer_km,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    statusHistory
  });
}

/**
 * Convierte un agregado de dominio Vehicle en una fila relacional para persistencia.
 */
export function mapVehicleToRow(vehicle: Vehicle): VehicleRow {
  let currentTelemetryJson: string | null = null;
  if (vehicle.currentTelemetry) {
    currentTelemetryJson = JSON.stringify({
      snapshotId: vehicle.currentTelemetry.snapshotId,
      tenantId: vehicle.currentTelemetry.tenantId,
      vehicleId: vehicle.currentTelemetry.vehicleId,
      deviceId: vehicle.currentTelemetry.deviceId,
      timestamp: vehicle.currentTelemetry.timestamp,
      position: vehicle.currentTelemetry.position,
      kinematics: vehicle.currentTelemetry.kinematics,
      diagnostics: vehicle.currentTelemetry.diagnostics,
      metadata: vehicle.currentTelemetry.metadata
    });
  }

  const statusHistoryJson = vehicle.statusHistory.length > 0
    ? JSON.stringify(vehicle.statusHistory)
    : null;

  return {
    id: vehicle.vehicleId,
    tenant_id: vehicle.tenantId,
    fleet_id: vehicle.fleetId,
    vin: vehicle.vin,
    plate_number: vehicle.licensePlate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    state: vehicle.operationalStatus,
    odometer_km: vehicle.odometerKm,
    assigned_device_id: vehicle.assignedDeviceId ?? null,
    assigned_route_plan_id: vehicle.assignedRoutePlanId ?? null,
    current_telemetry_json: currentTelemetryJson,
    status_history_json: statusHistoryJson,
    created_at: vehicle.createdAt,
    updated_at: vehicle.updatedAt,
    version: vehicle.version
  };
}

/**
 * Convierte una fila relacional de SQLite en una instantánea inmutable TelemetrySnapshot.
 */
export function mapRowToTelemetrySnapshot(row: TelemetryRow): TelemetrySnapshot {
  const dtcCodes: string[] = row.dtc_codes_json ? JSON.parse(row.dtc_codes_json) : [];

  return TelemetrySnapshot.create({
    snapshotId: row.id,
    tenantId: row.tenant_id,
    vehicleId: row.vehicle_id,
    deviceId: row.device_id,
    timestamp: row.timestamp,
    position: {
      latitude: row.latitude,
      longitude: row.longitude,
      altitudeMeters: row.altitude_m ?? undefined
    },
    kinematics: {
      speedKmh: row.speed_kmh,
      headingDeg: row.heading_deg
    },
    diagnostics: {
      odometerKm: row.odometer_km,
      engineRpm: row.engine_rpm ?? undefined,
      fuelLevelPercent: row.fuel_percent ?? undefined,
      coolantTempC: row.coolant_temp_c ?? undefined,
      dtcCodes
    },
    metadata: {
      ingestedAt: row.ingested_at,
      isOutOfOrder: row.is_out_of_order === 1
    }
  });
}

/**
 * Convierte un Value Object TelemetrySnapshot en una fila de persistencia de telemetría.
 */
export function mapTelemetrySnapshotToRow(
  snapshot: TelemetrySnapshot,
  tenantId: string,
  metadata?: TelemetryAuditMetadata
): TelemetryRow {
  const dtcCodesJson = snapshot.diagnostics.dtcCodes.length > 0
    ? JSON.stringify(snapshot.diagnostics.dtcCodes)
    : null;

  const rawJson = JSON.stringify({
    snapshotId: snapshot.snapshotId,
    tenantId,
    vehicleId: snapshot.vehicleId,
    deviceId: snapshot.deviceId,
    timestamp: snapshot.timestamp,
    position: snapshot.position,
    kinematics: snapshot.kinematics,
    diagnostics: snapshot.diagnostics,
    metadata: snapshot.metadata
  });

  return {
    id: snapshot.snapshotId,
    tenant_id: tenantId,
    vehicle_id: snapshot.vehicleId,
    device_id: snapshot.deviceId,
    timestamp: snapshot.timestamp,
    latitude: snapshot.position.latitude,
    longitude: snapshot.position.longitude,
    altitude_m: snapshot.position.altitudeMeters ?? null,
    speed_kmh: snapshot.kinematics.speedKmh,
    heading_deg: snapshot.kinematics.headingDeg,
    odometer_km: snapshot.diagnostics.odometerKm,
    engine_rpm: snapshot.diagnostics.engineRpm ?? null,
    fuel_percent: snapshot.diagnostics.fuelLevelPercent ?? null,
    coolant_temp_c: snapshot.diagnostics.coolantTempC ?? null,
    dtc_codes_json: dtcCodesJson,
    raw_json: rawJson,
    ingested_at: metadata?.receivedAt ?? Date.now(),
    is_out_of_order: metadata?.isOutOfOrder ? 1 : 0
  };
}
