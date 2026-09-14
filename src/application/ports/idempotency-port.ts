import crypto from "node:crypto";

export type IdempotencyStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface IdempotencyRecord {
  readonly compositeKey: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly requestHash: string;
  readonly status: IdempotencyStatus;
  readonly statusCode: number;
  readonly response?: unknown;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type IdempotencyAcquireResult =
  | { readonly status: "NEW" }
  | { readonly status: "CACHED"; readonly statusCode: number; readonly response: unknown }
  | { readonly status: "IN_PROGRESS" }
  | { readonly status: "MISMATCH" };

export interface IdempotencyStore {
  acquire(
    idempotencyKey: string,
    payload: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<IdempotencyAcquireResult>;

  complete(
    idempotencyKey: string,
    statusCode: number,
    response: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<void>;

  fail(
    idempotencyKey: string,
    statusCode: number,
    error: unknown,
    tenantId?: string,
    principalId?: string
  ): Promise<void>;
}

export function computeRequestHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ":" + canonicalize((val as Record<string, unknown>)[k]));
  return "{" + entries.join(",") + "}";
}
