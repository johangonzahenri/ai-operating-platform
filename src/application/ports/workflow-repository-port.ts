import { WorkflowDefinition } from "../../domain/workflow/workflow-definition.js";
import { WorkflowInstance } from "../../domain/workflow/workflow-instance.js";

export interface WorkflowDefinitionRepositoryPort {
  save(definition: WorkflowDefinition): Promise<WorkflowDefinition>;
  findById(id: string, tenantId: string): Promise<WorkflowDefinition | undefined>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowDefinition[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}

export interface WorkflowInstanceRepositoryPort {
  save(instance: WorkflowInstance): Promise<WorkflowInstance>;
  findById(id: string, tenantId: string): Promise<WorkflowInstance | undefined>;
  findByDefinitionId(definitionId: string, tenantId: string): Promise<readonly WorkflowInstance[]>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowInstance[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
