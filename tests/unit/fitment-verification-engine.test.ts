/**
 * tests/unit/fitment-verification-engine.test.ts
 * Unit tests for Phase 146: Deterministic Fitment Verification Engine.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FitmentVerificationEngine } from "../../src/application/spareparts/fitment-verification-engine.js";
import { FitmentRule, createFitment } from "../../src/domain/spareparts/fitment.js";
import { VehicleSpecification, createVehicleProfile } from "../../src/domain/spareparts/vehicle.js";
import { StructuredClaimEvidence } from "../../src/domain/agent/agent-taxonomy.js";

describe("Phase 146: Deterministic Fitment Verification Engine", () => {
  let engine: FitmentVerificationEngine;

  const mockEvidence = (claim: string, src = "oem_catalog"): StructuredClaimEvidence => ({
    claimId: `claim-${Math.random().toString(36).slice(2, 7)}`,
    claimType: "FITMENT_COMPATIBILITY",
    subject: "AutomotivePart",
    predicate: "fitsVehicle",
    object: claim,
    confidence: 0.98,
    sourceId: src,
    retrievedAt: new Date("2026-09-24T12:00:00Z"),
  });

  beforeEach(() => {
    engine = new FitmentVerificationEngine();
  });

  it("Test 1 (FIT): All required vehicle parameters match fitment rules", () => {
    const vehicle: VehicleSpecification = {
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      engine: "1.8L",
      generation: "E170",
      market: "CL",
    };

    const rules: FitmentRule[] = [
      {
        ruleId: "rule-corolla-e170",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        generation: "E170",
        engines: ["1.8L", "2.0L"],
        markets: ["CL", "LATAM"],
      },
    ];

    const ev = mockEvidence("OEM catalogue lists part for Toyota Corolla 2014-2019 1.8L");
    const fitment = createFitment({
      canonicalPartId: "part:toyota:0446502220",
      canonicalVehicleId: "veh:toyota:corolla:2018",
      status: "COMPATIBLE",
      confidence: 0.98,
      provenance: "OEM_CATALOG",
      rules,
      evidenceClaims: [ev],
    });

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:toyota:0446502220",
      rules,
      fitments: [fitment],
    });

    assert.equal(result.verdict, "FIT");
    assert.ok(result.confidence >= 0.95);
    assert.equal(result.conflicts.length, 0);

    const makeParam = result.parameterResults.find(p => p.parameter === "make");
    assert.equal(makeParam?.status, "MATCH");

    const engineParam = result.parameterResults.find(p => p.parameter === "engine");
    assert.equal(engineParam?.status, "MATCH");

    assert.ok(result.evidence.some(e => e.claimId === ev.claimId));
  });

  it("Test 2 (NOT_FIT): Year outside range or mandatory constraint contradicted", () => {
    const vehicle: VehicleSpecification = {
      make: "Toyota",
      model: "Corolla",
      year: 2022, // Newer generation E210
      engine: "1.8L",
    };

    const rules: FitmentRule[] = [
      {
        ruleId: "rule-corolla-e170",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        engines: ["1.8L"],
      },
    ];

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:toyota:0446502220",
      rules,
    });

    assert.equal(result.verdict, "NOT_FIT");
    const yearParam = result.parameterResults.find(p => p.parameter === "year");
    assert.equal(yearParam?.status, "MISMATCH");
    assert.ok(result.explanation.includes("mismatch"));
  });

  it("Test 3 (UNKNOWN): Missing critical parameter fail-closed", () => {
    // Target vehicle lacks engine information, but rule strictly requires specific engine
    const vehicle: VehicleSpecification = {
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      // engine not provided!
    };

    const rules: FitmentRule[] = [
      {
        ruleId: "rule-corolla-specific-engine",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        engines: ["1.8L Hybrid"], // Part is specifically for Hybrid engine only!
      },
    ];

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:toyota:0446502220",
      rules,
    });

    assert.equal(result.verdict, "UNKNOWN");
    const engineParam = result.parameterResults.find(p => p.parameter === "engine");
    assert.equal(engineParam?.status, "UNKNOWN");
    assert.ok(result.explanation.includes("fail-closed"));
  });

  it("Test 4 (CONFLICT): Contradicting source claims between trusted providers", () => {
    const vehicle: VehicleSpecification = {
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      engine: "1.8L",
    };

    const evA = mockEvidence("OEM Catalog states exact fitment", "oem_cat");
    const evB = mockEvidence("Aftermarket distributor states incompatible caliper design", "aftermarket_dist");

    const conflictingFitment = createFitment({
      canonicalPartId: "part:toyota:0446502220",
      canonicalVehicleId: "veh:toyota:corolla:2018",
      status: "CONFLICT",
      confidence: 0.5,
      provenance: "OEM_CATALOG",
      rules: [
        {
          ruleId: "r-oem",
          make: "Toyota",
          model: "Corolla",
          yearFrom: 2014,
          yearTo: 2019,
          engines: ["1.8L"],
        },
      ],
      evidenceClaims: [evA],
      conflictingEvidence: [evB],
    });

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:toyota:0446502220",
      fitments: [conflictingFitment],
    });

    assert.equal(result.verdict, "CONFLICT");
    assert.ok(result.conflicts.length > 0);
    assert.ok(result.explanation.includes("Contradicting fitment claims detected"));
  });

  it("Test 5 (Engine-specific fitment): Same vehicle model with different engine configurations", () => {
    const corolla18: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018, engine: "1.8L" };
    const corolla20: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018, engine: "2.0L" };

    const brakePadRules: FitmentRule[] = [
      {
        ruleId: "rule-1.8L-only",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        engines: ["1.8L"],
      },
    ];

    const result18 = engine.verifyFitment({ targetVehicle: corolla18, canonicalPartId: "part:toyota:18pad", rules: brakePadRules });
    const result20 = engine.verifyFitment({ targetVehicle: corolla20, canonicalPartId: "part:toyota:18pad", rules: brakePadRules });

    assert.equal(result18.verdict, "FIT");
    assert.equal(result20.verdict, "NOT_FIT");
  });

  it("Test 6 (Generation-specific fitment): Same year transition with differing body generations", () => {
    // 2019 was a transition year for Toyota Corolla (E170 vs E210)
    const genE170: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2019, generation: "E170" };
    const genE210: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2019, generation: "E210" };

    const e170Rules: FitmentRule[] = [
      {
        ruleId: "r-e170",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        generation: "E170",
      },
    ];

    const res1 = engine.verifyFitment({ targetVehicle: genE170, canonicalPartId: "part:toyota:e170pad", rules: e170Rules });
    const res2 = engine.verifyFitment({ targetVehicle: genE210, canonicalPartId: "part:toyota:e170pad", rules: e170Rules });

    assert.equal(res1.verdict, "FIT");
    assert.equal(res2.verdict, "NOT_FIT");
  });

  it("Test 7 (Market-specific fitment): Same model/year but regional market restriction", () => {
    const vehicleCL: VehicleSpecification = { make: "Toyota", model: "Yaris", year: 2020, market: "CL" };
    const vehicleUS: VehicleSpecification = { make: "Toyota", model: "Yaris", year: 2020, market: "US" };

    const clMarketRules: FitmentRule[] = [
      {
        ruleId: "r-latam-yaris",
        make: "Toyota",
        model: "Yaris",
        yearFrom: 2018,
        yearTo: 2022,
        markets: ["CL", "LATAM"],
      },
    ];

    const resCL = engine.verifyFitment({ targetVehicle: vehicleCL, canonicalPartId: "part:toyota:yaris-cl", rules: clMarketRules });
    const resUS = engine.verifyFitment({ targetVehicle: vehicleUS, canonicalPartId: "part:toyota:yaris-cl", rules: clMarketRules });

    assert.equal(resCL.verdict, "FIT");
    assert.equal(resUS.verdict, "NOT_FIT");
  });

  it("Test 8 (Cross-Reference Aware Fitment): Aftermarket equivalent verifies against vehicle", () => {
    const vehicle: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018, engine: "1.8L" };

    // Brembo aftermarket pad P83082 cross-referenced from Toyota 04465-02220
    const rules: FitmentRule[] = [
      {
        ruleId: "r-brembo-corolla",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        engines: ["1.8L"],
      },
    ];

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:brembo:p83082",
      rules,
    });

    assert.equal(result.verdict, "FIT");
    assert.equal(result.canonicalPartId, "part:brembo:p83082");
  });

  it("Test 9 (Evidence Preservation): Lossless capture of supporting evidence", () => {
    const vehicle: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018 };
    const ev1 = mockEvidence("TecDoc certified fitment", "tecdoc");
    const ev2 = mockEvidence("Autoplanet catalog match", "autoplanet_cl");

    const fitment = createFitment({
      canonicalPartId: "part:toyota:0446502220",
      canonicalVehicleId: "veh:toyota:corolla:2018",
      status: "COMPATIBLE",
      confidence: 0.95,
      provenance: "OEM_CATALOG",
      rules: [{ ruleId: "r1", make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019 }],
      evidenceClaims: [ev1, ev2],
    });

    const result = engine.verifyFitment({
      targetVehicle: vehicle,
      canonicalPartId: "part:toyota:0446502220",
      fitments: [fitment],
    });

    assert.equal(result.evidence.length, 2);
    const evIds = result.evidence.map(e => e.claimId);
    assert.ok(evIds.includes(ev1.claimId));
    assert.ok(evIds.includes(ev2.claimId));
  });

  it("Test 10 (Determinism & Order Independence): Shuffled rules yield identical verification result", () => {
    const vehicle: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018, engine: "1.8L" };

    const ruleA: FitmentRule = { ruleId: "rule-A", make: "Toyota", model: "Corolla", yearFrom: 2010, yearTo: 2013 };
    const ruleB: FitmentRule = { ruleId: "rule-B", make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019, engines: ["1.8L"] };
    const ruleC: FitmentRule = { ruleId: "rule-C", make: "Nissan", model: "Sentra", yearFrom: 2015, yearTo: 2020 };

    const result1 = engine.verifyFitment({ targetVehicle: vehicle, canonicalPartId: "part:toyota:pad", rules: [ruleA, ruleB, ruleC] });
    const result2 = engine.verifyFitment({ targetVehicle: vehicle, canonicalPartId: "part:toyota:pad", rules: [ruleC, ruleB, ruleA] });
    const result3 = engine.verifyFitment({ targetVehicle: vehicle, canonicalPartId: "part:toyota:pad", rules: [ruleB, ruleA, ruleC] });

    assert.equal(result1.verdict, result2.verdict);
    assert.equal(result2.verdict, result3.verdict);
    assert.equal(result1.verificationId, result2.verificationId);
    assert.equal(result1.vehicleFitmentKey, result2.vehicleFitmentKey);
  });

  it("Test 11 (Idempotency): Repeated execution yields identical output", () => {
    const vehicle: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018 };
    const rules: FitmentRule[] = [{ ruleId: "r1", make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019 }];

    const firstRun = engine.verifyFitment({ targetVehicle: vehicle, canonicalPartId: "part:toyota:pad", rules });
    const secondRun = engine.verifyFitment({ targetVehicle: vehicle, canonicalPartId: "part:toyota:pad", rules });

    assert.deepEqual(firstRun.verdict, secondRun.verdict);
    assert.deepEqual(firstRun.verificationId, secondRun.verificationId);
    assert.deepEqual(firstRun.parameterResults.map(p => p.status), secondRun.parameterResults.map(p => p.status));
  });

  it("Test 12 (False Positive Protection): Partial vehicle profile does NOT produce FIT without verification", () => {
    const minimalVehicle: VehicleSpecification = { make: "Toyota", model: "Corolla", year: 2018 };

    // When no rules exist for a part, engine must never assume compatibility
    const resultNoRules = engine.verifyFitment({
      targetVehicle: minimalVehicle,
      canonicalPartId: "part:unknown:99999",
      rules: [],
    });

    assert.equal(resultNoRules.verdict, "UNKNOWN");
    assert.notEqual(resultNoRules.verdict, "FIT");
  });
});
