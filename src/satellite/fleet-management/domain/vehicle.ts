/**
 * vehicle.ts
 * PROJ-03 Fleet Management & Logistics — Vehicle Aggregate Root
 * 
 * Invariants:
 * 1. Tenant Isolation: Every operation strictly enforces tenant boundaries fail-closed.
 * 2. Monotonic Temporal Processing: Handles newer, duplicate and out-of-order telemetry without time-travel.
 * 3. Deterministic State Transitions: State changes governed strictly by VehicleStateMachine.
 * 4. Odometry Monotonicity: Vehicle cumulative odometer never decrements.
 */

import {
  VehicleId,
  TenantId,
  FleetId,
  DeviceId,
  RoutePlanId,
  VehicleOperationalStatus,
  StateTransitionRecord,
  TelemetryProcessingResult,
  TenantIsolationViolationError,
  FleetDomainError,
  FleetDomainEvent
} from './types.js';
import { TelemetrySnapshot } from './telemetry-snapshot.js';
import { VehicleStateMachine } from './vehicle-state-machine.js';
import {
  createTelemetryIngestedEvent,
  createVehicleStatusChangedEvent,
  createDiagnosticAlertEvent
} from './events.js';

export interface CreateVehicleParams {
  readonly vehicleId: VehicleId;
  readonly tenantId: TenantId;
  readonly fleetId: FleetId;
  readonly vin: string;
  readonly licensePlate: string;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly initialStatus?: VehicleOperationalStatus;
  readonly assignedDeviceId?: DeviceId;
  readonly initialOdometerKm?: number;
  readonly createdAt?: number;
}

export class Vehicle {
  public readonly vehicleId: VehicleId;
  public readonly tenantId: TenantId;
  public readonly fleetId: FleetId;
  public readonly vin: string;
  public readonly licensePlate: string;
  public readonly make: string;
  public readonly model: string;
  public readonly year: number;
  public readonly createdAt: number;

  private _operationalStatus: VehicleOperationalStatus;
  private _assignedDeviceId?: DeviceId;
  private _assignedRoutePlanId?: RoutePlanId;
  private _currentTelemetry?: TelemetrySnapshot;
  private _odometerKm: number;
  private _updatedAt: number;
  private readonly _statusHistory: StateTransitionRecord[] = [];

  private constructor(params: CreateVehicleParams) {
    this.vehicleId = params.vehicleId;
    this.tenantId = params.tenantId;
    this.fleetId = params.fleetId;
    this.vin = params.vin;
    this.licensePlate = params.licensePlate;
    this.make = params.make;
    this.model = params.model;
    this.year = params.year;
    this.createdAt = params.createdAt || Date.now();
    this._updatedAt = this.createdAt;
    this._operationalStatus = params.initialStatus || 'PARKED';
    this._assignedDeviceId = params.assignedDeviceId;
    this._odometerKm = params.initialOdometerKm || 0;
  }

  public static create(params: CreateVehicleParams): Vehicle {
    if (!params.vehicleId || typeof params.vehicleId !== 'string' || params.vehicleId.trim() === '') {
      throw new FleetDomainError('vehicleId es obligatorio y no puede estar vacío');
    }
    if (!params.tenantId || typeof params.tenantId !== 'string' || params.tenantId.trim() === '') {
      throw new FleetDomainError('tenantId es obligatorio y no puede estar vacío');
    }
    if (!params.fleetId || typeof params.fleetId !== 'string' || params.fleetId.trim() === '') {
      throw new FleetDomainError('fleetId es obligatorio y no puede estar vacío');
    }
    if (!params.vin || typeof params.vin !== 'string' || params.vin.trim() === '') {
      throw new FleetDomainError('VIN vehicular es obligatorio y no puede estar vacío');
    }
    if (!params.licensePlate || typeof params.licensePlate !== 'string' || params.licensePlate.trim() === '') {
      throw new FleetDomainError('Patente/placa vehicular es obligatoria');
    }
    if (typeof params.year !== 'number' || params.year < 1900 || params.year > 2100) {
      throw new FleetDomainError(`Año vehicular fuera de rango: ${params.year}`);
    }
    if (params.initialOdometerKm !== undefined && params.initialOdometerKm < 0) {
      throw new FleetDomainError('Odómetro inicial no puede ser negativo');
    }

    return new Vehicle(params);
  }

