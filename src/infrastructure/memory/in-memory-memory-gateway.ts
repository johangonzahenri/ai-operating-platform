import { MemoryGateway, MemoryItem, MemoryValidationError } from "../../domain/memory/memory-gateway.js";
export class InMemoryMemoryGateway implements MemoryGateway {
  private readonly items = new Map<string, MemoryItem>();
  async store(item: MemoryItem): Promise<MemoryItem> { if (!item?.scope || !item.key) throw new MemoryValidationError("Memory item requires scope and key"); const stored = { ...item, updatedAt: new Date(item.updatedAt) }; this.items.set(this.id(item.scope, item.key), stored); return stored; }
  async retrieve(scope: string, key: string): Promise<MemoryItem | undefined> { return this.items.get(this.id(scope, key)); }
  async delete(scope: string, key: string): Promise<void> { this.items.delete(this.id(scope, key)); }
  private id(scope: string, key: string): string { return `${scope}:${key}`; }
}
