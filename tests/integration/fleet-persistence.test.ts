/**
 * tests/integration/fleet-persistence.test.ts
 * 
 * Phase 168: PROJ-03 Fleet Management — Satellite Persistence Verification
 * 
 * Verifies:
 * 1. SQLite Vehicle Repository (CRUD, Tenant Isolation, OCC, Identity Uniqueness).
 * 2. SQLite Telemetry History Repository (Append, Idempotency, Batch, Range Queries, Prune).
 * 3. In-Memory Vehicle Repository Contract Parity.
 * 4. In-Memory Telemetry History Repository Contract Parity.
 * 5. Architectural Boundary Purity (Zero Core Engine imports, Isolated Schema).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  Vehicle,
  TelemetrySnapshot
} from '../../src/satellite/fleet-management/domain/index.js';

import {
  FleetSqliteDatabase,
  SqliteVehicleRepository,
  SqliteTelemetryHistoryRepository,
  InMemoryVehicleRepository,
  InMemoryTelemetryHistoryRepository,
  FleetOptimisticConcurrencyError,
  FleetDuplicateVehicleError,
  FleetSecurityViolationError,
  FLEET_SCHEMA_VERSION
} from '../../src/satellite/fleet-management/infrastructure/persistence/index.js';

describe('Phase 168 — PROJ-03 Fleet Management: Satellite Persistence Verification', () => {
  const TENANT_A = 'tenant-fleet-alpha';
  const TENANT_B = 'tenant-fleet-beta';
  const VEHICLE_ID_1 = 'veh-chile-truck-001';
  const VEHICLE_ID_2 = 'veh-chile-van-002';
  const FLEET_ID_1 = 'fleet-santiago-central';

  const samplePos = {
    latitude: -33.4489,
    longitude: -70.6693,
    altitudeMeters: 570
  };

  const sampleKinematics = {
    speedKmh: 45.5,
    headingDeg: 180.0
  };

  const sampleDiagnostics = {
    odometerKm: 12540.5,
    engineRpm: 1850,
    fuelLevelPercent: 78.5,
    coolantTempC: 88,
    dtcCodes: ['P0420']
  };

  describe('1. SQLite Vehicle Repository', () => {
    let dbManager: FleetSqliteDatabase;
    let vehicleRepo: SqliteVehicleRepository;

    beforeEach(() => {
      // Base de datos en memoria aislada para cada test
      dbManager = new FleetSqliteDatabase({ filename: ':memory:' });
      vehicleRepo = new SqliteVehicleRepository(dbManager);
    });

    test('1.1 Should persist a new vehicle aggregate with version 1 and retrieve it', async () => {
      const vehicle = Vehicle.create({
        vehicleId: VEHICLE_ID_1,
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: '1HGCR2F83HA000001',
        licensePlate: 'CL-TX-01',
        make: 'Scania',
        model: 'R500 V8',
        year: 2024,
        initialOdometerKm: 10000
      });

      await vehicleRepo.save(vehicle);

      const retrieved = await vehicleRepo.findById(VEHICLE_ID_1, TENANT_A);
      assert.ok(retrieved !== null, 'Vehicle should be found');
      assert.strictEqual(retrieved.vehicleId, VEHICLE_ID_1);
      assert.strictEqual(retrieved.tenantId, TENANT_A);
      assert.strictEqual(retrieved.vin, '1HGCR2F83HA000001');
      assert.strictEqual(retrieved.licensePlate, 'CL-TX-01');
      assert.strictEqual(retrieved.operationalStatus, 'PARKED');
      assert.strictEqual(retrieved.version, 1);
    });

    test('1.2 Should enforce strict tenant isolation fail-closed', async () => {
      const vehicle = Vehicle.create({
        vehicleId: VEHICLE_ID_1,
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: '1HGCR2F83HA000002',
        licensePlate: 'CL-TX-02',
        make: 'Scania',
        model: 'R500',
        year: 2024
      });
      await vehicleRepo.save(vehicle);

      // Consulta cruzada desde Tenant B
      const crossTenantResult = await vehicleRepo.findById(VEHICLE_ID_1, TENANT_B);
      assert.strictEqual(crossTenantResult, null, 'Tenant B must not see Tenant A vehicle');

      // Tenant inválido o vacío
      await assert.rejects(
        () => vehicleRepo.findById(VEHICLE_ID_1, ''),
        FleetSecurityViolationError
      );
    });

    test('1.3 Should enforce Optimistic Concurrency Control (OCC) and reject stale updates', async () => {
      const vehicle = Vehicle.create({
        vehicleId: VEHICLE_ID_1,
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: '1HGCR2F83HA000003',
        licensePlate: 'CL-TX-03',
        make: 'Volvo',
        model: 'FH16',
        year: 2025
      });
      await vehicleRepo.save(vehicle);
      assert.strictEqual(vehicle.version, 1);

      // Cargar dos instancias concurrentes en memoria
      const instance1 = await vehicleRepo.findById(VEHICLE_ID_1, TENANT_A);
      const instance2 = await vehicleRepo.findById(VEHICLE_ID_1, TENANT_A);
      assert.ok(instance1 && instance2);

      // Transición y guardado de instancia 1 -> avanza a versión 2
      instance1.transitionTo('IDLING', 'Motor encendido');
      await vehicleRepo.save(instance1);
      assert.strictEqual(instance1.version, 2);

      // Instancia 2 intenta guardar con versión 1 obsoleta -> debe fallar con OCC error
      instance2.transitionTo('MOVING', 'En marcha');
      await assert.rejects(
        () => vehicleRepo.save(instance2),
        FleetOptimisticConcurrencyError
      );

      // Comprobar que en la base de datos la versión es 2
      const fresh = await vehicleRepo.findById(VEHICLE_ID_1, TENANT_A);
      assert.ok(fresh);
      assert.strictEqual(fresh.version, 2);
      assert.strictEqual(fresh.operationalStatus, 'IDLING');
    });

    test('1.4 Should prevent duplicate VIN and license plate within the same tenant', async () => {
      const vehicle1 = Vehicle.create({
        vehicleId: VEHICLE_ID_1,
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: '1HGCR2F83HA999999',
        licensePlate: 'CL-DP-99',
        make: 'Mercedes-Benz',
        model: 'Actros',
        year: 2024
      });
      await vehicleRepo.save(vehicle1);

      // Intento de crear vehicle2 con el mismo VIN en el mismo tenant
      const vehicle2 = Vehicle.create({
        vehicleId: VEHICLE_ID_2,
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: '1HGCR2F83HA999999',
        licensePlate: 'CL-DP-88',
        make: 'Mercedes-Benz',
        model: 'Actros',
        year: 2024
      });
      await assert.rejects(
        () => vehicleRepo.save(vehicle2),
        FleetDuplicateVehicleError
      );

      // Mismo VIN pero en DIFERENTE tenant es permitido
      const vehicleInOtherTenant = Vehicle.create({
        vehicleId: VEHICLE_ID_1,
        tenantId: TENANT_B,
        fleetId: 'fleet-valparaiso',
        vin: '1HGCR2F83HA999999',
        licensePlate: 'CL-DP-99',
        make: 'Mercedes-Benz',
        model: 'Actros',
        year: 2024
      });
      await assert.doesNotReject(() => vehicleRepo.save(vehicleInOtherTenant));
    });

    test('1.5 Should filter vehicles by status, make, and limit', async () => {
      const v1 = Vehicle.create({
        vehicleId: 'v1',
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: 'VIN001',
        licensePlate: 'PL01',
        make: 'Volvo',
        model: 'FH',
        year: 2023
      });
      const v2 = Vehicle.create({
        vehicleId: 'v2',
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: 'VIN002',
        licensePlate: 'PL02',
        make: 'Volvo',
        model: 'FM',
        year: 2024
      });
      const v3 = Vehicle.create({
        vehicleId: 'v3',
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: 'VIN003',
        licensePlate: 'PL03',
        make: 'Scania',
        model: 'R450',
        year: 2025
      });
      v2.transitionTo('MOVING');

      await vehicleRepo.save(v1);
      await vehicleRepo.save(v2);
      await vehicleRepo.save(v3);

      const allA = await vehicleRepo.listByTenant(TENANT_A);
      assert.strictEqual(allA.length, 3);

      const movingOnly = await vehicleRepo.listByTenant(TENANT_A, {
        status: 'MOVING'
      });
      assert.strictEqual(movingOnly.length, 1);
      assert.strictEqual(movingOnly[0].vehicleId, 'v2');

      const volvoOnly = await vehicleRepo.listByTenant(TENANT_A, { make: 'Volvo' });
      assert.strictEqual(volvoOnly.length, 2);

      const limited = await vehicleRepo.listByTenant(TENANT_A, { limit: 2 });
      assert.strictEqual(limited.length, 2);
    });
  });

  describe('2. SQLite Telemetry History Repository', () => {
    let dbManager: FleetSqliteDatabase;
    let telemetryRepo: SqliteTelemetryHistoryRepository;

    beforeEach(() => {
      dbManager = new FleetSqliteDatabase({ filename: ':memory:' });
      telemetryRepo = new SqliteTelemetryHistoryRepository(dbManager);
    });

    test('2.1 Should append telemetry snapshot and query latest snapshot', async () => {
      const snap = TelemetrySnapshot.create({
        snapshotId: 'snap-001',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1700000000000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      await telemetryRepo.append(snap, TENANT_A);

      const latest = await telemetryRepo.findLatestByVehicle(VEHICLE_ID_1, TENANT_A);
      assert.ok(latest !== null);
      assert.strictEqual(latest.snapshotId, 'snap-001');
      assert.strictEqual(latest.position.latitude, samplePos.latitude);
      assert.strictEqual(latest.kinematics.speedKmh, sampleKinematics.speedKmh);
      assert.strictEqual(latest.diagnostics.odometerKm, sampleDiagnostics.odometerKm);
    });

    test('2.2 Should handle store-and-forward idempotency seamlessly (duplicate ignored)', async () => {
      const snap = TelemetrySnapshot.create({
        snapshotId: 'snap-001',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1700000000000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      // Primer append
      await telemetryRepo.append(snap, TENANT_A);

      // Segundo append de la misma trama (mismo tenant, vehicle y timestamp)
      await assert.doesNotReject(async () => {
        await telemetryRepo.append(snap, TENANT_A);
      });

      const list = await telemetryRepo.findByVehicleAndRange(
        VEHICLE_ID_1,
        TENANT_A,
        1699999999000,
        1700000001000
      );
      assert.strictEqual(list.length, 1, 'Duplicate snapshot must be deduplicated idempotently');
    });

    test('2.3 Should append batch atomically and report duplicate metrics', async () => {
      const snap1 = TelemetrySnapshot.create({
        snapshotId: 'snap-001',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1700000001000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });
      const snap2 = TelemetrySnapshot.create({
        snapshotId: 'snap-002',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1700000002000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      // Lote inicial
      const res1 = await telemetryRepo.appendBatch([snap1, snap2], TENANT_A);
      assert.strictEqual(res1.insertedCount, 2);
      assert.strictEqual(res1.duplicateCount, 0);

      // Reenvío de lote con 1 nuevo y 1 repetido
      const snap3 = TelemetrySnapshot.create({
        snapshotId: 'snap-003',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1700000003000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      const res2 = await telemetryRepo.appendBatch([snap2, snap3], TENANT_A);
      assert.strictEqual(res2.insertedCount, 1);
      assert.strictEqual(res2.duplicateCount, 1);
    });

    test('2.4 Should filter telemetry by range and sort correctly', async () => {
      for (let i = 1; i <= 5; i++) {
        const snap = TelemetrySnapshot.create({
          snapshotId: `snap-${i}`,
          tenantId: TENANT_A,
          vehicleId: VEHICLE_ID_1,
          deviceId: 'dev-001',
          timestamp: 1700000000000 + i * 1000,
          position: samplePos,
          kinematics: sampleKinematics,
          diagnostics: sampleDiagnostics
        });
        await telemetryRepo.append(snap, TENANT_A);
      }

      // Consulta de rango ascendente con límite 2
      const ascRange = await telemetryRepo.findByVehicleAndRange(
        VEHICLE_ID_1,
        TENANT_A,
        1700000002000,
        1700000004000,
        { ascending: true, limit: 2 }
      );
      assert.strictEqual(ascRange.length, 2);
      assert.strictEqual(ascRange[0].timestamp, 1700000002000);
      assert.strictEqual(ascRange[1].timestamp, 1700000003000);

      // Consulta descendente (por defecto)
      const descRange = await telemetryRepo.findByVehicleAndRange(
        VEHICLE_ID_1,
        TENANT_A,
        1700000001000,
        1700000005000
      );
      assert.strictEqual(descRange.length, 5);
      assert.strictEqual(descRange[0].timestamp, 1700000005000);
    });

    test('2.5 Should prune telemetry older than cutoff date', async () => {
      const oldSnap = TelemetrySnapshot.create({
        snapshotId: 'snap-old',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 1000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });
      const newSnap = TelemetrySnapshot.create({
        snapshotId: 'snap-new',
        tenantId: TENANT_A,
        vehicleId: VEHICLE_ID_1,
        deviceId: 'dev-001',
        timestamp: 5000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      await telemetryRepo.append(oldSnap, TENANT_A);
      await telemetryRepo.append(newSnap, TENANT_A);

      const deleted = await telemetryRepo.pruneOlderThan(3000, TENANT_A);
      assert.strictEqual(deleted, 1);

      const remaining = await telemetryRepo.findByVehicleAndRange(
        VEHICLE_ID_1,
        TENANT_A,
        0,
        10000
      );
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].snapshotId, 'snap-new');
    });
  });

  describe('3. In-Memory Repositories Contract Parity', () => {
    let memVehicleRepo: InMemoryVehicleRepository;
    let memTelemetryRepo: InMemoryTelemetryHistoryRepository;

    beforeEach(() => {
      memVehicleRepo = new InMemoryVehicleRepository();
      memTelemetryRepo = new InMemoryTelemetryHistoryRepository();
    });

    test('3.1 InMemory Vehicle Repository fulfills OCC and uniqueness invariants', async () => {
      const v = Vehicle.create({
        vehicleId: 'mem-001',
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: 'MEMVIN001',
        licensePlate: 'MEMPL01',
        make: 'MAN',
        model: 'TGX',
        year: 2024
      });

      await memVehicleRepo.save(v);
      assert.strictEqual(v.version, 1);

      // OCC test
      const copy1 = await memVehicleRepo.findById('mem-001', TENANT_A);
      const copy2 = await memVehicleRepo.findById('mem-001', TENANT_A);
      assert.ok(copy1 && copy2);

      copy1.transitionTo('IDLING');
      await memVehicleRepo.save(copy1);
      assert.strictEqual(copy1.version, 2);

      copy2.transitionTo('MOVING');
      await assert.rejects(
        () => memVehicleRepo.save(copy2),
        FleetOptimisticConcurrencyError
      );

      // Unique VIN test
      const duplicateVin = Vehicle.create({
        vehicleId: 'mem-002',
        tenantId: TENANT_A,
        fleetId: FLEET_ID_1,
        vin: 'MEMVIN001',
        licensePlate: 'MEMPL02',
        make: 'MAN',
        model: 'TGX',
        year: 2024
      });
      await assert.rejects(
        () => memVehicleRepo.save(duplicateVin),
        FleetDuplicateVehicleError
      );
    });

    test('3.2 InMemory Telemetry History Repository fulfills idempotency and batch atomicity', async () => {
      const snap1 = TelemetrySnapshot.create({
        snapshotId: 'mem-snap-1',
        tenantId: TENANT_A,
        vehicleId: 'mem-001',
        deviceId: 'dev-mem',
        timestamp: 1000,
        position: samplePos,
        kinematics: sampleKinematics,
        diagnostics: sampleDiagnostics
      });

      await memTelemetryRepo.append(snap1, TENANT_A);
      // Re-append same snapshot
      await memTelemetryRepo.append(snap1, TENANT_A);

      const list = await memTelemetryRepo.findByVehicleAndRange('mem-001', TENANT_A, 0, 2000);
      assert.strictEqual(list.length, 1);

      const batchRes = await memTelemetryRepo.appendBatch([snap1], TENANT_A);
      assert.strictEqual(batchRes.insertedCount, 0);
      assert.strictEqual(batchRes.duplicateCount, 1);

      const pruned = await memTelemetryRepo.pruneOlderThan(2000, TENANT_A);
      assert.strictEqual(pruned, 1);
      const afterPrune = await memTelemetryRepo.findByVehicleAndRange('mem-001', TENANT_A, 0, 2000);
      assert.strictEqual(afterPrune.length, 0);
    });
  });

  describe('4. Architectural Boundary Purity & Isolated Schema Invariants', () => {
    test('4.1 Fleet database initializes with independent schema version 1', () => {
      const dbManager = new FleetSqliteDatabase({ filename: ':memory:' });
      const db = dbManager.open();
      new SqliteVehicleRepository(dbManager);

      const metaRow = db.prepare('SELECT value FROM fleet_schema_metadata WHERE key = ?;')
        .get('schema_version') as { value: string };

      assert.ok(metaRow, 'fleet_schema_metadata must exist');
      assert.strictEqual(Number(metaRow.value), FLEET_SCHEMA_VERSION);
      assert.strictEqual(FLEET_SCHEMA_VERSION, 1);
      dbManager.close();
    });

    test('4.2 Zero imports from Core Engine src/domain or src/infrastructure in satellite fleet management', () => {
      const fleetRoot = path.resolve('src/satellite/fleet-management');

      function scanDir(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...scanDir(fullPath));
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const files = scanDir(fleetRoot);
      assert.ok(files.length > 5, 'Fleet management files must exist');

      const coreDomainDir = path.resolve('src/domain');
      const coreInfraDir = path.resolve('src/infrastructure');

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const importMatches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
          const importSpecifier = match[1];
          if (importSpecifier.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(file), importSpecifier);
            assert.ok(
              !resolvedPath.startsWith(coreDomainDir),
              `File ${file} imports from Core Engine src/domain: ${importSpecifier}`
            );
            assert.ok(
              !resolvedPath.startsWith(coreInfraDir),
              `File ${file} imports from Core Engine src/infrastructure: ${importSpecifier}`
            );
          } else {
            assert.ok(
              !importSpecifier.includes('src/domain') && !importSpecifier.includes('src/infrastructure'),
              `File ${file} imports forbidden core engine: ${importSpecifier}`
            );
          }
        }
      }
    });
  });
});