  // --- Getters ---
  public get operationalStatus(): VehicleOperationalStatus {
    return this._operationalStatus;
  }

  public get assignedDeviceId(): DeviceId | undefined {
    return this._assignedDeviceId;
  }

  public get assignedRoutePlanId(): RoutePlanId | undefined {
    return this._assignedRoutePlanId;
  }

  public get currentTelemetry(): TelemetrySnapshot | undefined {
    return this._currentTelemetry;
  }

  public get odometerKm(): number {
    return this._odometerKm;
  }

  public get updatedAt(): number {
    return this._updatedAt;
  }

  public get statusHistory(): readonly StateTransitionRecord[] {
    return Object.freeze([...this._statusHistory]);
  }

  // --- Comandos de Dominio ---

  /**
   * Asocia un dispositivo de telemetría respetando el límite de tenant.
   */
  public assignDevice(deviceId: DeviceId, tenantId: TenantId): void {
    if (tenantId !== this.tenantId) {
      throw new TenantIsolationViolationError(`Violación de aislamiento de inquilino: tenant ${tenantId} no puede asignar dispositivo al vehículo ${this.vehicleId} (propiedad de ${this.tenantId})`);
    }
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      throw new FleetDomainError('deviceId no puede estar vacío');
    }
    this._assignedDeviceId = deviceId;
    this._updatedAt = Date.now();
  }

  /**
   * Asocia una orden de ruta respetando el límite de tenant.
   */
  public assignRoutePlan(routePlanId: RoutePlanId, tenantId: TenantId): void {
    if (tenantId !== this.tenantId) {
      throw new TenantIsolationViolationError(`Violación de aislamiento de inquilino: tenant ${tenantId} no puede asignar ruta al vehículo ${this.vehicleId} (propiedad de ${this.tenantId})`);
    }
    this._assignedRoutePlanId = routePlanId;
    this._updatedAt = Date.now();
  }

  /**
   * Procesa una captura telemática entrante de forma determinista y monotónica.
   */
  public processTelemetry(snapshot: TelemetrySnapshot): TelemetryProcessingResult {
    // 1. Invariante de Aislamiento de Inquilino (Fail-Closed)
    if (snapshot.tenantId !== this.tenantId) {
      throw new TenantIsolationViolationError(
        `Violación de frontera multi-tenant: Telemetría de tenant '${snapshot.tenantId}' rechazada para vehículo '${this.vehicleId}' perteneciente a tenant '${this.tenantId}'`
      );
    }

    // 2. Invariante de Identidad Vehicular
    if (snapshot.vehicleId !== this.vehicleId) {
      throw new FleetDomainError(
        `Incongruencia de ID vehicular: Telemetría indica vehículo '${snapshot.vehicleId}' pero el agregado es '${this.vehicleId}'`
      );
    }

    // 3. Validación de Dispositivo (si hay asignación fija)
    if (this._assignedDeviceId && snapshot.deviceId !== this._assignedDeviceId) {
      throw new FleetDomainError(
        `Dispositivo emisor '${snapshot.deviceId}' no coincide con el dispositivo asignado '${this._assignedDeviceId}' para el vehículo '${this.vehicleId}'`
      );
    }

    const previousStatus = this._operationalStatus;
    const events: FleetDomainEvent[] = [];

    // 4. Semántica de Monotonicidad Temporal
    if (this._currentTelemetry) {
      const currentTs = this._currentTelemetry.timestamp;
      const newTs = snapshot.timestamp;

      // Caso Duplicado
      if (newTs === currentTs) {
        return {
          accepted: false,
          temporalOrder: 'DUPLICATE',
          stateChanged: false,
          previousStatus,
          currentStatus: previousStatus,
          reason: `Trama telemática duplicada con timestamp exacto ${newTs}`,
          events: []
        };
      }

      // Caso Fuera de Orden (Trama Histórica Acumulada / Store-and-Forward)
      if (newTs < currentTs) {
        return {
          accepted: true,
          temporalOrder: 'OUT_OF_ORDER',
          stateChanged: false,
          previousStatus,
          currentStatus: previousStatus,
          reason: `Trama histórica acumulada (timestamp ${newTs} < ${currentTs}) aceptada para auditoría sin mutar el estado en tiempo real`,
          events: []
        };
      }
    }

    // Caso En Orden (Trama más reciente): Actualiza estado en tiempo real
    this._currentTelemetry = snapshot;
    this._updatedAt = snapshot.timestamp;

    // Actualización monotónica de odómetro (nunca retrocede)
    if (snapshot.diagnostics.odometerKm > this._odometerKm) {
      this._odometerKm = snapshot.diagnostics.odometerKm;
    }

    // Evento de ingesta de telemetría
    events.push(
      createTelemetryIngestedEvent(
        this.tenantId,
        this.vehicleId,
        {
          snapshotId: snapshot.snapshotId,
          deviceId: snapshot.deviceId,
          timestamp: snapshot.timestamp,
          speedKmh: snapshot.kinematics.speedKmh,
          headingDeg: snapshot.kinematics.headingDeg,
          odometerKm: this._odometerKm,
          latitude: snapshot.position.latitude,
          longitude: snapshot.position.longitude
        },
        snapshot.timestamp
      )
    );

    // Evaluación y aplicación de máquina de estados
    const evaluation = VehicleStateMachine.evaluateStatusFromTelemetry(previousStatus, snapshot);
    let stateChanged = false;

    if (evaluation.nextStatus !== previousStatus && VehicleStateMachine.canTransition(previousStatus, evaluation.nextStatus)) {
      const transitionRecord = VehicleStateMachine.transition(
        previousStatus,
        evaluation.nextStatus,
        evaluation.reason,
        snapshot.timestamp
      );
      this._operationalStatus = transitionRecord.toStatus;
      this._statusHistory.push(transitionRecord);
      stateChanged = true;

      events.push(
        createVehicleStatusChangedEvent(
          this.tenantId,
          this.vehicleId,
          {
            fromStatus: previousStatus,
            toStatus: this._operationalStatus,
            reason: evaluation.reason,
            transitionTimestamp: snapshot.timestamp
          },
          snapshot.timestamp
        )
      );
    }

    // Alerta de diagnóstico si se detectan DTCs críticos
    if (snapshot.hasCriticalDTCs()) {
      events.push(
        createDiagnosticAlertEvent(
          this.tenantId,
          this.vehicleId,
          {
            snapshotId: snapshot.snapshotId,
            dtcCodes: snapshot.diagnostics.dtcCodes,
            detectedAt: snapshot.timestamp
          },
          snapshot.timestamp
        )
      );
    }

    return {
      accepted: true,
      temporalOrder: 'IN_ORDER',
      stateChanged,
      previousStatus,
      currentStatus: this._operationalStatus,
      reason: stateChanged ? evaluation.reason : 'Telemetría procesada sin cambio de estado',
      events: Object.freeze(events)
    };
  }

  /**
   * Fuerza el vehículo a estado ALERT por evento extraordinario (ej. sensor de impacto, geocerca rota).
   */
  public triggerAlert(reason: string, timestamp: number = Date.now()): StateTransitionRecord {
    const transition = VehicleStateMachine.transition(this._operationalStatus, 'ALERT', reason, timestamp);
    this._operationalStatus = 'ALERT';
    this._statusHistory.push(transition);
    this._updatedAt = timestamp;
    return transition;
  }

  /**
   * Resuelve una condición de alerta devolviendo el vehículo a un estado operacional normal.
   */
  public resolveAlert(
    targetStatus: 'PARKED' | 'IDLING' | 'MOVING',
    reason: string,
    timestamp: number = Date.now()
  ): StateTransitionRecord {
    if (this._operationalStatus !== 'ALERT') {
      throw new FleetDomainError(`No se puede resolver alerta en vehículo en estado '${this._operationalStatus}'`);
    }
    const transition = VehicleStateMachine.transition(this._operationalStatus, targetStatus, reason, timestamp);
    this._operationalStatus = targetStatus;
    this._statusHistory.push(transition);
    this._updatedAt = timestamp;
    return transition;
  }

  /**
   * Marca el vehículo como OFFLINE por inactividad o pérdida de señal.
   */
  public markOffline(reason: string = 'Heartbeat timeout', timestamp: number = Date.now()): StateTransitionRecord {
    const transition = VehicleStateMachine.transition(this._operationalStatus, 'OFFLINE', reason, timestamp);
    this._operationalStatus = 'OFFLINE';
    this._statusHistory.push(transition);
    this._updatedAt = timestamp;
    return transition;
  }
}
