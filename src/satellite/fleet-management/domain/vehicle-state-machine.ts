/**
 * vehicle-state-machine.ts
 * PROJ-03 Fleet Management & Logistics — Deterministic Vehicle State Machine
 * 
 * Formal States:
 * - PARKED:  Vehículo detenido con motor apagado.
 * - IDLING:  Vehículo detenido con motor encendido (consumo en ralentí).
 * - MOVING:  Vehículo en desplazamiento cinemático activo (velocidad > 0).
 * - ALERT:   Vehículo con condición crítica (código DTC severo, anomalía física, tamper).
 * - OFFLINE: Dispositivo sin reporte dentro de la ventana de timeout operacional.
 */

import {
  VehicleOperationalStatus,
  StateTransitionRecord,
  InvalidStateTransitionError
} from './types.js';
import { TelemetrySnapshot } from './telemetry-snapshot.js';

export class VehicleStateMachine {
  /**
   * Matriz determinista de transiciones de estado permitidas.
   */
  private static readonly ALLOWED_TRANSITIONS: Readonly<Record<VehicleOperationalStatus, ReadonlySet<VehicleOperationalStatus>>> = {
    OFFLINE: new Set<VehicleOperationalStatus>(['PARKED', 'IDLING', 'MOVING', 'ALERT']),
    PARKED: new Set<VehicleOperationalStatus>(['IDLING', 'MOVING', 'ALERT', 'OFFLINE']),
    IDLING: new Set<VehicleOperationalStatus>(['MOVING', 'PARKED', 'ALERT', 'OFFLINE']),
    MOVING: new Set<VehicleOperationalStatus>(['IDLING', 'PARKED', 'ALERT', 'OFFLINE']),
    ALERT: new Set<VehicleOperationalStatus>(['PARKED', 'IDLING', 'MOVING', 'OFFLINE'])
  };

  /**
   * Verifica si una transición es válida en la matriz de estados.
   */
  public static canTransition(from: VehicleOperationalStatus, to: VehicleOperationalStatus): boolean {
    if (from === to) return true; // Transición no-op (mismo estado) permitida sin error
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }

  /**
   * Ejecuta formalmente una transición de estado, validando invariantes fail-closed.
   */
  public static transition(
    currentStatus: VehicleOperationalStatus,
    targetStatus: VehicleOperationalStatus,
    reason: string,
    timestamp: number = Date.now()
  ): StateTransitionRecord {
    if (currentStatus === targetStatus) {
      return {
        fromStatus: currentStatus,
        toStatus: targetStatus,
        reason: reason || 'Estado sin cambios',
        timestamp,
        changed: false
      };
    }

    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new InvalidStateTransitionError(currentStatus, targetStatus, reason);
    }

    return {
      fromStatus: currentStatus,
      toStatus: targetStatus,
      reason: reason || `Transición automática a ${targetStatus}`,
      timestamp,
      changed: true
    };
  }

  /**
   * Evalúa deterministamente el estado operacional óptimo a partir de un TelemetrySnapshot.
   */
  public static evaluateStatusFromTelemetry(
    currentStatus: VehicleOperationalStatus,
    snapshot: TelemetrySnapshot
  ): { nextStatus: VehicleOperationalStatus; reason: string } {
    // 1. Condición prioritaria de alerta: códigos DTC críticos
    if (snapshot.hasCriticalDTCs()) {
      return {
        nextStatus: 'ALERT',
        reason: `DTCs críticos detectados en telemetría: ${snapshot.diagnostics.dtcCodes.join(', ')}`
      };
    }

    // 2. Condición cinemática: vehículo en movimiento
    if (snapshot.kinematics.speedKmh > 1.0) {
      return {
        nextStatus: 'MOVING',
        reason: `Velocidad reportada ${snapshot.kinematics.speedKmh.toFixed(1)} km/h (> 1.0 km/h)`
      };
    }

    // 3. Condición de motor en ralentí (IDLING): velocidad ~ 0 pero motor encendido
    const isEngineRunning = (snapshot.diagnostics.engineRpm !== undefined && snapshot.diagnostics.engineRpm > 400);
    if (isEngineRunning && snapshot.kinematics.speedKmh <= 1.0) {
      return {
        nextStatus: 'IDLING',
        reason: `Vehículo detenido con motor encendido (${snapshot.diagnostics.engineRpm} RPM)`
      };
    }

    // 4. Condición de reposo / estacionado (PARKED): velocidad ~ 0 y motor apagado o sin ignición
    return {
      nextStatus: 'PARKED',
      reason: 'Vehículo detenido con ignición desactivada o motor en reposo'
    };
  }
}
