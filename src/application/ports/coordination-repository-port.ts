import { AgentCoordinationRecord } from "../../domain/organization/organizational-coordination.js";

export interface CoordinationRepositoryPort {
  save(record: AgentCoordinationRecord): Promise<AgentCoordinationRecord>;
  findById(id: string, tenantId?: string): Promise<AgentCoordinationRecord | undefined>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly AgentCoordinationRecord[]>;
  findByTeamId(teamId: string, tenantId?: string, limit?: number, offset?: number): Promise<readonly AgentCoordinationRecord[]>;
  findByParentExecutionId(parentExecutionId: string, tenantId?: string): Promise<readonly AgentCoordinationRecord[]>;
}
