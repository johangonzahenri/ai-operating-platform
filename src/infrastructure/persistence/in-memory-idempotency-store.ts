import {
  IdempotencyAcquireResult,
  IdempotencyRecord,
  IdempotencyStore,
  computeRequestHash,
} from "../../application/ports/idempotency-port.js";

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;

  constructor(ttlMs = 86400000) {
    this.ttlMs = ttlMs;
  }

  private buildKey(idempotencyKey: string, tenantId?: string, principalId?: string): string {
    const t = tenantId ? tenantId.trim() : "global";
    const p = principalId ? principalId.trim() : "anonymous";
    return `${t}:${p}:${idempotencyKey.trim()}`;
  }

  async acquire(
    idempotencyKey: string,
    payload: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<IdempotencyAcquireResult> {
    const compositeKey = this.buildKey(idempotencyKey, tenantId, principalId);
    const existing = this.records.get(compositeKey);
    const now = new Date();

    if (existing) {
      if (existing.expiresAt.getTime() <= now.getTime()) {
        this.records.delete(compositeKey);
      } else {
        const incomingHash = computeRequestHash(payload);
        if (existing.requestHash !== incomingHash) {
          return { status: "MISMATCH" };
        }
        if (existing.status === "IN_PROGRESS") {
          return { status: "IN_PROGRESS" };
        }
        if (existing.status === "FAILED") {
          // Re-arm as IN_PROGRESS for retry
          this.records.set(compositeKey, {
            ...existing,
            status: "IN_PROGRESS",
            statusCode: 0,
            response: undefined,
            createdAt: now,
            expiresAt: new Date(now.getTime() + this.ttlMs),
          });
          return { status: "NEW" };
        }
        return {
          status: "CACHED",
          statusCode: existing.statusCode,
          response: existing.response,
        };
      }
    }

    const record: IdempotencyRecord = {
      compositeKey,
      idempotencyKey: idempotencyKey.trim(),
      tenantId: tenantId ? tenantId.trim() : "global",
      principalId: principalId ? principalId.trim() : "anonymous",
      requestHash: computeRequestHash(payload),
      status: "IN_PROGRESS",
      statusCode: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
    this.records.set(compositeKey, record);
    return { status: "NEW" };
  }

  async complete(
    idempotencyKey: string,
    statusCode: number,
    response: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<void> {
    const compositeKey = this.buildKey(idempotencyKey, tenantId, principalId);
    const existing = this.records.get(compositeKey);
    const now = new Date();
    if (existing) {
      const updated: IdempotencyRecord = {
        ...existing,
        status: "COMPLETED",
        statusCode,
        response,
      };
      this.records.set(compositeKey, updated);
    } else {
      this.records.set(compositeKey, {
        compositeKey,
        idempotencyKey: idempotencyKey.trim(),
        tenantId: tenantId ? tenantId.trim() : "global",
        principalId: principalId ? principalId.trim() : "anonymous",
        requestHash: "",
        status: "COMPLETED",
        statusCode,
        response,
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.ttlMs),
      });
    }
  }

  async fail(
    idempotencyKey: string,
    statusCode: number,
    error: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<void> {
    const compositeKey = this.buildKey(idempotencyKey, tenantId, principalId);
    const existing = this.records.get(compositeKey);
    const now = new Date();
    if (existing) {
      const updated: IdempotencyRecord = {
        ...existing,
        status: "FAILED",
        statusCode,
        response: error,
      };
      this.records.set(compositeKey, updated);
    } else {
      this.records.set(compositeKey, {
        compositeKey,
        idempotencyKey: idempotencyKey.trim(),
        tenantId: tenantId ? tenantId.trim() : "global",
        principalId: principalId ? principalId.trim() : "anonymous",
        requestHash: "",
        status: "FAILED",
        statusCode,
        response: error,
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.ttlMs),
      });
    }
  }
}
