/**
 * fleet-sqlite-schema.ts
 * PROJ-03 Fleet Management & Logistics — Satellite DDL & Schema Management
 * 
 * Formalized in Phase 167 (docs/PROJ_03_FLEET_PERSISTENCE_ARCHITECTURE.md).
 * Independent schema lifecycle (FLEET_SCHEMA_VERSION = 1).
 * Completely segregated from platform Core schema_metadata.
 */

import { DatabaseSync } from 'node:sqlite';

export const FLEET_SCHEMA_VERSION = 1;

export const V1_FLEET_SCHEMA_DDL = `
  -- Metadatos de versión del esquema satélite de flota
  CREATE TABLE IF NOT EXISTS fleet_schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Tabla principal del agregado raíz de Vehículo con OCC
  CREATE TABLE IF NOT EXISTS fleet_vehicles (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    fleet_id TEXT NOT NULL,
    vin TEXT NOT NULL,
    plate_number TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PARKED', 'IDLING', 'MOVING', 'ALERT', 'OFFLINE')),
    odometer_km REAL NOT NULL DEFAULT 0.0 CHECK (odometer_km >= 0.0),
    assigned_device_id TEXT,
    assigned_route_plan_id TEXT,
    current_telemetry_json TEXT,
    status_history_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, vin),
    UNIQUE (tenant_id, plate_number)
  );

  CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_tenant_fleet 
    ON fleet_vehicles(tenant_id, fleet_id);

  CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_tenant_state 
    ON fleet_vehicles(tenant_id, state);

  -- Serie temporal de telemetría inmutable (1 Hz por vehículo)
  CREATE TABLE IF NOT EXISTS fleet_telemetry_history (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_m REAL,
    speed_kmh REAL NOT NULL CHECK (speed_kmh >= 0.0 AND speed_kmh <= 200.0),
    heading_deg REAL NOT NULL CHECK (heading_deg >= 0.0 AND heading_deg <= 360.0),
    odometer_km REAL NOT NULL CHECK (odometer_km >= 0.0),
    engine_rpm REAL,
    fuel_percent REAL,
    coolant_temp_c REAL,
    dtc_codes_json TEXT,
    raw_json TEXT NOT NULL,
    ingested_at INTEGER NOT NULL,
    is_out_of_order INTEGER NOT NULL DEFAULT 0 CHECK (is_out_of_order IN (0, 1)),
    PRIMARY KEY (tenant_id, vehicle_id, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_fleet_telemetry_history_range 
    ON fleet_telemetry_history(tenant_id, vehicle_id, timestamp DESC);
`;

/**
 * Inicializa y valida el esquema relacional en la base de datos satélite de flotas.
 */
export function initializeFleetSchema(db: DatabaseSync): void {
  // Ejecutar DDL base idempotente
  db.exec(V1_FLEET_SCHEMA_DDL);

  // Registrar metadatos de versión si no existen
  const selectStmt = db.prepare('SELECT value FROM fleet_schema_metadata WHERE key = ?;');
  const row = selectStmt.get('schema_version') as { value: string } | undefined;

  if (!row) {
    const insertStmt = db.prepare(
      'INSERT INTO fleet_schema_metadata (key, value, updated_at) VALUES (?, ?, ?);'
    );
    insertStmt.run('schema_version', String(FLEET_SCHEMA_VERSION), new Date().toISOString());
  }
}
