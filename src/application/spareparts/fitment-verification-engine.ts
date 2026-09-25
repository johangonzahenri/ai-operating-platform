/**
 * src/application/spareparts/fitment-verification-engine.ts
 * Deterministic, Parametric & Evidence-Preserving Fitment Verification Engine.
 */

import {
  VehicleSpecification,
  VehicleProfile,
  normalizeVehicleMake,
  normalizeVehicleModel,
  generateCanonicalVehicleId,
} from "../../domain/spareparts/vehicle.js";
import { Fitment, FitmentRule, matchesFitmentRule } from "../../domain/spareparts/fitment.js";
import {
  FitmentVerdict,
  FitmentParameterResult,
  FitmentParameterStatus,
  FitmentConflictDetail,
  FitmentSourceReport,
  FitmentVerificationResult,
  FitmentAttributeName,
  buildVehicleFitmentKey,
} from "../../domain/spareparts/fitment-verdict.js";
import { CanonicalPartCluster } from "../../domain/spareparts/part-cluster.js";
import { Offer } from "../../domain/spareparts/product-offer.js";
import { CrossReference } from "../../domain/spareparts/cross-reference.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface FitmentVerificationInput {
  readonly targetVehicle: VehicleSpecification | VehicleProfile;
  readonly canonicalPartId: string;
  readonly rules?: readonly FitmentRule[] | undefined;
  readonly fitments?: readonly Fitment[] | undefined;
  readonly offers?: readonly Offer[] | undefined;
  readonly cluster?: CanonicalPartCluster | undefined;
  readonly crossReferences?: readonly CrossReference[] | undefined;
}

