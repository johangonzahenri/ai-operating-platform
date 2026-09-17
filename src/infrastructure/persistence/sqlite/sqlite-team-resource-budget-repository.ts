import { DatabaseSync, StatementSync } from "node:sqlite";
import {
  TeamResourceBudgetRepositoryPort,
  AtomicConsumptionResult,
} from "../../../application/ports/team-resource-budget-repository-port.js";
import {
  TeamResourceBudget,
  BudgetLimits,
  BudgetConsumed,
  BudgetStatus,
  BudgetWindow,
  ResourceConsumptionRequest,
} from "../../../domain/organization/team-resource-budget.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { SqlitePersistenceError } from "./sqlite-errors.js";

interface TeamResourceBudgetRow {
  id: string;
  team_id: string;
  organization_id: string;
  tenant_id: string;
  limits_json: string;
  consumed_json: string;
  status: BudgetStatus;
  window: BudgetWindow;
  version: number;
  created_at: string;
  updated_at: string;
}

export class SqliteTeamResourceBudgetRepository implements TeamResourceBudgetRepositoryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly selectByIdStmt: StatementSync;
  private readonly selectByTeamAndTenantStmt: StatementSync;
  private readonly selectByOrgAndTenantStmt: StatementSync;
  private readonly upsertBudgetStmt: StatementSync;
  private readonly updateConsumedStmt: StatementSync;
  private readonly deleteBudgetStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteDatabaseOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb);
    }
    this.db = this.dbManager.open();

    this.initSchema();

    this.selectByIdStmt = this.db.prepare(
      "SELECT * FROM team_resource_budgets WHERE id = ? AND tenant_id = ?;"
    );
    this.selectByTeamAndTenantStmt = this.db.prepare(
      "SELECT * FROM team_resource_budgets WHERE team_id = ? AND tenant_id = ?;"
    );
    this.selectByOrgAndTenantStmt = this.db.prepare(
      "SELECT * FROM team_resource_budgets WHERE organization_id = ? AND tenant_id = ? ORDER BY created_at ASC;"
    );
    this.upsertBudgetStmt = this.db.prepare(`
      INSERT INTO team_resource_budgets (
        id, team_id, organization_id, tenant_id, limits_json, consumed_json, status, window, version, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, tenant_id) DO UPDATE SET
        limits_json = excluded.limits_json,
        consumed_json = excluded.consumed_json,
        status = excluded.status,
        window = excluded.window,
        version = excluded.version,
        updated_at = excluded.updated_at;
    `);
    this.updateConsumedStmt = this.db.prepare(`
      UPDATE team_resource_budgets
      SET consumed_json = ?, status = ?, version = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND version = ?;
    `);
    this.deleteBudgetStmt = this.db.prepare(
      "DELETE FROM team_resource_budgets WHERE team_id = ? AND tenant_id = ?;"
    );
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS team_resource_budgets (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        limits_json TEXT NOT NULL,
        consumed_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'SUSPENDED')),
        window TEXT NOT NULL CHECK (window IN ('LIFETIME', 'DAILY', 'MONTHLY')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (team_id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_team_budgets_team_tenant ON team_resource_budgets(team_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_team_budgets_org ON team_resource_budgets(organization_id);
      CREATE INDEX IF NOT EXISTS idx_team_budgets_tenant ON team_resource_budgets(tenant_id);
    `);
  }

  private rowToBudget(row: TeamResourceBudgetRow): TeamResourceBudget {
    return TeamResourceBudget.rehydrate({
      id: row.id,
      teamId: row.team_id,
      organizationId: row.organization_id,
      tenantId: row.tenant_id,
      limits: JSON.parse(row.limits_json) as BudgetLimits,
      consumed: JSON.parse(row.consumed_json) as BudgetConsumed,
      status: row.status,
      window: row.window,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async save(budget: TeamResourceBudget): Promise<TeamResourceBudget> {
    try {
      this.upsertBudgetStmt.run(
        budget.id,
        budget.teamId,
        budget.organizationId,
        budget.tenantId,
        JSON.stringify(budget.limits),
        JSON.stringify(budget.consumed),
        budget.status,
        budget.window,
        budget.version,
        budget.createdAt.toISOString(),
        budget.updatedAt.toISOString()
      );
      return budget;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to save team resource budget '${budget.id}'`, error);
    }
  }

  async findById(budgetId: string, tenantId: string): Promise<TeamResourceBudget | undefined> {
    try {
      const row = this.selectByIdStmt.get(budgetId, tenantId) as TeamResourceBudgetRow | undefined;
      if (!row) return undefined;
      return this.rowToBudget(row);
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find team resource budget '${budgetId}'`, error);
    }
  }

  async findByTeamId(teamId: string, tenantId: string): Promise<TeamResourceBudget | undefined> {
    try {
      const row = this.selectByTeamAndTenantStmt.get(teamId, tenantId) as TeamResourceBudgetRow | undefined;
      if (!row) return undefined;
      return this.rowToBudget(row);
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find budget for team '${teamId}'`, error);
    }
  }

  async findByOrganizationId(organizationId: string, tenantId: string): Promise<readonly TeamResourceBudget[]> {
    try {
      const rows = this.selectByOrgAndTenantStmt.all(organizationId, tenantId) as unknown as TeamResourceBudgetRow[];
      return rows.map((row) => this.rowToBudget(row));
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to find budgets for organization '${organizationId}'`, error);
    }
  }

  async consumeAtomic(
    teamId: string,
    tenantId: string,
    request: ResourceConsumptionRequest,
    expectedVersion?: number
  ): Promise<AtomicConsumptionResult> {
    try {
      return this.dbManager.transaction(() => {
        const row = this.selectByTeamAndTenantStmt.get(teamId, tenantId) as TeamResourceBudgetRow | undefined;
        if (!row) {
          return {
            success: false,
            reason: `Budget for team '${teamId}' not found`,
          };
        }

        const budget = this.rowToBudget(row);

        if (expectedVersion !== undefined && budget.version !== expectedVersion) {
          return {
            success: false,
            reason: `Optimistic concurrency conflict: expected version ${expectedVersion}, got ${budget.version}`,
          };
        }

        const check = budget.canConsume(request);
        if (!check.allowed) {
          return {
            success: false,
            reason: check.reason,
          };
        }

        const updated = budget.consume(request);

        const result = this.updateConsumedStmt.run(
          JSON.stringify(updated.consumed),
          updated.status,
          updated.version,
          updated.updatedAt.toISOString(),
          budget.id,
          budget.tenantId,
          budget.version
        );

        if ((result.changes ?? 0) !== 1) {
          return {
            success: false,
            reason: `Optimistic concurrency conflict while updating budget '${budget.id}'`,
          };
        }

        return {
          success: true,
          budget: updated,
        };
      });
    } catch (error) {
      throw new SqlitePersistenceError(`Atomic consumption failed for team '${teamId}'`, error);
    }
  }

  async deleteBudget(teamId: string, tenantId: string): Promise<boolean> {
    try {
      const result = this.deleteBudgetStmt.run(teamId, tenantId);
      return (result.changes ?? 0) > 0;
    } catch (error) {
      throw new SqlitePersistenceError(`Failed to delete budget for team '${teamId}'`, error);
    }
  }
}
