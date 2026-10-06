/**
 * telemetry-snapshot.ts
 * PROJ-03 Fleet Management & Logistics — Immutable Telemetry Snapshot Value Object
 * 
 * Aligned with docs/FLEET_TELEMETRY_SPECIFICATION.md
 * Fully encapsulated, validated fail-closed, frozen in memory.
 */

import {
  SnapshotId,
  TenantId,
  VehicleId,
  DeviceId,
  GeoPosition,
  KinematicMetrics,
  DiagnosticStatus,
  InvalidKinematicsError
} from './types.js';
import { KinematicValidator, DEFAULT_MAX_PLAUSIBLE_SPEED_KMH } from './kinematic-validator.js';

export interface CreateTelemetrySnapshotParams {
  readonly snapshotId: SnapshotId;
  readonly tenantId: TenantId;
  readonly vehicleId: VehicleId;
  readonly deviceId: DeviceId;
  readonly timestamp: number;
  readonly position: GeoPosition;
  readonly kinematics: KinematicMetrics;
  readonly diagnostics: DiagnosticStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class TelemetrySnapshot {
  public readonly snapshotId: SnapshotId;
  public readonly tenantId: TenantId;
  public readonly vehicleId: VehicleId;
  public readonly deviceId: DeviceId;
  public readonly timestamp: number;
  public readonly position: GeoPosition;
  public readonly kinematics: KinematicMetrics;
  public readonly diagnostics: DiagnosticStatus;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(params: CreateTelemetrySnapshotParams) {
    this.snapshotId = params.snapshotId;
    this.tenantId = params.tenantId;
    this.vehicleId = params.vehicleId;
    this.deviceId = params.deviceId;
    this.timestamp = params.timestamp;
    this.position = Object.freeze({ ...params.position });
    this.kinematics = Object.freeze({ ...params.kinematics });
    this.diagnostics = Object.freeze({
      ...params.diagnostics,
      dtcCodes: Object.freeze([...(params.diagnostics.dtcCodes || [])])
    });
    this.metadata = Object.freeze({ ...(params.metadata || {}) });

    Object.freeze(this);
  }

  /**
   * Factory determinista con validación exhaustiva fail-closed de invariantes.
   */
  public static create(params: CreateTelemetrySnapshotParams): TelemetrySnapshot {
    if (!params.snapshotId || typeof params.snapshotId !== 'string' || params.snapshotId.trim() === '') {
      throw new InvalidKinematicsError('snapshotId es obligatorio y no puede estar vacío');
    }
    if (!params.tenantId || typeof params.tenantId !== 'string' || params.tenantId.trim() === '') {
      throw new InvalidKinematicsError('tenantId es obligatorio y no puede estar vacío');
    }
    if (!params.vehicleId || typeof params.vehicleId !== 'string' || params.vehicleId.trim() === '') {
      throw new InvalidKinematicsError('vehicleId es obligatorio y no puede estar vacío');
    }
    if (!params.deviceId || typeof params.deviceId !== 'string' || params.deviceId.trim() === '') {
      throw new InvalidKinematicsError('deviceId es obligatorio y no puede estar vacío');
    }

    // Validación temporal
    const timeVal = KinematicValidator.validateTimestampFreshness(params.timestamp);
    if (!timeVal.valid) {
      throw new InvalidKinematicsError(`Timestamp inválido: ${timeVal.reason}`);
    }

    // Validación de coordenadas WGS 84
    const coordVal = KinematicValidator.validateCoordinates(params.position);
    if (!coordVal.valid) {
      throw new InvalidKinematicsError(`Posición geográfica inválida: ${coordVal.reason}`);
    }

    // Validación cinemática
    const speedVal = KinematicValidator.validateSpeed(params.kinematics?.speedKmh);
    if (!speedVal.valid) {
      throw new InvalidKinematicsError(`Velocidad inválida: ${speedVal.reason}`);
    }

    const headVal = KinematicValidator.validateHeading(params.kinematics?.headingDeg);
    if (!headVal.valid) {
      throw new InvalidKinematicsError(`Rumbo angular inválido: ${headVal.reason}`);
    }

    // Validación de diagnósticos
    if (typeof params.diagnostics?.odometerKm !== 'number' || params.diagnostics.odometerKm < 0 || !Number.isFinite(params.diagnostics.odometerKm)) {
      throw new InvalidKinematicsError('Odómetro debe ser un número no negativo y finito');
    }

    if (params.diagnostics.fuelLevelPercent !== undefined) {
      if (params.diagnostics.fuelLevelPercent < 0 || params.diagnostics.fuelLevelPercent > 100) {
        throw new InvalidKinematicsError(`Nivel de combustible fuera de rango porcentual [0, 100]: ${params.diagnostics.fuelLevelPercent}`);
      }
    }

    if (params.diagnostics.engineRpm !== undefined) {
      if (params.diagnostics.engineRpm < 0 || params.diagnostics.engineRpm > 12000) {
        throw new InvalidKinematicsError(`RPM de motor fuera de rango físico [0, 12000]: ${params.diagnostics.engineRpm}`);
      }
    }

    return new TelemetrySnapshot(params);
  }

  /**
   * Determina si la velocidad reportada es anómala o excede el umbral de plausibilidad.
   */
  public isKinematicallyPlausible(maxSpeedKmh: number = DEFAULT_MAX_PLAUSIBLE_SPEED_KMH): boolean {
    const check = KinematicValidator.validateSpeed(this.kinematics.speedKmh, maxSpeedKmh);
    return check.valid && !check.anomaly;
  }

  /**
   * Retorna true si existen códigos de diagnóstico de falla (DTCs) activos.
   */
  public hasActiveDTCs(): boolean {
    return this.diagnostics.dtcCodes.length > 0;
  }

  /**
   * Retorna true si existen códigos DTC clasificados como de severidad crítica (ej. P0xxx motor/transmisión).
   */
  public hasCriticalDTCs(): boolean {
    return this.diagnostics.dtcCodes.some(code => code.toUpperCase().startsWith('P0') || code.toUpperCase().startsWith('P1'));
  }

  public toJSON(): Record<string, unknown> {
    return {
      snapshotId: this.snapshotId,
      tenantId: this.tenantId,
      vehicleId: this.vehicleId,
      deviceId: this.deviceId,
      timestamp: this.timestamp,
      position: { ...this.position },
      kinematics: { ...this.kinematics },
      diagnostics: {
        ...this.diagnostics,
        dtcCodes: [...this.diagnostics.dtcCodes]
      },
      metadata: { ...this.metadata }
    };
  }
}
