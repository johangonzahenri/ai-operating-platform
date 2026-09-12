import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { MemoryAuthorizationRequest, MemoryGateway, MemoryItem, MemoryPolicy, MemoryQuery, MemoryStorageError, MemoryValidationError } from "../../domain/memory/memory-gateway.js";
import { PolicyDeniedError } from "../../domain/policy/policy.js";
export class MemoryService {
  constructor(private readonly memory: MemoryGateway, private readonly events: EventPublisher, private readonly policy?: MemoryPolicy) {}
  async store(item: MemoryItem, context?: ExecutionContext, actorId?: string): Promise<MemoryItem> { try { this.authorize({ operation: "write", scope: item.scope, key: item.key, actorId }); const stored = await this.memory.store(item); this.publish("memory.stored", stored, context); return stored; } catch (cause) { if (cause instanceof PolicyDeniedError) throw cause; throw this.failed("store", cause, context); } }
  async retrieve(scope: string, key: string, context?: ExecutionContext, actorId?: string): Promise<MemoryItem | undefined> { try { this.authorize({ operation: "read", scope, key, actorId }); const item = await this.memory.retrieve(scope, key); this.publish("memory.retrieved", { id: item?.id ?? key, scope, key }, context); return item; } catch (cause) { if (cause instanceof PolicyDeniedError) throw cause; throw this.failed("retrieve", cause, context); } }
  async retrieveMany(query: MemoryQuery, context?: ExecutionContext, actorId?: string): Promise<readonly MemoryItem[]> {
    if (typeof this.memory.retrieveMany !== "function") throw new MemoryValidationError("Memory gateway does not support bounded retrieval");
    try { this.authorize({ operation: "read", scope: query.scope, key: query.key ?? "*", actorId });
      const items = await this.memory.retrieveMany(query);
      for (const item of items) this.publish("memory.retrieved", item, context);
      return items;
    } catch (cause) { if (cause instanceof PolicyDeniedError) throw cause; throw this.failed("retrieveMany", cause, context); }
  }
  async delete(scope: string, key: string, context?: ExecutionContext, actorId?: string): Promise<void> { try { this.authorize({ operation: "delete", scope, key, actorId }); await this.memory.delete(scope, key); this.publish("memory.deleted", { id: key, scope, key }, context); } catch (cause) { if (cause instanceof PolicyDeniedError) throw cause; throw this.failed("delete", cause, context); } }
  private authorize(request: MemoryAuthorizationRequest): void {
    try { this.policy?.authorize(request); }
    catch (cause) {
      if (cause instanceof PolicyDeniedError) throw cause;
      throw new PolicyDeniedError("memory-access", request.key, cause instanceof Error ? cause.message : "Memory operation denied");
    }
  }
  private publish(type: "memory.stored" | "memory.retrieved" | "memory.deleted", item: Pick<MemoryItem, "id" | "scope" | "key">, context?: ExecutionContext): void { if (context) this.events.publish(event(type, context.traceId, item.id, { memoryId: item.id, scope: item.scope, key: item.key }, undefined, undefined, { taskId: context.taskId, executionId: context.executionId })); }
  private failed(action: string, cause: unknown, context?: ExecutionContext): MemoryStorageError { const error = cause instanceof Error ? cause : new Error("Unknown memory failure"); if (context) this.events.publish(event("memory.failed", context.traceId, context.executionId, { action, message: error.message }, undefined, undefined, { taskId: context.taskId, executionId: context.executionId })); return new MemoryStorageError(`Memory ${action} failed`, error); }
}
