import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { MemoryGateway, MemoryItem, MemoryQuery, MemoryStorageError, MemoryValidationError } from "../../domain/memory/memory-gateway.js";
export class MemoryService {
  constructor(private readonly memory: MemoryGateway, private readonly events: EventPublisher) {}
  async store(item: MemoryItem, context?: ExecutionContext): Promise<MemoryItem> { try { const stored = await this.memory.store(item); this.publish("memory.stored", item, context); return stored; } catch (cause) { throw this.failed("store", cause, context); } }
  async retrieve(scope: string, key: string, context?: ExecutionContext): Promise<MemoryItem | undefined> { try { const item = await this.memory.retrieve(scope, key); this.publish("memory.retrieved", { id: item?.id ?? key, scope, key }, context); return item; } catch (cause) { throw this.failed("retrieve", cause, context); } }
  async retrieveMany(query: MemoryQuery, context?: ExecutionContext): Promise<readonly MemoryItem[]> {
    if (typeof this.memory.retrieveMany !== "function") throw new MemoryValidationError("Memory gateway does not support bounded retrieval");
    try {
      const items = await this.memory.retrieveMany(query);
      for (const item of items) this.publish("memory.retrieved", item, context);
      return items;
    } catch (cause) { throw this.failed("retrieveMany", cause, context); }
  }
  async delete(scope: string, key: string, context?: ExecutionContext): Promise<void> { try { await this.memory.delete(scope, key); this.publish("memory.deleted", { id: key, scope, key }, context); } catch (cause) { throw this.failed("delete", cause, context); } }
  private publish(type: "memory.stored" | "memory.retrieved" | "memory.deleted", item: Pick<MemoryItem, "id" | "scope" | "key">, context?: ExecutionContext): void { if (context) this.events.publish(event(type, context.traceId, item.id, { memoryId: item.id, scope: item.scope, key: item.key }, undefined, undefined, { taskId: context.taskId, executionId: context.executionId })); }
  private failed(action: string, cause: unknown, context?: ExecutionContext): MemoryStorageError { const error = cause instanceof Error ? cause : new Error("Unknown memory failure"); if (context) this.events.publish(event("memory.failed", context.traceId, context.executionId, { action, message: error.message }, undefined, undefined, { taskId: context.taskId, executionId: context.executionId })); return new MemoryStorageError(`Memory ${action} failed`, error); }
}