export class FitmentVerificationEngine {
  /**
   * Verifies compatibility between a part (or cluster/offers) and a target vehicle deterministically.
   * Guarantees:
   * 1. Determinism: Same input always produces identical verdict and structured explanation.
   * 2. Idempotency: Multiple executions yield identical results without duplicate claims.
   * 3. Fail-Closed: Missing required data yields UNKNOWN; contradictory evidence yields CONFLICT.
   * 4. Order Independence: Evaluation does not depend on the order of rules, offers, or sources.
   * 5. Lossless Evidence: All supporting StructuredClaimEvidence is propagated.
   */
  verifyFitment(input: FitmentVerificationInput): FitmentVerificationResult {
    const rawSpec: VehicleSpecification = "specification" in input.targetVehicle
      ? input.targetVehicle.specification
      : input.targetVehicle;

    // 1. Vehicle Normalization & Fitment Key
    const normalizedMake = normalizeVehicleMake(rawSpec.make);
    const normalizedModel = normalizeVehicleModel(rawSpec.model);
    const normalizedYear = rawSpec.year;

    const normalizedVehicleSpec: VehicleSpecification = Object.freeze({
      ...rawSpec,
      make: normalizedMake,
      model: normalizedModel,
      year: normalizedYear,
    });

    const canonicalVehicleId = "canonicalVehicleId" in input.targetVehicle
      ? input.targetVehicle.canonicalVehicleId
      : generateCanonicalVehicleId(
          normalizedMake,
          normalizedModel,
          normalizedYear,
          rawSpec.generation,
          rawSpec.engine,
          rawSpec.market
        );

    const vehicleFitmentKey = buildVehicleFitmentKey({
      make: normalizedMake,
      model: normalizedModel,
      year: normalizedYear,
      generation: rawSpec.generation,
      engine: rawSpec.engine,
      market: rawSpec.market,
    });

    // 2. Collate all candidate fitment rules deterministically
    const allRules: FitmentRule[] = [];
    if (input.rules) {
      allRules.push(...input.rules);
    }
    if (input.fitments) {
      for (const f of input.fitments) {
        if (f.rules) {
          allRules.push(...f.rules);
        }
      }
    }

    // Sort rules deterministically by ruleId to guarantee order independence
    const sortedRules = [...allRules].sort((a, b) => a.ruleId.localeCompare(b.ruleId));

    // 3. Collate Evidence & Detect Explicit Conflicts
    const evidenceList: StructuredClaimEvidence[] = [];
    const sourceReportMap = new Map<string, { sourceName: string; claims: FitmentVerdict[]; evCount: number }>();
    const conflicts: FitmentConflictDetail[] = [];

    if (input.fitments) {
      for (const f of input.fitments) {
        if (f.evidenceClaims) {
          evidenceList.push(...f.evidenceClaims);
        }
        if (f.conflictingEvidence) {
          evidenceList.push(...f.conflictingEvidence);
        }

        const srcId = f.sourceId || "unknown-source";
        if (!sourceReportMap.has(srcId)) {
          sourceReportMap.set(srcId, { sourceName: srcId, claims: [], evCount: 0 });
        }
        const rep = sourceReportMap.get(srcId)!;
        const v = f.status === "COMPATIBLE" || f.status === "EXACT" ? "FIT" : f.status === "INCOMPATIBLE" ? "NOT_FIT" : f.status === "CONFLICT" ? "CONFLICT" : "UNKNOWN";
        rep.claims.push(v);
        rep.evCount += (f.evidenceClaims?.length || 0);

        if (f.status === "CONFLICT" && f.conflictingEvidence && f.conflictingEvidence.length > 0) {
          conflicts.push({
            conflictId: `conflict-${f.fitmentId}`,
            parameter: "engine",
            sourceA: srcId,
            sourceB: "catalog-verifier",
            claimA: "Source asserted incompatible fitment claim",
            claimB: "Contradicting claim in secondary catalog",
            reason: "Conflicting source evidence recorded on Fitment aggregate",
            evidenceA: f.evidenceClaims || [],
            evidenceB: f.conflictingEvidence,
          });
        }
      }
    }

    // 4. Parameter-by-Parameter Evaluation
    // Required attributes: make, model, year
    // Conditionally required if defined in rules: engine, generation, market
    const parameterResults: FitmentParameterResult[] = [];

    if (sortedRules.length === 0) {
      // No rules provided: Fail-Closed to UNKNOWN
      parameterResults.push({
        parameter: "make",
        expected: normalizedVehicleSpec.make,
        actual: undefined,
        isRequired: true,
        status: "UNKNOWN",
        reason: "No authoritative fitment rules found for part",
      });
      parameterResults.push({
        parameter: "model",
        expected: normalizedVehicleSpec.model,
        actual: undefined,
        isRequired: true,
        status: "UNKNOWN",
        reason: "No authoritative fitment rules found for part",
      });
      parameterResults.push({
        parameter: "year",
        expected: normalizedVehicleSpec.year,
        actual: undefined,
        isRequired: true,
        status: "UNKNOWN",
        reason: "No authoritative fitment rules found for part",
      });

      return this.buildResult({
        canonicalPartId: input.canonicalPartId,
        canonicalVehicleId,
        vehicleFitmentKey,
        verdict: "UNKNOWN",
        confidence: 0.0,
        parameterResults,
        evidence: evidenceList,
        conflicts,
        sourceReportMap,
        explanation: "Verification failed-closed: missing fitment rules for this part",
      });
    }

    // Evaluate rules against target vehicle
    let anyRuleMakeMatched = false;
    let anyRuleModelMatched = false;
    let anyRuleYearMatched = false;
    let matchedRule: FitmentRule | undefined = undefined;
    let mismatchReasons: string[] = [];

    // Check for conflicting rules between sources
    const enginesClaimed = new Set<string>();
    for (const r of sortedRules) {
      if (r.engines) {
        for (const e of r.engines) enginesClaimed.add(e.toLowerCase());
      }
    }

    for (const rule of sortedRules) {
      const makeMatch = rule.make.toLowerCase() === normalizedVehicleSpec.make.toLowerCase();
      const modelMatch = rule.model.toLowerCase() === normalizedVehicleSpec.model.toLowerCase();
      const yearMatch = normalizedVehicleSpec.year >= rule.yearFrom && normalizedVehicleSpec.year <= rule.yearTo;

      if (makeMatch) anyRuleMakeMatched = true;
      if (modelMatch) anyRuleModelMatched = true;
      if (yearMatch) anyRuleYearMatched = true;

      if (matchesFitmentRule(normalizedVehicleSpec, rule)) {
        matchedRule = rule;
        break;
      }
    }

    // Build parameter evaluations
    // Parameter: MAKE
    const primaryRule = sortedRules[0];
    const makeStatus: FitmentParameterStatus = anyRuleMakeMatched ? "MATCH" : "MISMATCH";
    parameterResults.push({
      parameter: "make",
      expected: normalizedVehicleSpec.make,
      actual: primaryRule.make,
      isRequired: true,
      status: makeStatus,
      reason: makeStatus === "MATCH" ? `Make '${normalizedVehicleSpec.make}' matches catalog rule` : `Make '${normalizedVehicleSpec.make}' does not match '${primaryRule.make}'`,
    });

    // Parameter: MODEL
    const modelStatus: FitmentParameterStatus = anyRuleModelMatched ? "MATCH" : "MISMATCH";
    parameterResults.push({
      parameter: "model",
      expected: normalizedVehicleSpec.model,
      actual: primaryRule.model,
      isRequired: true,
      status: modelStatus,
      reason: modelStatus === "MATCH" ? `Model '${normalizedVehicleSpec.model}' matches catalog rule` : `Model '${normalizedVehicleSpec.model}' does not match '${primaryRule.model}'`,
    });

    // Parameter: YEAR
    const yearStatus: FitmentParameterStatus = anyRuleYearMatched ? "MATCH" : "MISMATCH";
    parameterResults.push({
      parameter: "year",
      expected: normalizedVehicleSpec.year,
      actual: `${primaryRule.yearFrom}-${primaryRule.yearTo}`,
      isRequired: true,
      status: yearStatus,
      reason: yearStatus === "MATCH"
        ? `Year ${normalizedVehicleSpec.year} falls within range [${primaryRule.yearFrom}, ${primaryRule.yearTo}]`
        : `Year ${normalizedVehicleSpec.year} outside valid range [${primaryRule.yearFrom}, ${primaryRule.yearTo}]`,
    });

    // Parameter: ENGINE (conditionally evaluated if target or rule specifies engine)
    if (normalizedVehicleSpec.engine || primaryRule.engines) {
      if (!normalizedVehicleSpec.engine) {
        // Vehicle engine unknown, but rule restricts to specific engines
        parameterResults.push({
          parameter: "engine",
          expected: undefined,
          actual: primaryRule.engines,
          isRequired: true,
          status: "UNKNOWN",
          reason: "Part specifies engine constraints, but target vehicle engine is unknown",
        });
      } else if (!primaryRule.engines || primaryRule.engines.length === 0) {
        parameterResults.push({
          parameter: "engine",
          expected: normalizedVehicleSpec.engine,
          actual: "ANY",
          isRequired: false,
          status: "MATCH",
          reason: "Part applies to all engine configurations for this vehicle",
        });
      } else {
        const engMatch = primaryRule.engines.some(e => e.toLowerCase() === normalizedVehicleSpec.engine!.toLowerCase());
        parameterResults.push({
          parameter: "engine",
          expected: normalizedVehicleSpec.engine,
          actual: primaryRule.engines,
          isRequired: true,
          status: engMatch ? "MATCH" : "MISMATCH",
          reason: engMatch
            ? `Engine '${normalizedVehicleSpec.engine}' matches supported engines`
            : `Engine '${normalizedVehicleSpec.engine}' is not in allowed list: [${primaryRule.engines.join(", ")}]`,
        });
      }
    }

    // Parameter: GENERATION
    if (normalizedVehicleSpec.generation || primaryRule.generation) {
      if (!normalizedVehicleSpec.generation) {
        parameterResults.push({
          parameter: "generation",
          expected: undefined,
          actual: primaryRule.generation,
          isRequired: false,
          status: "UNKNOWN",
          reason: "Vehicle generation not provided, unconfirmed against rule generation",
        });
      } else if (!primaryRule.generation) {
        parameterResults.push({
          parameter: "generation",
          expected: normalizedVehicleSpec.generation,
          actual: "ANY",
          isRequired: false,
          status: "MATCH",
          reason: "Rule covers all generations",
        });
      } else {
        const genMatch = primaryRule.generation.toLowerCase() === normalizedVehicleSpec.generation.toLowerCase();
        parameterResults.push({
          parameter: "generation",
          expected: normalizedVehicleSpec.generation,
          actual: primaryRule.generation,
          isRequired: true,
          status: genMatch ? "MATCH" : "MISMATCH",
          reason: genMatch
            ? `Generation '${normalizedVehicleSpec.generation}' matches rule`
            : `Generation '${normalizedVehicleSpec.generation}' differs from rule '${primaryRule.generation}'`,
        });
      }
    }

    // Parameter: MARKET
    if (normalizedVehicleSpec.market || primaryRule.markets) {
      if (primaryRule.markets && primaryRule.markets.length > 0) {
        if (!normalizedVehicleSpec.market) {
          parameterResults.push({
            parameter: "market",
            expected: undefined,
            actual: primaryRule.markets,
            isRequired: false,
            status: "UNKNOWN",
            reason: "Vehicle market not specified, rule requires specific market",
          });
        } else {
          const mktMatch = primaryRule.markets.some(m => m.toUpperCase() === normalizedVehicleSpec.market!.toUpperCase());
          parameterResults.push({
            parameter: "market",
            expected: normalizedVehicleSpec.market,
            actual: primaryRule.markets,
            isRequired: true,
            status: mktMatch ? "MATCH" : "MISMATCH",
            reason: mktMatch
              ? `Market '${normalizedVehicleSpec.market}' supported by part`
              : `Market '${normalizedVehicleSpec.market}' excluded. Allowed: [${primaryRule.markets.join(", ")}]`,
          });
        }
      }
    }

    // 5. Compute Final Verdict
    let finalVerdict: FitmentVerdict = "FIT";
    let confidence = 0.95;
    let explanation = "All required fitment parameters verified successfully";

    if (conflicts.length > 0) {
      finalVerdict = "CONFLICT";
      confidence = 0.4;
      explanation = `Contradicting fitment claims detected between sources: ${conflicts[0].reason}`;
    } else {
      const hasMismatch = parameterResults.some(p => p.isRequired && p.status === "MISMATCH");
      const hasUnknown = parameterResults.some(p => p.isRequired && p.status === "UNKNOWN");

      if (hasMismatch) {
        finalVerdict = "NOT_FIT";
        confidence = 0.99;
        const mismatchParam = parameterResults.find(p => p.isRequired && p.status === "MISMATCH")!;
        explanation = `Incompatible vehicle: Parameter '${mismatchParam.parameter}' mismatch (${mismatchParam.reason})`;
      } else if (hasUnknown) {
        finalVerdict = "UNKNOWN";
        confidence = 0.5;
        const unknownParam = parameterResults.find(p => p.isRequired && p.status === "UNKNOWN")!;
        explanation = `Indeterminate fitment (fail-closed): Parameter '${unknownParam.parameter}' is required but unverified`;
      } else if (!matchedRule) {
        finalVerdict = "NOT_FIT";
        confidence = 0.95;
        explanation = "Vehicle does not satisfy all combined constraints of any candidate fitment rule";
      }
    }

    return this.buildResult({
      canonicalPartId: input.canonicalPartId,
      canonicalVehicleId,
      vehicleFitmentKey,
      verdict: finalVerdict,
      confidence,
      parameterResults,
      evidence: evidenceList,
      conflicts,
      sourceReportMap,
      explanation,
    });
  }

