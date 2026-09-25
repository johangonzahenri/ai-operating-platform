/**
 * src/infrastructure/spareparts/fixture-connectors.ts
 * Deterministic Test Fixture Connectors for Multi-Source Search Testing.
 */

import {
  AutomotiveSourceConnector,
  SourceSearchRequest,
  SourceSearchResult,
  SourceProductOffer,
} from "../../application/spareparts/automotive-source-connector.js";
import { AutomotiveSource } from "../../domain/spareparts/automotive-source.js";

export interface FixtureBehavior {
  readonly mode: "SUCCESS" | "EMPTY" | "TIMEOUT" | "ERROR" | "RATE_LIMITED" | "BLOCKED";
  readonly delayMs?: number | undefined;
  readonly errorMessage?: string | undefined;
  readonly mockOffers?: readonly SourceProductOffer[] | undefined;
}

export class TestFixtureAutomotiveConnector implements AutomotiveSourceConnector {
  constructor(
    readonly source: AutomotiveSource,
    private behavior: FixtureBehavior = { mode: "SUCCESS" }
  ) {}

  setBehavior(behavior: FixtureBehavior): void {
    this.behavior = behavior;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }> {
    return {
      healthy: this.behavior.mode === "SUCCESS" || this.behavior.mode === "EMPTY",
      latencyMs: 5,
      message: `Test fixture connector for ${this.source.sourceId}`,
    };
  }

  async search(request: SourceSearchRequest): Promise<SourceSearchResult> {
    const delay = this.behavior.delayMs || 5;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (this.behavior.mode === "TIMEOUT") {
      // Simulate timeout hanging or failing
      throw new Error(`Timeout waiting for response from source '${this.source.sourceId}'`);
    }

    if (this.behavior.mode === "RATE_LIMITED") {
      throw new Error(`Rate limit exceeded for source '${this.source.sourceId}' (429 Too Many Requests)`);
    }

    if (this.behavior.mode === "BLOCKED") {
      throw new Error(`Access blocked by source '${this.source.sourceId}' (403 Forbidden)`);
    }

    if (this.behavior.mode === "ERROR") {
      throw new Error(this.behavior.errorMessage || `Connection failure in source '${this.source.sourceId}'`);
    }

    if (this.behavior.mode === "EMPTY") {
      return Object.freeze({
        sourceId: this.source.sourceId,
        success: true,
        totalFound: 0,
        offers: Object.freeze([]),
        latencyMs: delay,
      });
    }

    // Default SUCCESS mode
    if (this.behavior.mockOffers && this.behavior.mockOffers.length > 0) {
      return Object.freeze({
        sourceId: this.source.sourceId,
        success: true,
        totalFound: this.behavior.mockOffers.length,
        offers: this.behavior.mockOffers,
        latencyMs: delay,
      });
    }

    // Generate standard deterministic fixture offers for this source
    const currency = this.source.metadata?.currency === "USD" ? "USD" : "CLP";
    const basePrice = currency === "USD" ? 42.5 : 34990;

    const offers: SourceProductOffer[] = [
      {
        offerId: `fixture-${this.source.sourceId}-1`,
        sourceId: this.source.sourceId,
        title: `${request.query} OEM Compatible`,
        partNumber: "BOSCH-0986494657",
        oemNumber: "04465-02220",
        brand: "Bosch",
        price: basePrice,
        currency,
        inStock: true,
        sellerName: `${this.source.displayName} Official Store`,
        sellerTrustScore: this.source.trustRating.sourceReliability,
        productUrl: `${this.source.primaryUrl}/fixture/item-1`,
        fitmentVerified: Boolean(request.vehicle && this.source.capabilities.getFitmentMatrix === "SUPPORTED"),
        evidenceClaims: [
          {
            claimId: `claim-${this.source.sourceId}-1`,
            source: this.source.primaryUrl,
            sourceDomain: new URL(this.source.primaryUrl).hostname,
            timestamp: new Date(),
            statement: `Offer matches query '${request.query}' on ${this.source.displayName}`,
            rawEvidenceSnippet: `Catalog item confirmed for category ${request.partCategory || "brakes"}.`,
            confidenceScore: this.source.trustRating.evidenceQualityScore,
            verifiedDeterministically: true,
          },
        ],
        lastCheckedAt: new Date(),
      },
      {
        offerId: `fixture-${this.source.sourceId}-2`,
        sourceId: this.source.sourceId,
        title: `${request.query} Premium Alternative`,
        partNumber: "BREMBO-P83082",
        oemNumber: "04465-02220",
        brand: "Brembo",
        price: basePrice * 1.25,
        currency,
        inStock: true,
        sellerName: `${this.source.displayName} Certified Vendor`,
        sellerTrustScore: this.source.trustRating.sourceReliability * 0.95,
        productUrl: `${this.source.primaryUrl}/fixture/item-2`,
        fitmentVerified: Boolean(request.vehicle && this.source.capabilities.getFitmentMatrix === "SUPPORTED"),
        evidenceClaims: [
          {
            claimId: `claim-${this.source.sourceId}-2`,
            source: this.source.primaryUrl,
            sourceDomain: new URL(this.source.primaryUrl).hostname,
            timestamp: new Date(),
            statement: `Brembo alternative matches OEM '04465-02220'`,
            rawEvidenceSnippet: "Cross-reference verified in aftermarket catalog.",
            confidenceScore: 0.92,
            verifiedDeterministically: true,
          },
        ],
        lastCheckedAt: new Date(),
      },
    ];

    return Object.freeze({
      sourceId: this.source.sourceId,
      success: true,
      totalFound: offers.length,
      offers: Object.freeze(offers),
      latencyMs: delay,
    });
  }
}
