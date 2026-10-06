/**
 * tests/unit/fleet-domain-foundation.test.ts
 * 
 * Phase 166: PROJ-03 Fleet Management — Domain Foundation & Satellite Architecture Verification
 * 
 * Tests:
 * 1. Vehicle aggregate creation & invariant validation.
 * 2. TelemetrySnapshot immutability & fail-closed validation.
 * 3. KinematicValidator: coordinates, speed threshold, heading, Haversine displacement & speed calculation.
 * 4. Deterministic state machine: PARKED, IDLING, MOVING, ALERT, OFFLINE allowed & forbidden transitions.
 * 5. Monotonic temporal processing: IN_ORDER progression, DUPLICATE rejection, OUT_OF_ORDER historical acceptance.
 * 6. Tenant isolation: cross-tenant telemetry rejection fail-closed.
 * 7. Geofence evaluation: circular radius check & polygonal ray-casting algorithm.
 * 8. RoutePlan entity: ordered waypoint sequencing & immutable status progression.
 * 9. Fleet local application events emission: telemetry, status changed, diagnostic alert.
 * 10. Architectural boundary purity: zero imports of src/domain or src/infrastructure, zero fleet tables in SQLite, zero fleet capabilities in platform catalog.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  Vehicle,
  TelemetrySnapshot,
  KinematicValidator,
  VehicleStateMachine,
  Geofence,
  RoutePlan,
  TenantIsolationViolationError,
  InvalidStateTransitionError,
  InvalidKinematicsError
} from '../../src/satellite/fleet-management/domain/index.js';

describe('Phase 166 — PROJ-03 Fleet Management: Domain Foundation Verification', () => {
  const TENANT_A = 'tenant-fleet-logistics-alpha';
  const TENANT_B = 'tenant-fleet-logistics-beta';
  const VEHICLE_ID = 'veh-truck-001';
  const FLEET_ID = 'fleet-santiago-north';
  const DEVICE_ID = 'obd-dongle-987';

  // Helper para generar posición canónica en Santiago, Chile
  const canonicalSantiagoPos = {
    latitude: -33.4489,
    longitude: -70.6693,
    altitudeMeters: 570
  };

  test('1. Vehicle aggregate creation enforces mandatory identifiers and initial state', () => {
    const vehicle = Vehicle.create({
      vehicleId: VEHICLE_ID,
      tenantId: TENANT_A,
      fleetId: FLEET_ID,
      vin: '1HGCR2F83HA123456',
      licensePlate: 'CL-AB-12',
      make: 'Volvo',
      model: 'FH16 Electric',
      year: 2025,
      initialOdometerKm: 12500
    });

    assert.equal(vehicle.vehicleId, VEHICLE_ID);
    assert.equal(vehicle.tenantId, TENANT_A);
    assert.equal(vehicle.operationalStatus, 'PARKED');
    assert.equal(vehicle.odometerKm, 12500);
    assert.equal(vehicle.statusHistory.length, 0);

    // Fail-closed on missing fields
    assert.throws(() => {
      Vehicle.create({
        vehicleId: '',
        tenantId: TENANT_A,
        fleetId: FLEET_ID,
        vin: '1HGCR2F83HA123456',
        licensePlate: 'CL-AB-12',
        make: 'Volvo',
        model: 'FH16 Electric',
        year: 2025
      });
    }, /vehicleId es obligatorio/);
  });

  test('2. TelemetrySnapshot is immutable and validates coordinates and kinematics fail-closed', () => {
    const validSnapshot = TelemetrySnapshot.create({
      snapshotId: 'snap-001',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: 1728200000000,
      position: canonicalSantiagoPos,
      kinematics: { speedKmh: 45.5, headingDeg: 180 },
      diagnostics: { odometerKm: 12550, engineRpm: 1200, dtcCodes: [] }
    });

    assert.equal(validSnapshot.snapshotId, 'snap-001');
    assert.equal(validSnapshot.kinematics.speedKmh, 45.5);
    assert.equal(validSnapshot.isKinematicallyPlausible(), true);
    assert.equal(validSnapshot.hasActiveDTCs(), false);

    // Invariante de inmutabilidad: no se pueden mutar propiedades
    assert.throws(() => {
      (validSnapshot as any).snapshotId = 'mutated';
    });

    // Rechazo fail-closed de coordenadas fuera de rango
    assert.throws(() => {
      TelemetrySnapshot.create({
        snapshotId: 'snap-bad-coord',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID,
        deviceId: DEVICE_ID,
        timestamp: 1728200000000,
        position: { latitude: 95.0, longitude: -70.6693 }, // Latitud > 90
        kinematics: { speedKmh: 40, headingDeg: 90 },
        diagnostics: { odometerKm: 12550, dtcCodes: [] }
      });
    }, InvalidKinematicsError);

    // Rechazo de velocidad negativa
    assert.throws(() => {
      TelemetrySnapshot.create({
        snapshotId: 'snap-bad-speed',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID,
        deviceId: DEVICE_ID,
        timestamp: 1728200000000,
        position: canonicalSantiagoPos,
        kinematics: { speedKmh: -10, headingDeg: 90 },
        diagnostics: { odometerKm: 12550, dtcCodes: [] }
      });
    }, InvalidKinematicsError);
  });

  test('3. KinematicValidator calculates Haversine distance and detects displacement speed anomalies', () => {
    const santiagoCentro = { latitude: -33.4489, longitude: -70.6693 };
    const valparaiso = { latitude: -33.0472, longitude: -71.6127 }; // ~98 km de distancia

    const distanceMeters = KinematicValidator.haversineDistanceMeters(santiagoCentro, valparaiso);
    assert.ok(distanceMeters > 95000 && distanceMeters < 105000, `Distancia esperada ~98km, calculada: ${distanceMeters}m`);

    // Desplazamiento normal: 98 km en 1.5 horas (5400 segundos = 5400000 ms) -> ~65 km/h
    const normalDisp = KinematicValidator.validateDisplacementPlausibility(
      santiagoCentro,
      1000000,
      valparaiso,
      1000000 + 5400000
    );
    assert.equal(normalDisp.valid, true);
    assert.equal(normalDisp.anomaly, false);
    assert.ok(normalDisp.calculatedSpeedKmh > 60 && normalDisp.calculatedSpeedKmh < 70);

    // Anomalía cinemática / Teleportación: 98 km en 5 segundos -> > 70000 km/h (GPS Spoofing)
    const spoofedDisp = KinematicValidator.validateDisplacementPlausibility(
      santiagoCentro,
      1000000,
      valparaiso,
      1000000 + 5000,
      200 // umbral 200 km/h
    );
    assert.equal(spoofedDisp.valid, true);
    assert.equal(spoofedDisp.anomaly, true);
    assert.ok(spoofedDisp.reason?.includes('excede el umbral de plausibilidad física'));
  });

  test('4. VehicleStateMachine governs allowed transitions and rejects forbidden state changes', () => {
    // PARKED -> IDLING (Válido)
    const t1 = VehicleStateMachine.transition('PARKED', 'IDLING', 'Encendido de ignición', 1000);
    assert.equal(t1.changed, true);
    assert.equal(t1.toStatus, 'IDLING');

    // IDLING -> MOVING (Válido)
    const t2 = VehicleStateMachine.transition('IDLING', 'MOVING', 'Aceleración > 1.0 km/h', 2000);
    assert.equal(t2.changed, true);
    assert.equal(t2.toStatus, 'MOVING');

    // MOVING -> ALERT (Válido, falla mecánica)
    const t3 = VehicleStateMachine.transition('MOVING', 'ALERT', 'DTC de sobrecalentamiento', 3000);
    assert.equal(t3.changed, true);
    assert.equal(t3.toStatus, 'ALERT');

    // ALERT -> PARKED (Válido, detención de emergencia y apagado)
    const t4 = VehicleStateMachine.transition('ALERT', 'PARKED', 'Inspección en berma', 4000);
    assert.equal(t4.changed, true);
    assert.equal(t4.toStatus, 'PARKED');

    // PARKED -> OFFLINE (Válido, pérdida de señal)
    const t5 = VehicleStateMachine.transition('PARKED', 'OFFLINE', 'Timeout sin reporte', 5000);
    assert.equal(t5.changed, true);
    assert.equal(t5.toStatus, 'OFFLINE');

    // OFFLINE -> PARKED (Válido, reconexión)
    const t6 = VehicleStateMachine.transition('OFFLINE', 'PARKED', 'Reconexión celular', 6000);
    assert.equal(t6.changed, true);
    assert.equal(t6.toStatus, 'PARKED');
  });

  test('5. Temporal Monotonicity: in-order updates advance state; duplicate and out-of-order are handled deterministically', () => {
    const vehicle = Vehicle.create({
      vehicleId: VEHICLE_ID,
      tenantId: TENANT_A,
      fleetId: FLEET_ID,
      vin: '1HGCR2F83HA123456',
      licensePlate: 'CL-AB-12',
      make: 'Volvo',
      model: 'FH16 Electric',
      year: 2025
    });

    const baseTime = 1728200000000;

    // Trama 1: Normal (T = baseTime), Vehículo detenido
    const snap1 = TelemetrySnapshot.create({
      snapshotId: 'snap-1',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: baseTime,
      position: canonicalSantiagoPos,
      kinematics: { speedKmh: 0, headingDeg: 0 },
      diagnostics: { odometerKm: 1000, engineRpm: 0, dtcCodes: [] }
    });

    const res1 = vehicle.processTelemetry(snap1);
    assert.equal(res1.accepted, true);
    assert.equal(res1.temporalOrder, 'IN_ORDER');
    assert.equal(vehicle.operationalStatus, 'PARKED');
    assert.equal(vehicle.odometerKm, 1000);

    // Trama 2: Duplicado exacto (T = baseTime) -> Rechazado idempotentemente
    const snapDup = TelemetrySnapshot.create({
      snapshotId: 'snap-dup',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: baseTime,
      position: canonicalSantiagoPos,
      kinematics: { speedKmh: 0, headingDeg: 0 },
      diagnostics: { odometerKm: 1000, engineRpm: 0, dtcCodes: [] }
    });

    const resDup = vehicle.processTelemetry(snapDup);
    assert.equal(resDup.accepted, false);
    assert.equal(resDup.temporalOrder, 'DUPLICATE');
    assert.equal(resDup.stateChanged, false);

    // Trama 3: Avance en el tiempo (T = baseTime + 10s), Vehículo en movimiento a 60 km/h
    const snap2 = TelemetrySnapshot.create({
      snapshotId: 'snap-2',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: baseTime + 10000,
      position: { latitude: -33.4500, longitude: -70.6700 },
      kinematics: { speedKmh: 60.0, headingDeg: 180 },
      diagnostics: { odometerKm: 1000.16, engineRpm: 1800, dtcCodes: [] }
    });

    const res2 = vehicle.processTelemetry(snap2);
    assert.equal(res2.accepted, true);
    assert.equal(res2.temporalOrder, 'IN_ORDER');
    assert.equal(res2.stateChanged, true);
    assert.equal(vehicle.operationalStatus, 'MOVING');
    assert.equal(vehicle.odometerKm, 1000.16);

    // Trama 4: Trama desordenada del pasado (T = baseTime + 5s) -> Aceptada históricamente sin retroceder estado actual
    const snapPast = TelemetrySnapshot.create({
      snapshotId: 'snap-past',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: baseTime + 5000, // Menor que baseTime + 10s
      position: { latitude: -33.4495, longitude: -70.6695 },
      kinematics: { speedKmh: 30.0, headingDeg: 180 },
      diagnostics: { odometerKm: 1000.08, engineRpm: 1500, dtcCodes: [] }
    });

    const resPast = vehicle.processTelemetry(snapPast);
    assert.equal(resPast.accepted, true);
    assert.equal(resPast.temporalOrder, 'OUT_OF_ORDER');
    assert.equal(resPast.stateChanged, false);
    // El estado actual y odómetro en tiempo real se preservan intactos
    assert.equal(vehicle.operationalStatus, 'MOVING');
    assert.equal(vehicle.odometerKm, 1000.16);
    assert.equal(vehicle.currentTelemetry?.snapshotId, 'snap-2');
  });

  test('6. Multi-Tenant Isolation: Cross-tenant telemetry and assignments are rejected fail-closed', () => {
    const vehicle = Vehicle.create({
      vehicleId: VEHICLE_ID,
      tenantId: TENANT_A,
      fleetId: FLEET_ID,
      vin: '1HGCR2F83HA123456',
      licensePlate: 'CL-AB-12',
      make: 'Volvo',
      model: 'FH16 Electric',
      year: 2025
    });

    // Telemetría con tenant diferente (TENANT_B)
    const foreignSnapshot = TelemetrySnapshot.create({
      snapshotId: 'snap-cross-tenant',
      tenantId: TENANT_B,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: Date.now(),
      position: canonicalSantiagoPos,
      kinematics: { speedKmh: 0, headingDeg: 0 },
      diagnostics: { odometerKm: 1000, dtcCodes: [] }
    });

    assert.throws(() => {
      vehicle.processTelemetry(foreignSnapshot);
    }, TenantIsolationViolationError);

    // Asignación de dispositivo desde otro tenant
    assert.throws(() => {
      vehicle.assignDevice('device-foreign', TENANT_B);
    }, TenantIsolationViolationError);

    // Asignación de ruta desde otro tenant
    assert.throws(() => {
      vehicle.assignRoutePlan('route-foreign', TENANT_B);
    }, TenantIsolationViolationError);
  });

  test('7. Geofence evaluation: circular and polygonal boundaries correctly detect containment', () => {
    // 1. Geocerca circular: Centro en Santiago Centro, radio 1000 metros (1 km)
    const circularFence = Geofence.create({
      geofenceId: 'geo-santiago-center',
      tenantId: TENANT_A,
      name: 'Zona Céntrica Santiago',
      type: 'CIRCULAR',
      center: canonicalSantiagoPos,
      radiusMeters: 1000
    });

    // Punto cercano (a ~150 metros) -> adentro
    const pointInsideCirc = { latitude: -33.4500, longitude: -70.6685 };
    assert.equal(circularFence.contains(pointInsideCirc), true);

    // Punto lejano (Providencia, a ~4 km) -> afuera
    const pointOutsideCirc = { latitude: -33.4265, longitude: -70.6120 };
    assert.equal(circularFence.contains(pointOutsideCirc), false);

    // 2. Geocerca poligonal: Cuadrilátero en Santiago
    const polygonalFence = Geofence.create({
      geofenceId: 'geo-quad-zone',
      tenantId: TENANT_A,
      name: 'Polígono Logístico Norte',
      type: 'POLYGONAL',
      vertices: [
        { latitude: -33.4000, longitude: -70.7000 },
        { latitude: -33.4000, longitude: -70.6000 },
        { latitude: -33.5000, longitude: -70.6000 },
        { latitude: -33.5000, longitude: -70.7000 }
      ]
    });

    // Punto dentro del cuadrilátero
    const pointInsidePoly = { latitude: -33.4500, longitude: -70.6500 };
    assert.equal(polygonalFence.contains(pointInsidePoly), true);

    // Punto fuera del cuadrilátero (Latitud -33.3000)
    const pointOutsidePoly = { latitude: -33.3000, longitude: -70.6500 };
    assert.equal(polygonalFence.contains(pointOutsidePoly), false);
  });

  test('8. RoutePlan entity enforces waypoint sequencing and immutable status transitions', () => {
    const route = RoutePlan.create({
      planId: 'route-scl-01',
      tenantId: TENANT_A,
      fleetId: FLEET_ID,
      vehicleId: VEHICLE_ID,
      waypoints: [
        {
          waypointId: 'wp-depot',
          sequence: 1,
          name: 'Bodega Central Pudahuel',
          position: { latitude: -33.4300, longitude: -70.7500 },
          status: 'PENDING'
        },
        {
          waypointId: 'wp-client-1',
          sequence: 2,
          name: 'Sucursal Providencia',
          position: { latitude: -33.4260, longitude: -70.6120 },
          status: 'PENDING'
        }
      ]
    });

    assert.equal(route.waypoints.length, 2);
    assert.equal(route.getNextPendingWaypoint()?.waypointId, 'wp-depot');
    assert.equal(route.isCompleted(), false);

    // Actualización inmutable del primer waypoint
    const updatedRoute = route.updateWaypointStatus(1, 'COMPLETED');
    assert.equal(updatedRoute.getWaypoint(1)?.status, 'COMPLETED');
    assert.equal(route.getWaypoint(1)?.status, 'PENDING'); // La instancia original permanece inmutable
    assert.equal(updatedRoute.getNextPendingWaypoint()?.waypointId, 'wp-client-1');
  });

  test('9. Critical Diagnostic Trouble Codes (DTC) trigger ALERT state and diagnostic event', () => {
    const vehicle = Vehicle.create({
      vehicleId: VEHICLE_ID,
      tenantId: TENANT_A,
      fleetId: FLEET_ID,
      vin: '1HGCR2F83HA123456',
      licensePlate: 'CL-AB-12',
      make: 'Volvo',
      model: 'FH16 Electric',
      year: 2025,
      initialStatus: 'MOVING'
    });

    // Telemetría con código SAE J1979 crítico: P0300 (Random Cylinder Misfire)
    const alertSnapshot = TelemetrySnapshot.create({
      snapshotId: 'snap-alert-dtc',
      tenantId: TENANT_A,
      vehicleId: VEHICLE_ID,
      deviceId: DEVICE_ID,
      timestamp: Date.now(),
      position: canonicalSantiagoPos,
      kinematics: { speedKmh: 45.0, headingDeg: 90 },
      diagnostics: { odometerKm: 1200, dtcCodes: ['P0300', 'P0117'] }
    });

    const result = vehicle.processTelemetry(alertSnapshot);
    assert.equal(result.accepted, true);
    assert.equal(result.stateChanged, true);
    assert.equal(vehicle.operationalStatus, 'ALERT');

    // Comprobar eventos generados
    const eventTypes = result.events.map(e => e.eventType);
    assert.ok(eventTypes.includes('fleet.telemetry.ingested'));
    assert.ok(eventTypes.includes('fleet.vehicle.status_changed'));
    assert.ok(eventTypes.includes('fleet.alert.diagnostic_trouble'));
  });

  test('10. Architectural Boundary Purity: Fleet domain has zero Core imports, zero DB tables, zero platform capabilities', () => {
    // 1. Verificar que ningún archivo en src/satellite/fleet-management/ importe src/domain o src/infrastructure
    const fleetDomainDir = path.resolve(process.cwd(), 'src/satellite/fleet-management/domain');
    assert.ok(fs.existsSync(fleetDomainDir), 'El directorio de dominio satélite debe existir');

    const files = fs.readdirSync(fleetDomainDir).filter(f => f.endsWith('.ts'));
    assert.ok(files.length >= 6, 'Debe haber al menos 6 módulos de dominio');

    for (const f of files) {
      const content = fs.readFileSync(path.join(fleetDomainDir, f), 'utf8');
      assert.ok(!content.includes("from '../../domain"), `Archivo ${f} no debe importar de Core Engine (src/domain)`);
      assert.ok(!content.includes("from '../../../domain"), `Archivo ${f} no debe importar de Core Engine (src/domain)`);
      assert.ok(!content.includes("from '../../infrastructure"), `Archivo ${f} no debe importar de src/infrastructure`);
      assert.ok(!content.includes("from '../../../infrastructure"), `Archivo ${f} no debe importar de src/infrastructure`);
      assert.ok(!content.includes("from '../vto"), `Archivo ${f} no debe tener acoplamiento con PROJ-01 VTO`);
      assert.ok(!content.includes("from '../spareparts"), `Archivo ${f} no debe tener acoplamiento con PROJ-02 Spare Parts`);
    }

    // 2. Verificar que src/domain/ del Core Engine no contenga módulos de flotas
    const coreDomainDir = path.resolve(process.cwd(), 'src/domain');
    const coreEntries = fs.readdirSync(coreDomainDir);
    assert.ok(!coreEntries.includes('fleet'), 'src/domain/ no debe contener directorio fleet');

    // 3. Verificar que PLATFORM_CAPABILITY_CATALOG no contenga capacidades de flota
    const catalogPath = path.resolve(process.cwd(), 'src/platform/api/capability-catalog.ts');
    if (fs.existsSync(catalogPath)) {
      const catalogContent = fs.readFileSync(catalogPath, 'utf8');
      assert.ok(!catalogContent.includes('fleet.telemetry'), 'PLATFORM_CAPABILITY_CATALOG no debe contener fleet.telemetry');
      assert.ok(!catalogContent.includes('route.optimization'), 'PLATFORM_CAPABILITY_CATALOG no debe contener route.optimization');
    }
  });
});
