/**
 * geofence.ts
 * PROJ-03 Fleet Management & Logistics — Geofence Entity & Spatial Boundary Evaluation
 * 
 * Supports:
 * - CIRCULAR: Centro WGS 84 y radio en metros.
 * - POLYGONAL: Polígono delimitado por al menos 3 vértices (algoritmo Ray-Casting).
 */

import {
  GeofenceId,
  TenantId,
  GeoPosition,
  GeofenceType,
  FleetDomainError,
  InvalidKinematicsError
} from './types.js';
import { KinematicValidator } from './kinematic-validator.js';

export interface CreateCircularGeofenceParams {
  readonly geofenceId: GeofenceId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly type: 'CIRCULAR';
  readonly center: GeoPosition;
  readonly radiusMeters: number;
}

export interface CreatePolygonalGeofenceParams {
  readonly geofenceId: GeofenceId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly type: 'POLYGONAL';
  readonly vertices: readonly GeoPosition[];
}

export type CreateGeofenceParams = CreateCircularGeofenceParams | CreatePolygonalGeofenceParams;

export class Geofence {
  public readonly geofenceId: GeofenceId;
  public readonly tenantId: TenantId;
  public readonly name: string;
  public readonly type: GeofenceType;
  public readonly center?: GeoPosition;
  public readonly radiusMeters?: number;
  public readonly vertices?: readonly GeoPosition[];

  private constructor(params: CreateGeofenceParams) {
    this.geofenceId = params.geofenceId;
    this.tenantId = params.tenantId;
    this.name = params.name;
    this.type = params.type;

    if (params.type === 'CIRCULAR') {
      this.center = Object.freeze({ ...params.center });
      this.radiusMeters = params.radiusMeters;
    } else {
      this.vertices = Object.freeze(params.vertices.map(v => Object.freeze({ ...v })));
    }

    Object.freeze(this);
  }

  public static create(params: CreateGeofenceParams): Geofence {
    if (!params.geofenceId || typeof params.geofenceId !== 'string' || params.geofenceId.trim() === '') {
      throw new FleetDomainError('geofenceId es obligatorio y no puede estar vacío');
    }
    if (!params.tenantId || typeof params.tenantId !== 'string' || params.tenantId.trim() === '') {
      throw new FleetDomainError('tenantId es obligatorio y no puede estar vacío');
    }
    if (!params.name || typeof params.name !== 'string' || params.name.trim() === '') {
      throw new FleetDomainError('name es obligatorio y no puede estar vacío');
    }

    if (params.type === 'CIRCULAR') {
      const coordVal = KinematicValidator.validateCoordinates(params.center);
      if (!coordVal.valid) {
        throw new InvalidKinematicsError(`Centro de geocerca inválido: ${coordVal.reason}`);
      }
      if (typeof params.radiusMeters !== 'number' || params.radiusMeters <= 0 || !Number.isFinite(params.radiusMeters)) {
        throw new InvalidKinematicsError(`Radio de geocerca debe ser un número positivo finito: ${params.radiusMeters}`);
      }
    } else if (params.type === 'POLYGONAL') {
      if (!Array.isArray(params.vertices) || params.vertices.length < 3) {
        throw new InvalidKinematicsError(`Geocerca poligonal debe contener al menos 3 vértices (recibidos: ${params.vertices?.length || 0})`);
      }
      for (let i = 0; i < params.vertices.length; i++) {
        const v = params.vertices[i]!;
        const coordVal = KinematicValidator.validateCoordinates(v);
        if (!coordVal.valid) {
          throw new InvalidKinematicsError(`Vértice ${i} de geocerca inválido: ${coordVal.reason}`);
        }
      }
    } else {
      throw new FleetDomainError(`Tipo de geocerca no reconocido: ${(params as any).type}`);
    }

    return new Geofence(params);
  }

  /**
   * Evalúa deterministamente si una coordenada WGS 84 se encuentra dentro de los límites de la geocerca.
   */
  public contains(point: GeoPosition): boolean {
    const coordVal = KinematicValidator.validateCoordinates(point);
    if (!coordVal.valid) return false;

    if (this.type === 'CIRCULAR') {
      const distance = KinematicValidator.haversineDistanceMeters(this.center!, point);
      return distance <= this.radiusMeters!;
    }

    // Evaluación poligonal mediante algoritmo Ray-Casting (Even-Odd rule)
    return this.pointInPolygon(point, this.vertices!);
  }

  private pointInPolygon(point: GeoPosition, vertices: readonly GeoPosition[]): boolean {
    const x = point.longitude;
    const y = point.latitude;
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i]!.longitude;
      const yi = vertices[i]!.latitude;
      const xj = vertices[j]!.longitude;
      const yj = vertices[j]!.latitude;

      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }
}
