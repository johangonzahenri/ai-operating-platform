export interface MemoryItem {
  readonly id: string; readonly scope: string; readonly key: string; readonly value: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>; readonly createdAt: Date; readonly updatedAt: Date;
}
export class MemoryValidationError extends Error { constructor(message: string) { super(message); this.name = "MemoryValidationError"; } }
export class MemoryNotFoundError extends Error { constructor(readonly scope: string, readonly key: string) { super(`Memory not found: ${scope}/${key}`); this.name = "MemoryNotFoundError"; } }
export class MemoryStorageError extends Error { constructor(message: string, readonly cause?: Error) { super(message); this.name = "MemoryStorageError"; } }
export interface MemoryGateway { store(item: MemoryItem): Promise<MemoryItem>; retrieve(scope: string, key: string): Promise<MemoryItem | undefined>; delete(scope: string, key: string): Promise<void>; }
export const createMemoryItem = (id: string, scope: string, key: string, value: Readonly<Record<string, unknown>>, metadata: Readonly<Record<string, unknown>> = {}, now: Date = new Date()): MemoryItem => {
  for (const [name, candidate] of [["Memory id", id], ["Memory scope", scope], ["Memory key", key]] as const) if (typeof candidate !== "string" || candidate.trim() === "") throw new MemoryValidationError(`${name} must be a non-empty string`);
  if (value === null || typeof value !== "object") throw new MemoryValidationError("Memory value must be an object");
  return { id, scope, key, value, metadata, createdAt: now, updatedAt: now };
};
