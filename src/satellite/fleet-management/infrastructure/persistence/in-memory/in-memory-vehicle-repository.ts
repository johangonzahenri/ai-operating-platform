/**
 * in-memory-vehicle-repository.ts
 * PROJ-03 Fleet Management & Logistics — In-Memory Vehicle Repository Adapter
 * 
 * Invariants:
 * 1. Strict Tenant Isolation: tenantId is mandatory on every query. Fail-closed.
 * 2. Optimistic Concurrency Control (OCC): Prevents silent overwrite using version property.
 * 3. Identity uniqueness: Enforces unique VIN and license plate per tenant.
 * 4. Deep immutability: Rehydrates copies to avoid leaking internal state references.
 * 5. Zero Core Engine dependencies.
 */

import {
  Vehicle,
  VehicleId,
  TenantId,
  VehicleRepository,
  VehicleFilter
} from '../../../domain/index.js';
import {
  FleetSecurityViolationError,
  FleetOptimisticConcurrencyError,
  FleetDuplicateVehicleError
} from '../sqlite/fleet-sqlite-errors.js';

export class InMemoryVehicleRepository implements VehicleRepository {
  // Key: `${tenantId}:${vehicleId}`
  private readonly vehicles: Map<string, Vehicle> = new Map();

  public async findById(vehicleId: VehicleId, tenantId: TenantId): Promise<Vehicle | null> {
    this.assertValidTenant(tenantId);
    if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
      throw new FleetSecurityViolationError('vehicleId es requerido y no puede ser vacío');
    }

    const key = this.buildKey(tenantId, vehicleId);
    const vehicle = this.vehicles.get(key);
    if (!vehicle) {
      return null;
    }

    return this.cloneVehicle(vehicle);
  }

  public async findByVin(vin: string, tenantId: TenantId): Promise<Vehicle | null> {
    this.assertValidTenant(tenantId);
    if (!vin || typeof vin !== 'string' || vin.trim() === '') {
      throw new FleetSecurityViolationError('vin es requerido y no puede ser vacío');
    }

    for (const vehicle of this.vehicles.values()) {
      if (vehicle.tenantId === tenantId && vehicle.vin.toLowerCase() === vin.toLowerCase()) {
        return this.cloneVehicle(vehicle);
      }
    }

    return null;
  }

  public async listByTenant(
    tenantId: TenantId,
    filter?: VehicleFilter
  ): Promise<readonly Vehicle[]> {
    this.assertValidTenant(tenantId);

    const matches: Vehicle[] = [];
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.tenantId !== tenantId) {
        continue;
      }
      if (filter?.status && vehicle.operationalStatus !== filter.status) {
        continue;
      }
      if (filter?.fleetId && vehicle.fleetId !== filter.fleetId) {
        continue;
      }
      if (filter?.make && vehicle.make.toLowerCase() !== filter.make.toLowerCase()) {
        continue;
      }
      matches.push(this.cloneVehicle(vehicle));
    }

    // Ordenar por createdAt ASC consistente con SQLite
    matches.sort((a, b) => a.createdAt - b.createdAt);

    if (filter?.limit && filter.limit > 0) {
      return Object.freeze(matches.slice(0, filter.limit));
    }

    return Object.freeze(matches);
  }

  public async save(vehicle: Vehicle): Promise<void> {
    this.assertValidTenant(vehicle.tenantId);

    const key = this.buildKey(vehicle.tenantId, vehicle.vehicleId);
    const existing = this.vehicles.get(key);

    if (!existing) {
      // Verificar colisiones de VIN o Patente para el mismo tenant
      for (const current of this.vehicles.values()) {
        if (current.tenantId === vehicle.tenantId) {
          if (current.vin.toLowerCase() === vehicle.vin.toLowerCase()) {
            throw new FleetDuplicateVehicleError('vin', vehicle.vin);
          }
          if (current.licensePlate.toLowerCase() === vehicle.licensePlate.toLowerCase()) {
            throw new FleetDuplicateVehicleError('licensePlate', vehicle.licensePlate);
          }
        }
      }

      // Guardar clon inmutable
      this.vehicles.set(key, this.cloneVehicle(vehicle));
    } else {
      // OCC: verificar versión coincidente
      if (existing.version !== vehicle.version) {
        throw new FleetOptimisticConcurrencyError(
          vehicle.vehicleId,
          vehicle.version,
          existing.version
        );
      }

      // Verificar colisión de VIN/patente con otros vehículos
      for (const current of this.vehicles.values()) {
        if (current.tenantId === vehicle.tenantId && current.vehicleId !== vehicle.vehicleId) {
          if (current.vin.toLowerCase() === vehicle.vin.toLowerCase()) {
            throw new FleetDuplicateVehicleError('vin', vehicle.vin);
          }
          if (current.licensePlate.toLowerCase() === vehicle.licensePlate.toLowerCase()) {
            throw new FleetDuplicateVehicleError('licensePlate', vehicle.licensePlate);
          }
        }
      }

      // Incrementar versión en el agregado entrante y guardar copia con versión incrementada
      vehicle.incrementVersion();
      this.vehicles.set(key, this.cloneVehicle(vehicle));
    }
  }

  /**
   * Limpia todos los registros en memoria (útil para reinicio de tests).
   */
  public clear(): void {
    this.vehicles.clear();
  }

  private buildKey(tenantId: TenantId, vehicleId: VehicleId): string {
    return `${tenantId}:::${vehicleId}`;
  }

  private assertValidTenant(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new FleetSecurityViolationError('tenantId es obligatorio y no puede ser nulo o vacío');
    }
  }

  private cloneVehicle(vehicle: Vehicle): Vehicle {
    return Vehicle.rehydrate({
      vehicleId: vehicle.vehicleId,
      tenantId: vehicle.tenantId,
      fleetId: vehicle.fleetId,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      operationalStatus: vehicle.operationalStatus,
      assignedDeviceId: vehicle.assignedDeviceId,
      assignedRoutePlanId: vehicle.assignedRoutePlanId,
      currentTelemetry: vehicle.currentTelemetry,
      odometerKm: vehicle.odometerKm,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
      version: vehicle.version,
      statusHistory: [...vehicle.statusHistory]
    });
  }
}
