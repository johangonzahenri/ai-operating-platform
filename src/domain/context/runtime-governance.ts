/**
 * Runtime Resource Governance & Limits configuration.
 * Centralizes platform constraints across HTTP payloads, task execution timeouts,
 * query pagination, and concurrency limits to guarantee deterministic fail-closed behavior.
 */

export interface RuntimeGovernanceLimits {
  /** Maximum execution duration for a single task in milliseconds (default: 30,000ms) */
  readonly taskExecutionTimeoutMs: number;
  /** Maximum HTTP request body size in bytes (default: 1,000,000 = 1MB) */
  readonly maxPayloadSizeBytes: number;
  /** Maximum string length in string fields (default: 2048 chars) */
  readonly maxStringLength: number;
  /** Maximum number of keys in metadata dictionaries (default: 16) */
  readonly maxMetadataEntries: number;
  /** Maximum string length of individual metadata values (default: 256 chars) */
  readonly maxMetadataValueLength: number;
  /** Maximum number of records returned in paginated audit queries (default: 100) */
  readonly maxQueryLimit: number;
  /** Maximum concurrent in-flight tasks allowed before throttling (default: 50) */
  readonly maxConcurrentTasks: number;
  /** Maximum agent delegation depth (default: 5) */
  readonly maxExecutionDepth: number;
  /** Idempotency key retention time in milliseconds (default: 24h = 86,400,000ms) */
  readonly idempotencyTtlMs: number;
}

export const DEFAULT_RUNTIME_GOVERNANCE_LIMITS: Readonly<RuntimeGovernanceLimits> = Object.freeze({
  taskExecutionTimeoutMs: 30000,
  maxPayloadSizeBytes: 1000000,
  maxStringLength: 2048,
  maxMetadataEntries: 16,
  maxMetadataValueLength: 256,
  maxQueryLimit: 100,
  maxConcurrentTasks: 50,
  maxExecutionDepth: 5,
  idempotencyTtlMs: 86400000, // 24 hours
});

export class RuntimeGovernanceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RuntimeGovernanceError";
    this.code = code;
    this.status = status;
    Object.freeze(this);
  }
}
