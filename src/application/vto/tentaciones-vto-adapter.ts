/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * VTO Foundation Platform Adapter & Client Facade.
 * 
 * Invariants:
 * - Pure satellite application boundary: consumes Platform and VTO contracts without leaking Core/Domain internals.
 * - Observable execution with correlated traceId, requestId, tenantId, and applicationId.
 * - Fallback and degradation handling.
 */

import crypto from "node:crypto";
import {
  VirtualTryOnRequest,
  VirtualTryOnResult,
  GarmentReference,
  BodyProfileReference,
  VirtualTryOnPrivacyPolicy,
} from "../../domain/vto/virtual-tryon.js";
import { VirtualTryOnService } from "../../application/vto/virtual-tryon-service.js";

export const TENTACIONES_APPLICATION_ID = "tentaciones-commerce";

export interface TentacionesVtoAdapterConfig {
  readonly applicationId?: string;
  readonly tenantId?: string;
  readonly defaultTtlSeconds?: number;
  readonly timeoutMs?: number;
}

export class TentacionesVtoAdapter {
  private _vtoService: VirtualTryOnService;
  private _config: Required<TentacionesVtoAdapterConfig>;

  constructor(vtoService: VirtualTryOnService, config?: TentacionesVtoAdapterConfig) {
    this._vtoService = vtoService;
    this._config = {
      applicationId: config?.applicationId ?? TENTACIONES_APPLICATION_ID,
      tenantId: config?.tenantId ?? "tenant-tentaciones-01",
      defaultTtlSeconds: config?.defaultTtlSeconds ?? 300,
      timeoutMs: config?.timeoutMs ?? 5000,
    };
  }

  public getConfig(): Required<TentacionesVtoAdapterConfig> {
    return { ...this._config };
  }

  /**
   * Executes Virtual Try-On inference for a given garment and body profile.
   */
  public async tryOnGarment(params: {
    readonly garment: GarmentReference;
    readonly bodyProfile: BodyProfileReference;
    readonly idempotencyKey?: string;
    readonly traceId?: string;
    readonly requestId?: string;
    readonly privacyPolicy?: Partial<VirtualTryOnPrivacyPolicy>;
  }): Promise<VirtualTryOnResult> {
    const traceId = params.traceId ?? `trace-vto-${crypto.randomUUID()}`;
    const requestId = params.requestId ?? `req-vto-${crypto.randomUUID()}`;
    const idempotencyKey = params.idempotencyKey ?? `idemp-vto-${params.garment.productId}-${params.bodyProfile.profileId}`;

    const request: VirtualTryOnRequest = {
      requestId,
      tenantId: this._config.tenantId,
      applicationId: this._config.applicationId,
      idempotencyKey,
      garment: params.garment,
      bodyProfile: params.bodyProfile,
      privacyPolicy: {
        retentionMode: params.privacyPolicy?.retentionMode ?? "EPHEMERAL_SESSION",
        ttlSeconds: params.privacyPolicy?.ttlSeconds ?? this._config.defaultTtlSeconds,
        allowCloudFallback: params.privacyPolicy?.allowCloudFallback ?? false,
        zeroRetentionEnforced: params.privacyPolicy?.zeroRetentionEnforced ?? true,
        anonymizeMetadata: params.privacyPolicy?.anonymizeMetadata ?? true,
      },
      metadata: {
        traceId,
        submittedVia: "TentacionesVtoAdapter",
      },
    };

    return this._vtoService.submitTryOn(request, { timeoutMs: this._config.timeoutMs });
  }
}
