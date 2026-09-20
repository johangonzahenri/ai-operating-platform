/**
 * AI Operating Platform - SQLite Portfolio Repositories
 * 
 * Durable, transactional, and relational storage for EnterprisePortfolio,
 * EnterpriseGovernanceMandate, and PortfolioObjective aggregates using native node:sqlite.
 */

import { DatabaseSync } from "node:sqlite";
import { EnterprisePortfolio, EnterprisePortfolioMembership } from "../../../domain/portfolio/enterprise-portfolio.js";
import { EnterpriseGovernanceMandate, MandateAuthorityScope, MandateStatus } from "../../../domain/portfolio/governance-mandate.js";
import {
  PortfolioObjective,
  PortfolioObjectiveType,
  PortfolioObjectiveLifecycleState,
  MetricAggregationMethod,
  MissingDataHandling,
} from "../../../domain/portfolio/portfolio-objective.js";
import {
  EnterprisePortfolioRepositoryPort,
  GovernanceMandateRepositoryPort,
  PortfolioObjectiveRepositoryPort,
} from "../../../application/ports/portfolio-repository-port.js";
import { SqliteDatabase } from "./sqlite-database.js";
import { PortfolioConcurrencyConflictError } from "../../../domain/portfolio/portfolio-errors.js";

export class SqliteEnterprisePortfolioRepository implements EnterprisePortfolioRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enterprise_portfolios (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        memberships_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON enterprise_portfolios(tenant_id);
    `);
  }

  async save(portfolio: EnterprisePortfolio): Promise<void> {
    const existing = await this.findById(portfolio.id, portfolio.tenantId);
    if (existing && existing.concurrencyVersion !== portfolio.concurrencyVersion - 1 && existing.concurrencyVersion !== portfolio.concurrencyVersion) {
      if (portfolio.concurrencyVersion <= existing.concurrencyVersion && existing.version !== portfolio.version) {
        throw new PortfolioConcurrencyConflictError(
          portfolio.id,
          existing.concurrencyVersion,
          portfolio.concurrencyVersion
        );
      }
    }

    const membershipsJson = JSON.stringify(
      portfolio.memberships.map((m) => ({
        enterpriseId: m.enterpriseId,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
        effectiveTo: m.effectiveTo ? m.effectiveTo.toISOString() : undefined,
        governanceScope: m.governanceScope,
      }))
    );

    const stmt = this.db.prepare(`
      INSERT INTO enterprise_portfolios (
        id, tenant_id, name, description, owner_principal_id, status,
        memberships_json, version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        owner_principal_id = excluded.owner_principal_id,
        status = excluded.status,
        memberships_json = excluded.memberships_json,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      portfolio.id,
      portfolio.tenantId,
      portfolio.name,
      portfolio.description,
      portfolio.ownerPrincipalId,
      portfolio.status,
      membershipsJson,
      portfolio.version,
      portfolio.concurrencyVersion,
      portfolio.createdAt.toISOString(),
      portfolio.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<EnterprisePortfolio | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM enterprise_portfolios
      WHERE id = ? AND tenant_id = ?;
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  async findAll(tenantId: string): Promise<readonly EnterprisePortfolio[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM enterprise_portfolios
      WHERE tenant_id = ?
      ORDER BY created_at ASC;
    `);
    const rows = stmt.all(tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  async findByEnterpriseId(enterpriseId: string, tenantId: string): Promise<readonly EnterprisePortfolio[]> {
    const all = await this.findAll(tenantId);
    return Object.freeze(all.filter((p) => p.hasEnterprise(enterpriseId)));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM enterprise_portfolios
      WHERE id = ? AND tenant_id = ?;
    `);
    const info = stmt.run(id, tenantId);
    return (info.changes ?? 0) > 0;
  }

  private mapRow(row: any): EnterprisePortfolio {
    let memberships: EnterprisePortfolioMembership[] = [];
    try {
      const parsed = JSON.parse(row.memberships_json);
      if (Array.isArray(parsed)) {
        memberships = parsed.map((m: any) => ({
          enterpriseId: m.enterpriseId,
          status: m.status,
          joinedAt: new Date(m.joinedAt),
          effectiveTo: m.effectiveTo ? new Date(m.effectiveTo) : undefined,
          governanceScope: Object.freeze(Array.isArray(m.governanceScope) ? m.governanceScope : []),
        }));
      }
    } catch {
      memberships = [];
    }

    return EnterprisePortfolio.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      ownerPrincipalId: row.owner_principal_id,
      status: row.status,
      memberships,
      version: row.version,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteGovernanceMandateRepository implements GovernanceMandateRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS governance_mandates (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        source_enterprise_id TEXT NOT NULL,
        target_enterprise_ids_json TEXT NOT NULL,
        grantee_principal_id TEXT NOT NULL,
        authority_scope TEXT NOT NULL,
        allowed_operations_json TEXT NOT NULL,
        allowed_objectives_json TEXT NOT NULL,
        autonomy_limit TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        status TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        revocation_reason TEXT,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mandates_portfolio ON governance_mandates(portfolio_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_mandates_grantee ON governance_mandates(grantee_principal_id, tenant_id);
    `);
  }

  async save(mandate: EnterpriseGovernanceMandate): Promise<void> {
    const existing = await this.findById(mandate.id, mandate.tenantId);
    if (existing && existing.concurrencyVersion !== mandate.concurrencyVersion - 1 && existing.concurrencyVersion !== mandate.concurrencyVersion) {
      if (mandate.concurrencyVersion <= existing.concurrencyVersion && existing.version !== mandate.version) {
        throw new PortfolioConcurrencyConflictError(
          mandate.id,
          existing.concurrencyVersion,
          mandate.concurrencyVersion
        );
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO governance_mandates (
        id, tenant_id, portfolio_id, source_enterprise_id, target_enterprise_ids_json,
        grantee_principal_id, authority_scope, allowed_operations_json, allowed_objectives_json,
        autonomy_limit, requires_approval, status, valid_from, valid_to, revocation_reason,
        version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        target_enterprise_ids_json = excluded.target_enterprise_ids_json,
        authority_scope = excluded.authority_scope,
        allowed_operations_json = excluded.allowed_operations_json,
        allowed_objectives_json = excluded.allowed_objectives_json,
        autonomy_limit = excluded.autonomy_limit,
        requires_approval = excluded.requires_approval,
        status = excluded.status,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        revocation_reason = excluded.revocation_reason,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      mandate.id,
      mandate.tenantId,
      mandate.portfolioId,
      mandate.sourceEnterpriseId,
      JSON.stringify(mandate.targetEnterpriseIds),
      mandate.granteePrincipalId,
      mandate.authorityScope,
      JSON.stringify(mandate.allowedOperations),
      JSON.stringify(mandate.allowedObjectives),
      mandate.autonomyLimit,
      mandate.requiresApproval ? 1 : 0,
      mandate.status,
      mandate.validFrom.toISOString(),
      mandate.validTo ? mandate.validTo.toISOString() : null,
      mandate.revocationReason ?? null,
      mandate.version,
      mandate.concurrencyVersion,
      mandate.createdAt.toISOString(),
      mandate.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<EnterpriseGovernanceMandate | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM governance_mandates
      WHERE id = ? AND tenant_id = ?;
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly EnterpriseGovernanceMandate[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM governance_mandates
      WHERE portfolio_id = ? AND tenant_id = ?
      ORDER BY created_at DESC;
    `);
    const rows = stmt.all(portfolioId, tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  async findActiveMandates(
    granteePrincipalId: string,
    portfolioId: string,
    tenantId: string,
    targetEnterpriseId?: string
  ): Promise<readonly EnterpriseGovernanceMandate[]> {
    const mandates = await this.findByPortfolioId(portfolioId, tenantId);
    const now = new Date();
    return Object.freeze(
      mandates.filter((m) => {
        if (m.granteePrincipalId !== granteePrincipalId || !m.isEffectiveAt(now)) {
          return false;
        }
        if (targetEnterpriseId && !m.targetEnterpriseIds.includes(targetEnterpriseId) && !m.targetEnterpriseIds.includes("*")) {
          return false;
        }
        return true;
      })
    );
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM governance_mandates
      WHERE id = ? AND tenant_id = ?;
    `);
    const info = stmt.run(id, tenantId);
    return (info.changes ?? 0) > 0;
  }

  private mapRow(row: any): EnterpriseGovernanceMandate {
    let targetEnterpriseIds: string[] = [];
    let allowedOperations: string[] = [];
    let allowedObjectives: string[] = [];

    try { targetEnterpriseIds = JSON.parse(row.target_enterprise_ids_json); } catch { targetEnterpriseIds = []; }
    try { allowedOperations = JSON.parse(row.allowed_operations_json); } catch { allowedOperations = []; }
    try { allowedObjectives = JSON.parse(row.allowed_objectives_json); } catch { allowedObjectives = []; }

    return EnterpriseGovernanceMandate.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      portfolioId: row.portfolio_id,
      sourceEnterpriseId: row.source_enterprise_id,
      targetEnterpriseIds,
      granteePrincipalId: row.grantee_principal_id,
      authorityScope: row.authority_scope as MandateAuthorityScope,
      allowedOperations,
      allowedObjectives,
      autonomyLimit: row.autonomy_limit,
      requiresApproval: row.requires_approval === 1,
      status: row.status as MandateStatus,
      validFrom: new Date(row.valid_from),
      validTo: row.valid_to ? new Date(row.valid_to) : undefined,
      revocationReason: row.revocation_reason ?? undefined,
      version: row.version,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqlitePortfolioObjectiveRepository implements PortfolioObjectiveRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_objectives (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        type TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        target_metric_json TEXT,
        participating_enterprise_ids_json TEXT NOT NULL,
        linked_enterprise_objective_ids_json TEXT NOT NULL,
        aggregation_method TEXT NOT NULL,
        missing_data_handling TEXT NOT NULL,
        current_aggregated_value REAL,
        gap REAL,
        last_aggregated_at TEXT,
        aggregation_status TEXT,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_port_obj_portfolio ON portfolio_objectives(portfolio_id, tenant_id);
    `);
  }

  async save(objective: PortfolioObjective): Promise<void> {
    const existing = await this.findById(objective.id, objective.tenantId);
    if (existing && existing.concurrencyVersion !== objective.concurrencyVersion - 1 && existing.concurrencyVersion !== objective.concurrencyVersion) {
      if (objective.concurrencyVersion <= existing.concurrencyVersion && existing.version !== objective.version) {
        throw new PortfolioConcurrencyConflictError(
          objective.id,
          existing.concurrencyVersion,
          objective.concurrencyVersion
        );
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO portfolio_objectives (
        id, tenant_id, portfolio_id, title, description, owner_principal_id,
        type, lifecycle_state, target_metric_json, participating_enterprise_ids_json,
        linked_enterprise_objective_ids_json, aggregation_method, missing_data_handling,
        current_aggregated_value, gap, last_aggregated_at, aggregation_status,
        version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        lifecycle_state = excluded.lifecycle_state,
        target_metric_json = excluded.target_metric_json,
        participating_enterprise_ids_json = excluded.participating_enterprise_ids_json,
        linked_enterprise_objective_ids_json = excluded.linked_enterprise_objective_ids_json,
        aggregation_method = excluded.aggregation_method,
        missing_data_handling = excluded.missing_data_handling,
        current_aggregated_value = excluded.current_aggregated_value,
        gap = excluded.gap,
        last_aggregated_at = excluded.last_aggregated_at,
        aggregation_status = excluded.aggregation_status,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      objective.id,
      objective.tenantId,
      objective.portfolioId,
      objective.title,
      objective.description,
      objective.ownerPrincipalId,
      objective.type,
      objective.lifecycleState,
      objective.targetMetric ? JSON.stringify(objective.targetMetric) : null,
      JSON.stringify(objective.participatingEnterpriseIds),
      JSON.stringify(objective.linkedEnterpriseObjectiveIds),
      objective.aggregationMethod,
      objective.missingDataHandling,
      objective.currentAggregatedValue ?? null,
      objective.gap ?? null,
      objective.lastAggregatedAt ? objective.lastAggregatedAt.toISOString() : null,
      objective.aggregationStatus ?? null,
      objective.version,
      objective.concurrencyVersion,
      objective.createdAt.toISOString(),
      objective.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<PortfolioObjective | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM portfolio_objectives
      WHERE id = ? AND tenant_id = ?;
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly PortfolioObjective[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM portfolio_objectives
      WHERE portfolio_id = ? AND tenant_id = ?
      ORDER BY created_at ASC;
    `);
    const rows = stmt.all(portfolioId, tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM portfolio_objectives
      WHERE id = ? AND tenant_id = ?;
    `);
    const info = stmt.run(id, tenantId);
    return (info.changes ?? 0) > 0;
  }

  private mapRow(row: any): PortfolioObjective {
    let targetMetric: any = undefined;
    let participatingEnterpriseIds: string[] = [];
    let linkedEnterpriseObjectiveIds: string[] = [];

    if (row.target_metric_json) {
      try { targetMetric = JSON.parse(row.target_metric_json); } catch { targetMetric = undefined; }
    }
    try { participatingEnterpriseIds = JSON.parse(row.participating_enterprise_ids_json); } catch { participatingEnterpriseIds = []; }
    try { linkedEnterpriseObjectiveIds = JSON.parse(row.linked_enterprise_objective_ids_json); } catch { linkedEnterpriseObjectiveIds = []; }

    return PortfolioObjective.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      portfolioId: row.portfolio_id,
      title: row.title,
      description: row.description,
      ownerPrincipalId: row.owner_principal_id,
      type: row.type as PortfolioObjectiveType,
      lifecycleState: row.lifecycle_state as PortfolioObjectiveLifecycleState,
      targetMetric,
      participatingEnterpriseIds,
      linkedEnterpriseObjectiveIds,
      aggregationMethod: row.aggregation_method as MetricAggregationMethod,
      missingDataHandling: row.missing_data_handling as MissingDataHandling,
      currentAggregatedValue: row.current_aggregated_value !== null ? row.current_aggregated_value : undefined,
      gap: row.gap !== null ? row.gap : undefined,
      lastAggregatedAt: row.last_aggregated_at ? new Date(row.last_aggregated_at) : undefined,
      aggregationStatus: row.aggregation_status ?? undefined,
      version: row.version,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
