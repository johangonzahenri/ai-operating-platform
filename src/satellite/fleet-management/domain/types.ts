/**
 * types.ts
 * PROJ-03 Fleet Management & Logistics — Satellite Domain Types
 * 
 * Strict branded types, domain primitives and value object structures for fleet operations.
 * Completely provider-agnostic, zero platform Core Engine imports.
 */

export type VehicleId = string;
export type FleetId = string;
export type TenantId = string;
export type DeviceId = string;
export type SnapshotId = string;
export type RoutePlanId = string;
export type GeofenceId = string;

/**
 * Coordenadas espaciales estándar WGS 84 (EPSG:4326).
 */
export interface GeoPosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeMeters?: number;
}

/**
 * Métricas cinemáticas del vehículo.
 */
export interface KinematicMetrics {
  readonly speedKmh: number;
  readonly headingDeg: number;
  readonly accelerationMps2?: number;
}

/**
 * Estado y diagnósticos mecánicos de a bordo.
 */
export interface DiagnosticStatus {
  readonly odometerKm: number;
  readonly engineRpm?: number;
  readonly fuelLevelPercent?: number;
  readonly coolantTempC?: number;
  readonly dtcCodes: readonly string[];
}

/**
 * Estados operacionales deterministas del ciclo de vida del vehículo.
 */
export type VehicleOperationalStatus =
  | 'PARKED'
  | 'IDLING'
  | 'MOVING'
  | 'ALERT'
  | 'OFFLINE';

export type GeofenceType = 'CIRCULAR' | 'POLYGONAL';

export type WaypointStatus = 'PENDING' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED';

export interface Waypoint {
  readonly waypointId: string;
  readonly sequence: number;
  readonly position: GeoPosition;
  readonly name: string;
  readonly etaTimestamp?: number;
  readonly status: WaypointStatus;
}

export type TemporalOrder = 'IN_ORDER' | 'DUPLICATE' | 'OUT_OF_ORDER';

export interface TelemetryProcessingResult {
  readonly accepted: boolean;
  readonly temporalOrder: TemporalOrder;
  readonly stateChanged: boolean;
  readonly previousStatus: VehicleOperationalStatus;
  readonly currentStatus: VehicleOperationalStatus;
  readonly reason?: string;
  readonly events: readonly FleetDomainEvent[];
}

export interface StateTransitionRecord {
  readonly fromStatus: VehicleOperationalStatus;
  readonly toStatus: VehicleOperationalStatus;
  readonly reason: string;
  readonly timestamp: number;
  readonly changed: boolean;
}

/**
 * Errores de dominio tipados y deterministas.
 */
export class FleetDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetDomainError';
  }
}

export class TenantIsolationViolationError extends FleetDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationViolationError';
  }
}

export class InvalidStateTransitionError extends FleetDomainError {
  constructor(from: VehicleOperationalStatus, to: VehicleOperationalStatus, reason?: string) {
    super(`Transición de estado prohibida de '${from}' a '${to}'${reason ? `: ${reason}` : ''}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class InvalidKinematicsError extends FleetDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidKinematicsError';
  }
}

// Forward type declaration for circular reference avoidance
export interface FleetDomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: VehicleId;
  readonly tenantId: TenantId;
  readonly timestamp: number;
  readonly payload: T;
}
