import { DatabaseSync } from "node:sqlite";
import { SqliteDatabase } from "./sqlite-database.js";
import {
  AgentProfile,
  AgentCapability,
  ProfileConcurrencyConflictError,
} from "../../../domain/organization/agent-profile.js";
import { MembershipRole } from "../../../domain/organization/agent-membership.js";
import { AgentStatus } from "../../../domain/agent/agent.js";
import {
  AgentDiscoveryCriteria,
  AgentProfileRepositoryPort,
} from "../../../application/ports/agent-profile-repository-port.js";

interface AgentProfileRow {
  agent_id: string;
  tenant_id: string;
  organization_id: string;
  team_id: string;
  role: string;
  responsibilities_json: string;
  capabilities_json: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export class SqliteAgentProfileRepository implements AgentProfileRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(private readonly dbManager: SqliteDatabase) {
    this.db = this.dbManager.open();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        agent_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        role TEXT NOT NULL,
        responsibilities_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_profiles_tenant ON agent_profiles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_agent_profiles_team ON agent_profiles(team_id);
      CREATE INDEX IF NOT EXISTS idx_agent_profiles_role ON agent_profiles(role);
    `);
  }

  private mapRowToProfile(row: AgentProfileRow): AgentProfile {
    const rawCapabilities: any[] = JSON.parse(row.capabilities_json);
    const capabilities: AgentCapability[] = rawCapabilities.map((c) => ({
      id: c.id,
      name: c.name,
      version: c.version,
      description: c.description,
      category: c.category,
      status: c.status,
      verifiedAt: c.verifiedAt ? new Date(c.verifiedAt) : undefined,
      verifiedBy: c.verifiedBy,
      metadata: c.metadata,
    }));

    return AgentProfile.rehydrate({
      agentId: row.agent_id,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      teamId: row.team_id,
      role: row.role as MembershipRole,
      responsibilities: JSON.parse(row.responsibilities_json) as string[],
      capabilities,
      status: row.status as AgentStatus,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async save(profile: AgentProfile): Promise<AgentProfile> {

    const existing = await this.findByAgentId(profile.agentId);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO agent_profiles (
          agent_id, tenant_id, organization_id, team_id, role,
          responsibilities_json, capabilities_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        profile.agentId,
        profile.tenantId,
        profile.organizationId,
        profile.teamId,
        profile.role,
        JSON.stringify(profile.responsibilities),
        JSON.stringify(profile.capabilities),
        profile.status,
        profile.version,
        profile.createdAt.toISOString(),
        profile.updatedAt.toISOString()
      );
      return profile;
    }

    const expectedVersion = profile.version - 1;
    const updateStmt = this.db.prepare(`
      UPDATE agent_profiles
      SET tenant_id = ?, organization_id = ?, team_id = ?, role = ?,
          responsibilities_json = ?, capabilities_json = ?, status = ?,
          version = ?, updated_at = ?
      WHERE agent_id = ? AND version = ?
    `);

    const result = updateStmt.run(
      profile.tenantId,
      profile.organizationId,
      profile.teamId,
      profile.role,
      JSON.stringify(profile.responsibilities),
      JSON.stringify(profile.capabilities),
      profile.status,
      profile.version,
      profile.updatedAt.toISOString(),
      profile.agentId,
      expectedVersion
    );

    if (result.changes === 0) {
      throw new ProfileConcurrencyConflictError(
        `Agent profile OCC conflict on agent '${profile.agentId}': current version ${existing.version}, expected ${expectedVersion}`
      );
    }

    return profile;
  }

  async findByAgentId(agentId: string, tenantId?: string): Promise<AgentProfile | undefined> {

    let query = "SELECT * FROM agent_profiles WHERE agent_id = ?";
    const params: any[] = [agentId];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const row = this.db.prepare(query).get(...params) as AgentProfileRow | undefined;
    return row ? this.mapRowToProfile(row) : undefined;
  }

  async findByTeamId(teamId: string, tenantId?: string): Promise<readonly AgentProfile[]> {

    let query = "SELECT * FROM agent_profiles WHERE team_id = ?";
    const params: any[] = [teamId];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const rows = (this.db.prepare(query).all(...params) as unknown) as AgentProfileRow[];
    return rows.map((r) => this.mapRowToProfile(r));
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly AgentProfile[]> {

    let query = "SELECT * FROM agent_profiles WHERE tenant_id = ? ORDER BY agent_id ASC";
    const params: any[] = [tenantId];
    if (limit && limit > 0) {
      query += " LIMIT ?";
      params.push(limit);
      if (offset && offset > 0) {
        query += " OFFSET ?";
        params.push(offset);
      }
    }
    const rows = (this.db.prepare(query).all(...params) as unknown) as AgentProfileRow[];
    return rows.map((r) => this.mapRowToProfile(r));
  }

  async discover(criteria: AgentDiscoveryCriteria): Promise<readonly AgentProfile[]> {

    let query = "SELECT * FROM agent_profiles WHERE tenant_id = ?";
    const params: any[] = [criteria.tenantId];

    if (criteria.organizationId) {
      query += " AND organization_id = ?";
      params.push(criteria.organizationId);
    }
    if (criteria.teamId) {
      query += " AND team_id = ?";
      params.push(criteria.teamId);
    }
    if (criteria.role) {
      query += " AND role = ?";
      params.push(criteria.role);
    }
    if (criteria.status) {
      query += " AND status = ?";
      params.push(criteria.status);
    }

    query += " ORDER BY agent_id ASC";
    const rows = (this.db.prepare(query).all(...params) as unknown) as AgentProfileRow[];
    let profiles = rows.map((r) => this.mapRowToProfile(r));

    // Post-filter JSON columns in memory for full determinism
    if (criteria.responsibility) {
      const targetResp = criteria.responsibility.trim().toUpperCase();
      profiles = profiles.filter((p) => p.hasResponsibility(targetResp));
    }
    if (criteria.capabilityId) {
      const capId = criteria.capabilityId.trim().toLowerCase();
      profiles = profiles.filter((p) => {
        const cap = p.capabilities.find((c) => c.id === capId);
        if (!cap || cap.status === "DISABLED") return false;
        if (criteria.capabilityStatus && cap.status !== criteria.capabilityStatus) return false;
        return true;
      });
    }

    const start = criteria.offset && criteria.offset > 0 ? criteria.offset : 0;
    const end = criteria.limit && criteria.limit > 0 ? start + criteria.limit : undefined;
    return profiles.slice(start, end);
  }

  async delete(agentId: string, tenantId?: string): Promise<boolean> {

    let query = "DELETE FROM agent_profiles WHERE agent_id = ?";
    const params: any[] = [agentId];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const result = this.db.prepare(query).run(...params);
    return result.changes > 0;
  }
}
