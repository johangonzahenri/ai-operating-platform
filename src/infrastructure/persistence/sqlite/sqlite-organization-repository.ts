import { DatabaseSync, StatementSync } from "node:sqlite";
import { OrganizationHierarchyRepository } from "../../../application/ports/organization-repository-port.js";
import { Organization, OrganizationStatus } from "../../../domain/organization/organization.js";
import { Area, AreaStatus } from "../../../domain/organization/area.js";
import { Team, TeamStatus } from "../../../domain/organization/team.js";
import { AgentMembership, MembershipRole, MembershipStatus } from "../../../domain/organization/agent-membership.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { SqlitePersistenceError } from "./sqlite-errors.js";

interface OrganizationRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: OrganizationStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AreaRow {
  id: string;
  organization_id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: AreaStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

interface TeamRow {
  id: string;
  area_id: string;
  organization_id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: TeamStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AgentMembershipRow {
  id: string;
  team_id: string;
  agent_id: string;
  organization_id: string;
  tenant_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  joined_at: string;
  updated_at: string;
}

export class SqliteOrganizationRepository implements OrganizationHierarchyRepository {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectOrgByIdStmt: StatementSync;
  private readonly selectOrgsByTenantStmt: StatementSync;
  private readonly upsertOrgStmt: StatementSync;

  private readonly selectAreaByIdStmt: StatementSync;
  private readonly selectAreasByOrgStmt: StatementSync;
  private readonly selectAreasByTenantStmt: StatementSync;
  private readonly upsertAreaStmt: StatementSync;

  private readonly selectTeamByIdStmt: StatementSync;
  private readonly selectTeamsByAreaStmt: StatementSync;
  private readonly selectTeamsByOrgStmt: StatementSync;
  private readonly upsertTeamStmt: StatementSync;

  private readonly selectMembershipByIdStmt: StatementSync;
  private readonly selectMembershipByTeamAndAgentStmt: StatementSync;
  private readonly selectMembershipsByTeamStmt: StatementSync;
  private readonly selectMembershipsByAgentStmt: StatementSync;
  private readonly upsertMembershipStmt: StatementSync;
  private readonly deleteMembershipStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb);
    }
    this.db = this.dbManager.open();

    this.initSchema();

    // Organizations
    this.selectOrgByIdStmt = this.db.prepare("SELECT * FROM organizations WHERE id = ?;");
    this.selectOrgsByTenantStmt = this.db.prepare("SELECT * FROM organizations WHERE tenant_id = ? ORDER BY created_at ASC;");
    this.upsertOrgStmt = this.db.prepare(`
      INSERT INTO organizations (id, tenant_id, name, description, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        version = excluded.version,
        updated_at = excluded.updated_at;
    `);

    // Areas
    this.selectAreaByIdStmt = this.db.prepare("SELECT * FROM areas WHERE id = ?;");
    this.selectAreasByOrgStmt = this.db.prepare("SELECT * FROM areas WHERE organization_id = ? ORDER BY created_at ASC;");
    this.selectAreasByTenantStmt = this.db.prepare("SELECT * FROM areas WHERE tenant_id = ? ORDER BY created_at ASC;");
    this.upsertAreaStmt = this.db.prepare(`
      INSERT INTO areas (id, organization_id, tenant_id, name, description, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        organization_id = excluded.organization_id,
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        version = excluded.version,
        updated_at = excluded.updated_at;
    `);

    // Teams
    this.selectTeamByIdStmt = this.db.prepare("SELECT * FROM teams WHERE id = ?;");
    this.selectTeamsByAreaStmt = this.db.prepare("SELECT * FROM teams WHERE area_id = ? ORDER BY created_at ASC;");
    this.selectTeamsByOrgStmt = this.db.prepare("SELECT * FROM teams WHERE organization_id = ? ORDER BY created_at ASC;");
    this.upsertTeamStmt = this.db.prepare(`
      INSERT INTO teams (id, area_id, organization_id, tenant_id, name, description, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        area_id = excluded.area_id,
        organization_id = excluded.organization_id,
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        version = excluded.version,
        updated_at = excluded.updated_at;
    `);

