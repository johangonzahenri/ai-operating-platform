import { MemoryGateway, MemoryItem, MemoryQuery, MemoryValidationError } from "../../domain/memory/memory-gateway.js";
export class InMemoryMemoryGateway implements MemoryGateway {
  private readonly items = new Map<string, MemoryItem>();
  async store(item: MemoryItem): Promise<MemoryItem> {
    if (!item?.scope || !item.key) throw new MemoryValidationError("Memory item requires scope and key");
    const existing = this.items.get(this.id(item.scope, item.key));
    const updatedAt = existing && item.updatedAt.getTime() <= existing.updatedAt.getTime()
      ? new Date(existing.updatedAt.getTime() + 1)
      : new Date(item.updatedAt);
    const stored = Object.freeze({
      ...item,
      id: existing?.id ?? item.id,
      createdAt: new Date(existing?.createdAt ?? item.createdAt),
      updatedAt,
    });
    this.items.set(this.id(item.scope, item.key), stored);
    return stored;
  }
  async retrieve(scope: string, key: string): Promise<MemoryItem | undefined> { return this.items.get(this.id(scope, key)); }
  async retrieveMany(query: MemoryQuery): Promise<readonly MemoryItem[]> {
    if (!query?.scope?.trim()) throw new MemoryValidationError("Memory query requires a scope");
    const limit = query.limit ?? 16;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new MemoryValidationError("Memory query limit must be between 1 and 100");
    const items = [...this.items.values()]
      .filter((item) => item.scope === query.scope.trim() && (query.key === undefined || item.key === query.key.trim()))
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime() || left.key.localeCompare(right.key));
    return Object.freeze(items.slice(-limit).reverse());
  }
  async delete(scope: string, key: string): Promise<void> { this.items.delete(this.id(scope, key)); }
  private id(scope: string, key: string): string { return `${scope}:${key}`; }
}
