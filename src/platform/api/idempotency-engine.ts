import { createHash } from "node:crypto";

export interface IdempotencyRecord {
  readonly tenantId: string;
  readonly key: string;
  readonly payloadHash: string;
  readonly statusCode: number;
  readonly responseData: unknown;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export type IdempotencyCheckResult =
  | { readonly state: "NEW" }
  | { readonly state: "MATCH"; readonly statusCode: number; readonly responseData: unknown }
  | { readonly state: "CONFLICT"; readonly message: string };

export class IdempotencyEngine {
  private readonly records: Map<string, IdempotencyRecord> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 86400000) { // 24 hours
    this.defaultTtlMs = defaultTtlMs;
  }

  private buildKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId.trim()}::${idempotencyKey.trim()}`;
  }

  private computeHash(payload: unknown): string {
    const serialized = JSON.stringify(payload ?? {});
    return createHash("sha256").update(serialized).digest("hex");
  }

  public check(tenantId: string, idempotencyKey: string, payload: unknown): IdempotencyCheckResult {
    const compositeKey = this.buildKey(tenantId, idempotencyKey);
    const existing = this.records.get(compositeKey);
    const now = Date.now();

    if (!existing || now >= existing.expiresAt) {
      if (existing) this.records.delete(compositeKey);
      return { state: "NEW" };
    }

    const currentHash = this.computeHash(payload);
    if (existing.payloadHash === currentHash) {
      return {
        state: "MATCH",
        statusCode: existing.statusCode,
        responseData: existing.responseData,
      };
    }

    return {
      state: "CONFLICT",
      message: `Idempotency key '${idempotencyKey}' was already used with different request parameters.`,
    };
  }

  public record(
    tenantId: string,
    idempotencyKey: string,
    payload: unknown,
    statusCode: number,
    responseData: unknown,
    ttlMs?: number
  ): void {
    const compositeKey = this.buildKey(tenantId, idempotencyKey);
    const now = Date.now();
    const expiresAt = now + (ttlMs ?? this.defaultTtlMs);

    this.records.set(compositeKey, {
      tenantId,
      key: idempotencyKey,
      payloadHash: this.computeHash(payload),
      statusCode,
      responseData,
      createdAt: now,
      expiresAt,
    });
  }

  public clear(): void {
    this.records.clear();
  }
}
