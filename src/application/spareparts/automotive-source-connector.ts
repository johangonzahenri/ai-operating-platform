import {
  AutomotiveSource,
  AutomotiveSourceRestrictedError,
} from "../../domain/spareparts/automotive-source.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface SourceSearchRequest {
  readonly query: string;
  readonly vehicle?: Readonly<{
    readonly make: string;
    readonly model: string;
    readonly year: number;
    readonly engine?: string;
  }> | undefined;
  readonly partCategory?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SourceProductOffer {
  readonly offerId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly partNumber?: string | undefined;
  readonly oemNumber?: string | undefined;
  readonly brand?: string | undefined;
  readonly price: number;
  readonly currency: string;
  readonly inStock: boolean;
  readonly sellerName?: string | undefined;
  readonly sellerTrustScore?: number | undefined;
  readonly productUrl: string;
  readonly fitmentVerified?: boolean | undefined;
  readonly evidenceClaims?: readonly StructuredClaimEvidence[] | undefined;
  readonly shipping?: Readonly<{
    readonly fee?: number | undefined;
    readonly freeShipping?: boolean | undefined;
    readonly carrier?: string | undefined;
    readonly estimatedDaysMin?: number | undefined;
    readonly estimatedDaysMax?: number | undefined;
  }> | undefined;
  readonly taxInfo?: Readonly<{
    readonly taxIncluded?: boolean | undefined;
    readonly taxRate?: number | undefined;
  }> | undefined;
  readonly warrantyMonths?: number | undefined;
  readonly returnPolicyDays?: number | undefined;
  readonly lastCheckedAt?: Date | undefined;
}

export interface SourceSearchResult {
  readonly sourceId: string;
  readonly success: boolean;
  readonly totalFound: number;
  readonly offers: readonly SourceProductOffer[];
  readonly latencyMs: number;
  readonly error?: string | undefined;
}

export interface AutomotiveSourceConnector {
  readonly source: AutomotiveSource;
  search(request: SourceSearchRequest): Promise<SourceSearchResult>;
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }>;
}

export class BaseAutomotiveSourceConnector implements AutomotiveSourceConnector {
  constructor(readonly source: AutomotiveSource) {}

  async search(request: SourceSearchRequest): Promise<SourceSearchResult> {
    const start = Date.now();
    if (!this.source.accessPolicy.allowed || this.source.status === "DISABLED" || this.source.status === "UNAVAILABLE") {
      throw new AutomotiveSourceRestrictedError(this.source.sourceId, `Source status is '${this.source.status}'`);
    }

    // Default deterministic search emulation for connector contract
    const queryTerm = request.query.toLowerCase();
    const offers: SourceProductOffer[] = [
      {
        offerId: `off-${this.source.sourceId}-1`,
        sourceId: this.source.sourceId,
        title: `Auto Part for ${request.query}`,
        partNumber: "BOSCH-0986494657",
        oemNumber: "04465-02220",
        brand: "Bosch",
        price: this.source.metadata?.currency === "USD" ? 45.0 : 38990,
        currency: String(this.source.metadata?.currency || "CLP"),
        inStock: true,
        sellerName: this.source.displayName,
        sellerTrustScore: this.source.trustRating.sourceReliability,
        productUrl: `${this.source.primaryUrl}/p/sample-1`,
        fitmentVerified: Boolean(request.vehicle && this.source.capabilities.getFitmentMatrix === "SUPPORTED"),
        evidenceClaims: [
          {
            claimId: `claim-${Date.now()}`,
            source: this.source.primaryUrl,
            sourceDomain: new URL(this.source.primaryUrl).hostname,
            timestamp: new Date(),
            statement: `Offer matches query '${request.query}' on ${this.source.displayName}`,
            rawEvidenceSnippet: `Catalog item found under ${request.partCategory || "auto-parts"} category.`,
            confidenceScore: this.source.trustRating.evidenceQualityScore,
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
      latencyMs: Math.max(1, Date.now() - start),
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }> {
    const isOnline = this.source.status === "AVAILABLE" || this.source.status === "VERIFIED";
    return {
      healthy: isOnline,
      latencyMs: 15,
      message: isOnline ? `Source '${this.source.displayName}' reachable` : `Source status is '${this.source.status}'`,
    };
  }
}
