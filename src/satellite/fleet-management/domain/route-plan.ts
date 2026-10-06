/**
 * route-plan.ts
 * PROJ-03 Fleet Management & Logistics — Route Plan Entity & Waypoint Management
 * 
 * Manages ordered sequence of waypoints for cargo dispatch, deliveries or service routes.
 */

import {
  RoutePlanId,
  TenantId,
  FleetId,
  VehicleId,
  Waypoint,
  WaypointStatus,
  FleetDomainError,
  InvalidKinematicsError
} from './types.js';
import { KinematicValidator } from './kinematic-validator.js';

export interface CreateRoutePlanParams {
  readonly planId: RoutePlanId;
  readonly tenantId: TenantId;
  readonly fleetId: FleetId;
  readonly vehicleId: VehicleId;
  readonly waypoints: readonly Waypoint[];
  readonly createdAt?: number;
}

export class RoutePlan {
  public readonly planId: RoutePlanId;
  public readonly tenantId: TenantId;
  public readonly fleetId: FleetId;
  public readonly vehicleId: VehicleId;
  public readonly waypoints: readonly Waypoint[];
  public readonly createdAt: number;

  private constructor(params: CreateRoutePlanParams) {
    this.planId = params.planId;
    this.tenantId = params.tenantId;
    this.fleetId = params.fleetId;
    this.vehicleId = params.vehicleId;
    this.createdAt = params.createdAt || Date.now();
    this.waypoints = Object.freeze(
      params.waypoints.map(wp =>
        Object.freeze({
          ...wp,
          position: Object.freeze({ ...wp.position })
        })
      )
    );

    Object.freeze(this);
  }

  public static create(params: CreateRoutePlanParams): RoutePlan {
    if (!params.planId || typeof params.planId !== 'string' || params.planId.trim() === '') {
      throw new FleetDomainError('planId es obligatorio y no puede estar vacío');
    }
    if (!params.tenantId || typeof params.tenantId !== 'string' || params.tenantId.trim() === '') {
      throw new FleetDomainError('tenantId es obligatorio y no puede estar vacío');
    }
    if (!params.fleetId || typeof params.fleetId !== 'string' || params.fleetId.trim() === '') {
      throw new FleetDomainError('fleetId es obligatorio y no puede estar vacío');
    }
    if (!params.vehicleId || typeof params.vehicleId !== 'string' || params.vehicleId.trim() === '') {
      throw new FleetDomainError('vehicleId es obligatorio y no puede estar vacío');
    }

    if (!Array.isArray(params.waypoints) || params.waypoints.length === 0) {
      throw new FleetDomainError('El plan de ruta debe contener al menos 1 waypoint');
    }

    // Validación de secuencia y coordenadas de waypoints
    const seenSequences = new Set<number>();
    for (const wp of params.waypoints) {
      if (!wp.waypointId || typeof wp.waypointId !== 'string') {
        throw new FleetDomainError('Cada waypoint debe poseer un waypointId válido');
      }
      if (typeof wp.sequence !== 'number' || wp.sequence < 1 || !Number.isInteger(wp.sequence)) {
        throw new FleetDomainError(`Secuencia de waypoint inválida: ${wp.sequence}`);
      }
      if (seenSequences.has(wp.sequence)) {
        throw new FleetDomainError(`Secuencia de waypoint duplicada: ${wp.sequence}`);
      }
      seenSequences.add(wp.sequence);

      const coordVal = KinematicValidator.validateCoordinates(wp.position);
      if (!coordVal.valid) {
        throw new InvalidKinematicsError(`Coordenadas del waypoint ${wp.waypointId} inválidas: ${coordVal.reason}`);
      }
    }

    return new RoutePlan(params);
  }

  public getWaypoint(sequence: number): Waypoint | undefined {
    return this.waypoints.find(wp => wp.sequence === sequence);
  }

  public getNextPendingWaypoint(): Waypoint | undefined {
    const sorted = [...this.waypoints].sort((a, b) => a.sequence - b.sequence);
    return sorted.find(wp => wp.status === 'PENDING');
  }

  public isCompleted(): boolean {
    return this.waypoints.every(wp => wp.status === 'COMPLETED' || wp.status === 'SKIPPED');
  }

  /**
   * Produce una nueva instancia inmutable con el estado del waypoint actualizado.
   */
  public updateWaypointStatus(sequence: number, newStatus: WaypointStatus): RoutePlan {
    const target = this.getWaypoint(sequence);
    if (!target) {
      throw new FleetDomainError(`Waypoint con secuencia ${sequence} no encontrado en plan ${this.planId}`);
    }

    const updatedWaypoints = this.waypoints.map(wp => {
      if (wp.sequence === sequence) {
        return { ...wp, status: newStatus };
      }
      return wp;
    });

    return new RoutePlan({
      planId: this.planId,
      tenantId: this.tenantId,
      fleetId: this.fleetId,
      vehicleId: this.vehicleId,
      waypoints: updatedWaypoints,
      createdAt: this.createdAt
    });
  }
}
