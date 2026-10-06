/**
 * repository-ports.ts
 * PROJ-03 Fleet Management & Logistics — Repository Port Interfaces
 * 
 * Formalized in Phase 167 (docs/PROJ_03_FLEET_PERSISTENCE_ARCHITECTURE.md).
 * Pure Domain / Application SPI contracts. Zero infrastructure / SQLite imports.
 */

import {
  VehicleId,
  TenantId,
  FleetId,
  VehicleOperationalStatus
} from './types.js';
import { Vehicle } from './vehicle.js';
import { TelemetrySnapshot } from './telemetry-snapshot.js';

/**
 * Criterios de filtrado para consulta de vehículos por inquilino.
 */
export interface VehicleFilter {
  readonly status?: VehicleOperationalStatus;
  readonly fleetId?: FleetId;
  readonly make?: string;
  readonly limit?: number;
}

/**
 * Contrato de repositorio para el ciclo de vida y agregación de Vehicle.
 */
export interface VehicleRepository {
  /**
   * Obtiene un vehículo por su identificador único dentro del límite de su tenant.
   * Rechaza de forma fail-closed si tenantId no coincide o es inválido.
   */
  findById(vehicleId: VehicleId, tenantId: TenantId): Promise<Vehicle | null>;

  /**
   * Obtiene un vehículo por su número VIN único dentro del tenant.
   */
  findByVin(vin: string, tenantId: TenantId): Promise<Vehicle | null>;

  /**
   * Lista los vehículos pertenecientes al tenant aplicando filtros opcionales.
   */
  listByTenant(tenantId: TenantId, filter?: VehicleFilter): Promise<readonly Vehicle[]>;

  /**
   * Persiste un vehículo (inserción o actualización atómica con control de concurrencia optimista).
   * En caso de actualización, comprueba que version coincida con el registro actual.
   */
  save(vehicle: Vehicle): Promise<void>;
}

/**
 * Opciones para consultas de rango en el historial de telemetría.
 */
export interface QueryTelemetryOptions {
  readonly limit?: number;
  readonly ascending?: boolean;
}

/**
 * Metadatos de auditoría forense para ingesta telemática.
 */
export interface TelemetryAuditMetadata {
  readonly sourceIp?: string;
  readonly receivedAt?: number;
  readonly isOutOfOrder?: boolean;
}

/**
 * Resultado del procesamiento por lotes de instantáneas telemáticas.
 */
export interface BatchAppendResult {
  readonly insertedCount: number;
  readonly duplicateCount: number;
}

/**
 * Contrato de repositorio para la serie temporal auditada e inmutable de TelemetrySnapshot.
 */
export interface TelemetryHistoryRepository {
  /**
   * Consulta instantáneas de un vehículo en un rango temporal UTC.
   */
  findByVehicleAndRange(
    vehicleId: VehicleId,
    tenantId: TenantId,
    fromTimestamp: number | Date,
    toTimestamp: number | Date,
    options?: QueryTelemetryOptions
  ): Promise<readonly TelemetrySnapshot[]>;

  /**
   * Obtiene la instantánea más reciente registrada para un vehículo.
   */
  findLatestByVehicle(vehicleId: VehicleId, tenantId: TenantId): Promise<TelemetrySnapshot | null>;

  /**
   * Añade una instantánea inmutable al historial (Append-Only con deduplicación idempotente).
   */
  append(
    snapshot: TelemetrySnapshot,
    tenantId: TenantId,
    metadata?: TelemetryAuditMetadata
  ): Promise<void>;

  /**
   * Añade un lote de instantáneas dentro de una única transacción atómica.
   */
  appendBatch(
    snapshots: readonly TelemetrySnapshot[],
    tenantId: TenantId
  ): Promise<BatchAppendResult>;

  /**
   * Poda tramas más antiguas que una fecha de corte para políticas de retención (Tier 1 a 30 días).
   */
  pruneOlderThan(cutoffTimestamp: number | Date, tenantId: TenantId): Promise<number>;
}