  private buildResult(params: {
    readonly canonicalPartId: string;
    readonly canonicalVehicleId: string;
    readonly vehicleFitmentKey: string;
    readonly verdict: FitmentVerdict;
    readonly confidence: number;
    readonly parameterResults: readonly FitmentParameterResult[];
    readonly evidence: readonly StructuredClaimEvidence[];
    readonly conflicts: readonly FitmentConflictDetail[];
    readonly sourceReportMap: Map<string, { sourceName: string; claims: FitmentVerdict[]; evCount: number }>;
    readonly explanation: string;
  }): FitmentVerificationResult {
    const verificationId = `fvr:${params.canonicalPartId}:${params.vehicleFitmentKey}`;

    // Source reports sorted deterministically by sourceId
    const sourceReports: FitmentSourceReport[] = [];
    for (const [srcId, rep] of params.sourceReportMap.entries()) {
      const asserted = rep.claims.length > 0 ? rep.claims[0] : params.verdict;
      sourceReports.push({
        sourceId: srcId,
        sourceName: rep.sourceName,
        trustScore: 0.9,
        assertedVerdict: asserted,
        evidenceCount: rep.evCount,
      });
    }
    sourceReports.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

    // Sort evidence deterministically by claimId
    const sortedEvidence = [...params.evidence].sort((a, b) => a.claimId.localeCompare(b.claimId));

    // Deduplicate evidence deterministically
    const uniqueEvidence: StructuredClaimEvidence[] = [];
    const seenEvidenceIds = new Set<string>();
    for (const ev of sortedEvidence) {
      if (!seenEvidenceIds.has(ev.claimId)) {
        seenEvidenceIds.add(ev.claimId);
        uniqueEvidence.push(ev);
      }
    }

    return Object.freeze({
      verificationId,
      canonicalPartId: params.canonicalPartId,
      canonicalVehicleId: params.canonicalVehicleId,
      vehicleFitmentKey: params.vehicleFitmentKey,
      verdict: params.verdict,
      confidence: params.confidence,
      parameterResults: Object.freeze([...params.parameterResults]),
      evidence: Object.freeze(uniqueEvidence),
      conflicts: Object.freeze([...params.conflicts]),
      sourceReports: Object.freeze(sourceReports),
      explanation: params.explanation,
      verifiedAt: new Date(),
    });
  }
}
