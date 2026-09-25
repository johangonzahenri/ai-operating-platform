/**
 * src/application/spareparts/cross-reference-service.ts
 * Cross-Reference Resolution Engine (OEM <-> Aftermarket, Supersedes, Replacements).
 */

import { CrossReference, createCrossReference, CrossReferenceType } from "../../domain/spareparts/cross-reference.js";
import { PartNumber, normalizePartNumber } from "../../domain/spareparts/part-number.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface RegisterCrossReferenceRequest {
  readonly sourcePartNumber: PartNumber;
  readonly targetPartNumber: PartNumber;
  readonly relationType: CrossReferenceType;
  readonly confidence?: number | undefined;
  readonly verifiedBy?: string | undefined;
  readonly notes?: string | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export class CrossReferenceService {
  private readonly repository: Map<string, CrossReference> = new Map();
  // Index by normalized part number for fast graph lookups
  private readonly partIndex: Map<string, Set<string>> = new Map();

  /**
   * Registers a cross-reference relationship deterministically.
   */
  register(request: RegisterCrossReferenceRequest): CrossReference {
    const xref = createCrossReference(request);
    this.repository.set(xref.crossReferenceId, xref);

    const srcNorm = xref.sourcePartNumber.normalizedValue;
    const tgtNorm = xref.targetPartNumber.normalizedValue;

    if (!this.partIndex.has(srcNorm)) {
      this.partIndex.set(srcNorm, new Set());
    }
    this.partIndex.get(srcNorm)!.add(xref.crossReferenceId);

    if (xref.direction === "BIDIRECTIONAL") {
      if (!this.partIndex.has(tgtNorm)) {
        this.partIndex.set(tgtNorm, new Set());
      }
      this.partIndex.get(tgtNorm)!.add(xref.crossReferenceId);
    }

    return xref;
  }

  /**
   * Resolves direct cross references for a given part number.
   */
  getCrossReferencesForPart(partNumber: string | PartNumber): readonly CrossReference[] {
    const norm = typeof partNumber === "string" ? normalizePartNumber(partNumber) : partNumber.normalizedValue;
    const xrefIds = this.partIndex.get(norm);
    if (!xrefIds || xrefIds.size === 0) {
      return Object.freeze([]);
    }

    const results: CrossReference[] = [];
    for (const id of xrefIds) {
      const xref = this.repository.get(id);
      if (xref) {
        results.push(xref);
      }
    }

    // Deterministic sort by crossReferenceId
    return Object.freeze(results.sort((a, b) => a.crossReferenceId.localeCompare(b.crossReferenceId)));
  }

  /**
   * Resolves the entire connected component of equivalent part numbers starting from a root part number.
   * Traverses ONLY exact/equivalent/supersedes relationships with high confidence (>= 0.8).
   */
  resolveEquivalentPartNumbers(
    rootPartNumber: string | PartNumber,
    options?: { readonly minConfidence?: number | undefined }
  ): readonly PartNumber[] {
    const minConf = options?.minConfidence !== undefined ? options.minConfidence : 0.8;
    const initialNorm = typeof rootPartNumber === "string" ? normalizePartNumber(rootPartNumber) : rootPartNumber.normalizedValue;

    const visitedNorms = new Set<string>([initialNorm]);
    const queue: string[] = [initialNorm];
    const resolvedParts = new Map<string, PartNumber>();

    if (typeof rootPartNumber !== "string") {
      resolvedParts.set(initialNorm, rootPartNumber);
    }

    while (queue.length > 0) {
      const currentNorm = queue.shift()!;
      const xrefs = this.getCrossReferencesForPart(currentNorm);

      for (const xref of xrefs) {
        if (xref.confidence < minConf) {
          continue;
        }

        // Only traverse confident equivalence relations
        if (xref.relationType !== "EXACT" && xref.relationType !== "EQUIVALENT" && xref.relationType !== "SUPERSEDES") {
          continue;
        }

        const candidateParts = [xref.sourcePartNumber, xref.targetPartNumber];
        for (const candidate of candidateParts) {
          const candNorm = candidate.normalizedValue;
          if (!visitedNorms.has(candNorm)) {
            visitedNorms.add(candNorm);
            queue.push(candNorm);
            resolvedParts.set(candNorm, candidate);
          }
        }
      }
    }

    const result = Array.from(resolvedParts.values()).filter(p => p.normalizedValue !== initialNorm);
    return Object.freeze(result.sort((a, b) => a.normalizedValue.localeCompare(b.normalizedValue)));
  }

  /**
   * Returns all stored cross references deterministically sorted.
   */
  getAll(): readonly CrossReference[] {
    const all = Array.from(this.repository.values());
    return Object.freeze(all.sort((a, b) => a.crossReferenceId.localeCompare(b.crossReferenceId)));
  }

  /**
   * Clears in-memory cross references.
   */
  clear(): void {
    this.repository.clear();
    this.partIndex.clear();
  }
}