    // Memberships
    this.selectMembershipByIdStmt = this.db.prepare("SELECT * FROM agent_memberships WHERE id = ?;");
    this.selectMembershipByTeamAndAgentStmt = this.db.prepare("SELECT * FROM agent_memberships WHERE team_id = ? AND agent_id = ?;");
    this.selectMembershipsByTeamStmt = this.db.prepare("SELECT * FROM agent_memberships WHERE team_id = ? ORDER BY joined_at ASC;");
    this.selectMembershipsByAgentStmt = this.db.prepare("SELECT * FROM agent_memberships WHERE agent_id = ? ORDER BY joined_at ASC;");
    this.upsertMembershipStmt = this.db.prepare(`
      INSERT INTO agent_memberships (id, team_id, agent_id, organization_id, tenant_id, role, status, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, agent_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        tenant_id = excluded.tenant_id,
        role = excluded.role,
        status = excluded.status,
        updated_at = excluded.updated_at;
    `);
    this.deleteMembershipStmt = this.db.prepare("DELETE FROM agent_memberships WHERE team_id = ? AND agent_id = ?;");
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_organizations_tenant_id ON organizations(tenant_id);

      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_areas_organization_id ON areas(organization_id);
      CREATE INDEX IF NOT EXISTS idx_areas_tenant_id ON areas(tenant_id);

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        area_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (area_id) REFERENCES areas(id)
      );
      CREATE INDEX IF NOT EXISTS idx_teams_area_id ON teams(area_id);
      CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);
      CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id);

      CREATE TABLE IF NOT EXISTS agent_memberships (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('LEAD', 'SPECIALIST', 'OPERATOR', 'REVIEWER')),
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (team_id, agent_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_agent_memberships_team_id ON agent_memberships(team_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memberships_agent_id ON agent_memberships(agent_id);
    `);
  }

  // --- OrganizationRepositoryPort ---

  async saveOrganization(org: Organization): Promise<Organization> {
    try {
      this.upsertOrgStmt.run(
        org.id,
        org.tenantId,
        org.name,
        org.description,
        org.status,
        org.version,
        org.createdAt.toISOString(),
        org.updatedAt.toISOString()
      );
      return org;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to save organization '${org.id}'`, error);
    }
  }

  async findOrganizationById(id: string): Promise<Organization | undefined> {
    try {
      const row = this.selectOrgByIdStmt.get(id) as OrganizationRow | undefined;
      if (!row) return undefined;
      return Organization.rehydrate({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        status: row.status,
        version: row.version,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find organization '${id}'`, error);
    }
  }

  async findOrganizationsByTenantId(tenantId: string): Promise<readonly Organization[]> {
    try {
      const rows = this.selectOrgsByTenantStmt.all(tenantId) as unknown as OrganizationRow[];
      return rows.map((row) =>
        Organization.rehydrate({
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find organizations for tenant '${tenantId}'`, error);
    }
  }

  // --- AreaRepositoryPort ---

  async saveArea(area: Area): Promise<Area> {
    try {
      this.upsertAreaStmt.run(
        area.id,
        area.organizationId,
        area.tenantId,
        area.name,
        area.description,
        area.status,
        area.version,
        area.createdAt.toISOString(),
        area.updatedAt.toISOString()
      );
      return area;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to save area '${area.id}'`, error);
    }
  }

  async findAreaById(id: string): Promise<Area | undefined> {
    try {
      const row = this.selectAreaByIdStmt.get(id) as AreaRow | undefined;
      if (!row) return undefined;
      return Area.rehydrate({
        id: row.id,
        organizationId: row.organization_id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        status: row.status,
        version: row.version,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find area '${id}'`, error);
    }
  }

  async findAreasByOrganizationId(organizationId: string): Promise<readonly Area[]> {
    try {
      const rows = this.selectAreasByOrgStmt.all(organizationId) as unknown as AreaRow[];
      return rows.map((row) =>
        Area.rehydrate({
          id: row.id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find areas for organization '${organizationId}'`, error);
    }
  }

  async findAreasByTenantId(tenantId: string): Promise<readonly Area[]> {
    try {
      const rows = this.selectAreasByTenantStmt.all(tenantId) as unknown as AreaRow[];
      return rows.map((row) =>
        Area.rehydrate({
          id: row.id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find areas for tenant '${tenantId}'`, error);
    }
  }

  // --- TeamRepositoryPort ---

  async saveTeam(team: Team): Promise<Team> {
    try {
      this.upsertTeamStmt.run(
        team.id,
        team.areaId,
        team.organizationId,
        team.tenantId,
        team.name,
        team.description,
        team.status,
        team.version,
        team.createdAt.toISOString(),
        team.updatedAt.toISOString()
      );
      return team;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to save team '${team.id}'`, error);
    }
  }

  async findTeamById(id: string): Promise<Team | undefined> {
    try {
      const row = this.selectTeamByIdStmt.get(id) as TeamRow | undefined;
      if (!row) return undefined;
      return Team.rehydrate({
        id: row.id,
        areaId: row.area_id,
        organizationId: row.organization_id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        status: row.status,
        version: row.version,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find team '${id}'`, error);
    }
  }

  async findTeamsByAreaId(areaId: string): Promise<readonly Team[]> {
    try {
      const rows = this.selectTeamsByAreaStmt.all(areaId) as unknown as TeamRow[];
      return rows.map((row) =>
        Team.rehydrate({
          id: row.id,
          areaId: row.area_id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find teams for area '${areaId}'`, error);
    }
  }

  async findTeamsByOrganizationId(organizationId: string): Promise<readonly Team[]> {
    try {
      const rows = this.selectTeamsByOrgStmt.all(organizationId) as unknown as TeamRow[];
      return rows.map((row) =>
        Team.rehydrate({
          id: row.id,
          areaId: row.area_id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find teams for organization '${organizationId}'`, error);
    }
  }

  // --- AgentMembershipRepositoryPort ---

  async saveMembership(membership: AgentMembership): Promise<AgentMembership> {
    try {
      this.upsertMembershipStmt.run(
        membership.id,
        membership.teamId,
        membership.agentId,
        membership.organizationId,
        membership.tenantId,
        membership.role,
        membership.status,
        membership.joinedAt.toISOString(),
        membership.updatedAt.toISOString()
      );
      return membership;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to save agent membership '${membership.id}'`, error);
    }
  }

  async findMembershipById(id: string): Promise<AgentMembership | undefined> {
    try {
      const row = this.selectMembershipByIdStmt.get(id) as AgentMembershipRow | undefined;
      if (!row) return undefined;
      return AgentMembership.rehydrate({
        id: row.id,
        teamId: row.team_id,
        agentId: row.agent_id,
        organizationId: row.organization_id,
        tenantId: row.tenant_id,
        role: row.role,
        status: row.status,
        joinedAt: new Date(row.joined_at),
        updatedAt: new Date(row.updated_at),
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find membership '${id}'`, error);
    }
  }

  async findMembershipByTeamAndAgent(teamId: string, agentId: string): Promise<AgentMembership | undefined> {
    try {
      const row = this.selectMembershipByTeamAndAgentStmt.get(teamId, agentId) as AgentMembershipRow | undefined;
      if (!row) return undefined;
      return AgentMembership.rehydrate({
        id: row.id,
        teamId: row.team_id,
        agentId: row.agent_id,
        organizationId: row.organization_id,
        tenantId: row.tenant_id,
        role: row.role,
        status: row.status,
        joinedAt: new Date(row.joined_at),
        updatedAt: new Date(row.updated_at),
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find membership for team '${teamId}' and agent '${agentId}'`, error);
    }
  }

  async findMembershipsByTeamId(teamId: string): Promise<readonly AgentMembership[]> {
    try {
      const rows = this.selectMembershipsByTeamStmt.all(teamId) as unknown as AgentMembershipRow[];
      return rows.map((row) =>
        AgentMembership.rehydrate({
          id: row.id,
          teamId: row.team_id,
          agentId: row.agent_id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          role: row.role,
          status: row.status,
          joinedAt: new Date(row.joined_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find memberships for team '${teamId}'`, error);
    }
  }

  async findMembershipsByAgentId(agentId: string): Promise<readonly AgentMembership[]> {
    try {
      const rows = this.selectMembershipsByAgentStmt.all(agentId) as unknown as AgentMembershipRow[];
      return rows.map((row) =>
        AgentMembership.rehydrate({
          id: row.id,
          teamId: row.team_id,
          agentId: row.agent_id,
          organizationId: row.organization_id,
          tenantId: row.tenant_id,
          role: row.role,
          status: row.status,
          joinedAt: new Date(row.joined_at),
          updatedAt: new Date(row.updated_at),
        })
      );
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find memberships for agent '${agentId}'`, error);
    }
  }

  async deleteMembership(teamId: string, agentId: string): Promise<boolean> {
    try {
      const result = this.deleteMembershipStmt.run(teamId, agentId);
      return (result.changes ?? 0) > 0;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to delete membership for team '${teamId}' and agent '${agentId}'`, error);
    }
  }
}
