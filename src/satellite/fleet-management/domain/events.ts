/**
 * events.ts
 * PROJ-03 Fleet Management & Logistics — Local Application Domain Events
 * 
 * Invariants:
 * 1. These are APPLICATION DOMAIN EVENTS local to the satellite product.
 * 2. They do NOT mutate src/domain/events/events.ts of the Core Engine.
 * 3. Strongly typed, correlation-ready, immutable payloads.
 */

import {
  VehicleId,
  TenantId,
  SnapshotId,
  GeofenceId,
  VehicleOperationalStatus,
  GeoPosition,
  FleetDomainEvent
} from './types.js';

export type FleetDomainEventType =
  | 'fleet.telemetry.ingested'
  | 'fleet.vehicle.status_changed'
  | 'fleet.geofence.entered'
  | 'fleet.geofence.exited'
  | 'fleet.alert.diagnostic_trouble';

export interface TelemetryIngestedPayload {
  readonly snapshotId: SnapshotId;
  readonly deviceId: string;
  readonly timestamp: number;
  readonly speedKmh: number;
  readonly headingDeg: number;
  readonly odometerKm: number;
  readonly latitude: number;
  readonly longitude: number;
}

export interface VehicleStatusChangedPayload {
  readonly fromStatus: VehicleOperationalStatus;
  readonly toStatus: VehicleOperationalStatus;
  readonly reason: string;
  readonly transitionTimestamp: number;
}

export interface GeofenceTransitionPayload {
  readonly geofenceId: GeofenceId;
  readonly transition: 'ENTERED' | 'EXITED';
  readonly position: GeoPosition;
}

export interface DiagnosticAlertPayload {
  readonly snapshotId: SnapshotId;
  readonly dtcCodes: readonly string[];
  readonly detectedAt: number;
}

function generateLocalEventId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `evt-${prefix}-${ts}-${rnd}`;
}

export function createTelemetryIngestedEvent(
  tenantId: TenantId,
  vehicleId: VehicleId,
  payload: TelemetryIngestedPayload,
  timestamp: number = Date.now()
): FleetDomainEvent<TelemetryIngestedPayload> {
  return Object.freeze({
    eventId: generateLocalEventId('telem'),
    eventType: 'fleet.telemetry.ingested',
    aggregateId: vehicleId,
    tenantId,
    timestamp,
    payload: Object.freeze({ ...payload })
  });
}

export function createVehicleStatusChangedEvent(
  tenantId: TenantId,
  vehicleId: VehicleId,
  payload: VehicleStatusChangedPayload,
  timestamp: number = Date.now()
): FleetDomainEvent<VehicleStatusChangedPayload> {
  return Object.freeze({
    eventId: generateLocalEventId('status'),
    eventType: 'fleet.vehicle.status_changed',
    aggregateId: vehicleId,
    tenantId,
    timestamp,
    payload: Object.freeze({ ...payload })
  });
}

export function createGeofenceTransitionEvent(
  tenantId: TenantId,
  vehicleId: VehicleId,
  payload: GeofenceTransitionPayload,
  timestamp: number = Date.now()
): FleetDomainEvent<GeofenceTransitionPayload> {
  return Object.freeze({
    eventId: generateLocalEventId('geofence'),
    eventType: payload.transition === 'ENTERED' ? 'fleet.geofence.entered' : 'fleet.geofence.exited',
    aggregateId: vehicleId,
    tenantId,
    timestamp,
    payload: Object.freeze({
      ...payload,
      position: Object.freeze({ ...payload.position })
    })
  });
}

export function createDiagnosticAlertEvent(
  tenantId: TenantId,
  vehicleId: VehicleId,
  payload: DiagnosticAlertPayload,
  timestamp: number = Date.now()
): FleetDomainEvent<DiagnosticAlertPayload> {
  return Object.freeze({
    eventId: generateLocalEventId('alert'),
    eventType: 'fleet.alert.diagnostic_trouble',
    aggregateId: vehicleId,
    tenantId,
    timestamp,
    payload: Object.freeze({
      ...payload,
      dtcCodes: Object.freeze([...payload.dtcCodes])
    })
  });
}
