import { CoordinationRepositoryPort } from "../../../application/ports/coordination-repository-port.js";
import { AgentCoordinationRecord } from "../../../domain/organization/organizational-coordination.js";

export class InMemoryCoordinationRepository implements CoordinationRepositoryPort {
  private readonly records = new Map<string, AgentCoordinationRecord>();

  async save(record: AgentCoordinationRecord): Promise<AgentCoordinationRecord> {
    this.records.set(record.id, record);
    return record;
  }

  async findById(id: string, tenantId?: string): Promise<AgentCoordinationRecord | undefined> {
    const record = this.records.get(id);
    if (!record) return undefined;
    if (tenantId && record.tenantId !== tenantId) return undefined;
    return record;
  }

  async findByTenantId(tenantId: string, limit = 50, offset = 0): Promise<readonly AgentCoordinationRecord[]> {
    const all = Array.from(this.records.values())
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(offset, offset + limit);
  }

  async findByTeamId(teamId: string, tenantId?: string, limit = 50, offset = 0): Promise<readonly AgentCoordinationRecord[]> {
    const all = Array.from(this.records.values())
      .filter((r) => r.teamId === teamId && (!tenantId || r.tenantId === tenantId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(offset, offset + limit);
  }

  async findByParentExecutionId(parentExecutionId: string, tenantId?: string): Promise<readonly AgentCoordinationRecord[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.parentExecutionId === parentExecutionId && (!tenantId || r.tenantId === tenantId)
    );
  }

  clear(): void {
    this.records.clear();
  }
}
