export interface BoundedDataLimits {
  readonly maxStringLength: number;
  readonly maxDepth: number;
  readonly maxObjectKeys: number;
}

export const DEFAULT_BOUNDED_DATA_LIMITS: Readonly<BoundedDataLimits> = Object.freeze({
  maxStringLength: 2048,
  maxDepth: 4,
  maxObjectKeys: 64,
});

const SENSITIVE_KEY = /(authorization|api[_-]?key|token|secret|password|cookie|credential|header|env|private[_-]?key)/i;

export class BoundedDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoundedDataValidationError";
  }
}

export function validateBoundedDataLimits(limits: BoundedDataLimits): void {
  for (const key of ["maxStringLength", "maxDepth", "maxObjectKeys"] as const) {
    const value = limits[key];
    if (!Number.isInteger(value) || value < 1) {
      throw new BoundedDataValidationError(`Bounded data limit '${key}' must be a positive integer`);
    }
  }
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function sanitizeBoundedValue(
  value: unknown,
  limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS,
  depth = 0,
  state: { truncated: boolean } = { truncated: false },
): unknown {
  validateBoundedDataLimits(limits);
  if (depth > limits.maxDepth) {
    state.truncated = true;
    return "[truncated]";
  }
  if (typeof value === "string") {
    if (value.length > limits.maxStringLength) {
      state.truncated = true;
      return `${value.slice(0, limits.maxStringLength)}[truncated]`;
    }
    return value;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, limits.maxObjectKeys);
    if (items.length !== value.length) state.truncated = true;
    return items.map((item) => sanitizeBoundedValue(item, limits, depth + 1, state));
  }
  const entries = Object.entries(value);
  if (entries.length > limits.maxObjectKeys) state.truncated = true;
  return Object.fromEntries(entries.slice(0, limits.maxObjectKeys).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeBoundedValue(item, limits, depth + 1, state),
  ]));
}
