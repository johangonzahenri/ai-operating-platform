import { BoundedDataLimits, DEFAULT_BOUNDED_DATA_LIMITS, deepFreeze, sanitizeBoundedValue, validateBoundedDataLimits } from "../context/bounded-data.js";

export interface MemoryQuery {
  readonly scope: string;
  readonly key?: string | undefined;
  readonly limit?: number | undefined;
}

export type MemoryOperation = "read" | "write" | "delete";

export interface MemoryAuthorizationRequest {
  readonly operation: MemoryOperation;
  readonly scope: string;
  readonly key: string;
  readonly actorId?: string | undefined;
}

export interface MemoryPolicy {
  authorize(request: MemoryAuthorizationRequest): void;
}

export interface MemoryItem {
  readonly id: string; readonly scope: string; readonly key: string; readonly value: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>; readonly createdAt: Date; readonly updatedAt: Date; readonly truncated: boolean;
}
export class MemoryValidationError extends Error { constructor(message: string) { super(message); this.name = "MemoryValidationError"; } }
export class MemoryNotFoundError extends Error { constructor(readonly scope: string, readonly key: string) { super(`Memory not found: ${scope}/${key}`); this.name = "MemoryNotFoundError"; } }
export class MemoryStorageError extends Error { constructor(message: string, readonly cause?: Error) { super(message); this.name = "MemoryStorageError"; } }
export interface MemoryGateway {
  store(item: MemoryItem): Promise<MemoryItem>;
  retrieve(scope: string, key: string): Promise<MemoryItem | undefined>;
  retrieveMany?(query: MemoryQuery): Promise<readonly MemoryItem[]>;
  delete(scope: string, key: string): Promise<void>;
}
export const createMemoryItem = (
  id: string,
  scope: string,
  key: string,
  value: Readonly<Record<string, unknown>>,
  metadata: Readonly<Record<string, unknown>> = {},
  now: Date = new Date(),
  limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS,
): MemoryItem => {
  for (const [name, candidate] of [["Memory id", id], ["Memory scope", scope], ["Memory key", key]] as const) if (typeof candidate !== "string" || candidate.trim() === "") throw new MemoryValidationError(`${name} must be a non-empty string`);
  if (value === null || typeof value !== "object") throw new MemoryValidationError("Memory value must be an object");
  validateBoundedDataLimits(limits);
  const state = { truncated: false };
  const safeValue = deepFreeze(sanitizeBoundedValue(value, limits, 0, state) as Readonly<Record<string, unknown>>);
  const safeMetadata = deepFreeze(sanitizeBoundedValue(metadata, limits, 0, state) as Readonly<Record<string, unknown>>);
  const createdAt = new Date(now);
  if (Number.isNaN(createdAt.getTime())) throw new MemoryValidationError("Memory createdAt must be a valid date");
  return Object.freeze({ id: id.trim(), scope: scope.trim(), key: key.trim(), value: safeValue, metadata: safeMetadata, createdAt, updatedAt: new Date(createdAt), truncated: state.truncated });
};
