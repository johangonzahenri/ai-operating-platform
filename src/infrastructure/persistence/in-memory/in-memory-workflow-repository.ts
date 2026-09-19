import {
  WorkflowDefinition,
} from "../../../domain/workflow/workflow-definition.js";
import {
  WorkflowInstance,
} from "../../../domain/workflow/workflow-instance.js";
import {
  WorkflowConcurrencyConflictError,
} from "../../../domain/workflow/workflow-errors.js";
import {
  WorkflowDefinitionRepositoryPort,
  WorkflowInstanceRepositoryPort,
} from "../../../application/ports/workflow-repository-port.js";

export class InMemoryWorkflowDefinitionRepository implements WorkflowDefinitionRepositoryPort {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  async save(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    const key = `${definition.tenantId}:${definition.id}`;
    const existing = this.definitions.get(key);
    if (existing) {
      if (existing.version !== definition.version - 1 && existing.version !== definition.version) {
        throw new WorkflowConcurrencyConflictError(
          `Workflow definition OCC conflict on '${definition.id}': current version ${existing.version}, expected ${definition.version - 1}`
        );
      }
    }
    this.definitions.set(key, definition);
    return definition;
  }

  async findById(id: string, tenantId: string): Promise<WorkflowDefinition | undefined> {
    const key = `${tenantId}:${id}`;
    return this.definitions.get(key);
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowDefinition[]> {
    const filtered = Array.from(this.definitions.values()).filter((d) => d.tenantId === tenantId);
    const start = offset && offset > 0 ? offset : 0;
    const end = limit && limit > 0 ? start + limit : undefined;
    return filtered.slice(start, end);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const key = `${tenantId}:${id}`;
    return this.definitions.delete(key);
  }
}

export class InMemoryWorkflowInstanceRepository implements WorkflowInstanceRepositoryPort {
  private readonly instances = new Map<string, WorkflowInstance>();

  async save(instance: WorkflowInstance): Promise<WorkflowInstance> {
    const key = `${instance.tenantId}:${instance.id}`;
    const existing = this.instances.get(key);
    if (existing) {
      if (existing.version !== instance.version - 1 && existing.version !== instance.version) {
        throw new WorkflowConcurrencyConflictError(
          `Workflow instance OCC conflict on '${instance.id}': current version ${existing.version}, expected ${instance.version - 1}`
        );
      }
    }
    this.instances.set(key, instance);
    return instance;
  }

  async findById(id: string, tenantId: string): Promise<WorkflowInstance | undefined> {
    const key = `${tenantId}:${id}`;
    return this.instances.get(key);
  }

  async findByDefinitionId(definitionId: string, tenantId: string): Promise<readonly WorkflowInstance[]> {
    return Array.from(this.instances.values()).filter(
      (i) => i.workflowDefinitionId === definitionId && i.tenantId === tenantId
    );
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowInstance[]> {
    const filtered = Array.from(this.instances.values()).filter((i) => i.tenantId === tenantId);
    const start = offset && offset > 0 ? offset : 0;
    const end = limit && limit > 0 ? start + limit : undefined;
    return filtered.slice(start, end);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const key = `${tenantId}:${id}`;
    return this.instances.delete(key);
  }
}
