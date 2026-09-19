/**
 * AI Operating Platform - SQLite Business Repositories
 * 
 * Persistent storage for Enterprise, BusinessObjective, BusinessInitiative,
 * BusinessMetric, and ExecutiveDecisionRecord aggregates using node:sqlite DatabaseSync.
 */

import { DatabaseSync } from "node:sqlite";
import { Enterprise } from "../../../domain/business/enterprise.js";
import { BusinessObjective } from "../../../domain/business/business-objective.js";
import { BusinessInitiative } from "../../../domain/business/business-initiative.js";
import { BusinessMetric } from "../../../domain/business/business-metric.js";
import { ExecutiveDecisionRecord } from "../../../domain/business/executive-decision-record.js";
import {
  EnterpriseRepositoryPort,
  BusinessObjectiveRepositoryPort,
  BusinessInitiativeRepositoryPort,
  BusinessMetricRepositoryPort,
  ExecutiveDecisionRepositoryPort,
} from "../../../application/ports/business-repository-port.js";
import { SqliteDatabase } from "./sqlite-database.js";
import { BusinessConcurrencyConflictError } from "../../../domain/business/business-errors.js";

export class SqliteEnterpriseRepository implements EnterpriseRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enterprises (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        industry TEXT NOT NULL,
        status TEXT NOT NULL,
        vision TEXT,
        strategic_mission TEXT,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ent_tenant ON enterprises(tenant_id);
    `);
  }

  async save(enterprise: Enterprise): Promise<void> {
    const existing = await this.findById(enterprise.id, enterprise.tenantId);
    if (existing && existing.concurrencyVersion !== enterprise.concurrencyVersion - 1 && existing.concurrencyVersion !== enterprise.concurrencyVersion) {
      if (enterprise.concurrencyVersion <= existing.concurrencyVersion && existing.version !== enterprise.version) {
        throw new BusinessConcurrencyConflictError(
          enterprise.id,
          existing.concurrencyVersion,
          enterprise.concurrencyVersion
        );
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO enterprises (
        id, tenant_id, name, description, industry, status, vision, strategic_mission,
        version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        industry = excluded.industry,
        status = excluded.status,
        vision = excluded.vision,
        strategic_mission = excluded.strategic_mission,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      enterprise.id,
      enterprise.tenantId,
      enterprise.name,
      enterprise.description,
      enterprise.industry,
      enterprise.status,
      enterprise.vision ?? null,
      enterprise.strategicMission ?? null,
      enterprise.version,
      enterprise.concurrencyVersion,
      enterprise.createdAt.toISOString(),
      enterprise.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<Enterprise | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM enterprises WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapToEnterprise(row);
  }

  async listByTenant(tenantId: string): Promise<readonly Enterprise[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM enterprises WHERE tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(tenantId) as any[];
    return rows.map((r) => this.mapToEnterprise(r));
  }

  private mapToEnterprise(row: any): Enterprise {
    return Enterprise.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      industry: row.industry,
      status: row.status,
      vision: row.vision ?? undefined,
      strategicMission: row.strategic_mission ?? undefined,
      version: Number(row.version),
      concurrencyVersion: Number(row.concurrency_version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteBusinessObjectiveRepository implements BusinessObjectiveRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS business_objectives (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        organization_id TEXT,
        area_id TEXT,
        team_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        type TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        target_metric_json TEXT,
        start_date TEXT,
        target_date TEXT,
        achieved_at TEXT,
        linked_initiatives_json TEXT NOT NULL,
        linked_solutions_json TEXT NOT NULL,
        linked_workflows_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_obj_tenant_ent ON business_objectives(tenant_id, enterprise_id);
    `);
  }

  async save(objective: BusinessObjective): Promise<void> {
    const existing = await this.findById(objective.id, objective.tenantId);
    if (existing && objective.concurrencyVersion <= existing.concurrencyVersion) {
      throw new BusinessConcurrencyConflictError(
        objective.id,
        objective.concurrencyVersion - 1,
        existing.concurrencyVersion
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO business_objectives (
        id, tenant_id, enterprise_id, organization_id, area_id, team_id,
        title, description, owner_principal_id, type, lifecycle_state,
        target_metric_json, start_date, target_date, achieved_at,
        linked_initiatives_json, linked_solutions_json, linked_workflows_json,
        version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        area_id = excluded.area_id,
        team_id = excluded.team_id,
        title = excluded.title,
        description = excluded.description,
        owner_principal_id = excluded.owner_principal_id,
        type = excluded.type,
        lifecycle_state = excluded.lifecycle_state,
        target_metric_json = excluded.target_metric_json,
        start_date = excluded.start_date,
        target_date = excluded.target_date,
        achieved_at = excluded.achieved_at,
        linked_initiatives_json = excluded.linked_initiatives_json,
        linked_solutions_json = excluded.linked_solutions_json,
        linked_workflows_json = excluded.linked_workflows_json,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      objective.id,
      objective.tenantId,
      objective.enterpriseId,
      objective.organizationId ?? null,
      objective.areaId ?? null,
      objective.teamId ?? null,
      objective.title,
      objective.description,
      objective.ownerPrincipalId,
      objective.type,
      objective.lifecycleState,
      objective.targetMetric ? JSON.stringify(objective.targetMetric) : null,
      objective.startDate ? objective.startDate.toISOString() : null,
      objective.targetDate ? objective.targetDate.toISOString() : null,
      objective.achievedAt ? objective.achievedAt.toISOString() : null,
      JSON.stringify(objective.linkedInitiativeIds),
      JSON.stringify(objective.linkedSolutionIds),
      JSON.stringify(objective.linkedWorkflowIds),
      objective.version,
      objective.concurrencyVersion,
      objective.createdAt.toISOString(),
      objective.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<BusinessObjective | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_objectives WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapToObjective(row);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessObjective[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_objectives WHERE enterprise_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return rows.map((r) => this.mapToObjective(r));
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessObjective[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_objectives WHERE tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(tenantId) as any[];
    return rows.map((r) => this.mapToObjective(r));
  }

  private mapToObjective(row: any): BusinessObjective {
    return BusinessObjective.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      organizationId: row.organization_id ?? undefined,
      areaId: row.area_id ?? undefined,
      teamId: row.team_id ?? undefined,
      title: row.title,
      description: row.description,
      ownerPrincipalId: row.owner_principal_id,
      type: row.type,
      lifecycleState: row.lifecycle_state,
      targetMetric: row.target_metric_json ? JSON.parse(row.target_metric_json) : undefined,
      startDate: row.start_date ? new Date(row.start_date) : undefined,
      targetDate: row.target_date ? new Date(row.target_date) : undefined,
      achievedAt: row.achieved_at ? new Date(row.achieved_at) : undefined,
      linkedInitiativeIds: row.linked_initiatives_json ? JSON.parse(row.linked_initiatives_json) : [],
      linkedSolutionIds: row.linked_solutions_json ? JSON.parse(row.linked_solutions_json) : [],
      linkedWorkflowIds: row.linked_workflows_json ? JSON.parse(row.linked_workflows_json) : [],
      version: Number(row.version),
      concurrencyVersion: Number(row.concurrency_version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteBusinessInitiativeRepository implements BusinessInitiativeRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS business_initiatives (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        objective_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        organization_id TEXT,
        area_id TEXT,
        team_id TEXT,
        lifecycle_state TEXT NOT NULL,
        target_start_date TEXT,
        target_end_date TEXT,
        linked_solutions_json TEXT NOT NULL,
        linked_workflows_json TEXT NOT NULL,
        expected_outcome TEXT,
        actual_outcome TEXT,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_init_tenant_obj ON business_initiatives(tenant_id, objective_id);
      CREATE INDEX IF NOT EXISTS idx_init_tenant_ent ON business_initiatives(tenant_id, enterprise_id);
    `);
  }

  async save(initiative: BusinessInitiative): Promise<void> {
    const existing = await this.findById(initiative.id, initiative.tenantId);
    if (existing && initiative.concurrencyVersion <= existing.concurrencyVersion) {
      throw new BusinessConcurrencyConflictError(
        initiative.id,
        initiative.concurrencyVersion - 1,
        existing.concurrencyVersion
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO business_initiatives (
        id, tenant_id, enterprise_id, objective_id, title, description,
        owner_principal_id, organization_id, area_id, team_id, lifecycle_state,
        target_start_date, target_end_date, linked_solutions_json, linked_workflows_json,
        expected_outcome, actual_outcome, version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        owner_principal_id = excluded.owner_principal_id,
        organization_id = excluded.organization_id,
        area_id = excluded.area_id,
        team_id = excluded.team_id,
        lifecycle_state = excluded.lifecycle_state,
        target_start_date = excluded.target_start_date,
        target_end_date = excluded.target_end_date,
        linked_solutions_json = excluded.linked_solutions_json,
        linked_workflows_json = excluded.linked_workflows_json,
        expected_outcome = excluded.expected_outcome,
        actual_outcome = excluded.actual_outcome,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      initiative.id,
      initiative.tenantId,
      initiative.enterpriseId,
      initiative.objectiveId,
      initiative.title,
      initiative.description,
      initiative.ownerPrincipalId,
      initiative.organizationId ?? null,
      initiative.areaId ?? null,
      initiative.teamId ?? null,
      initiative.lifecycleState,
      initiative.targetStartDate ? initiative.targetStartDate.toISOString() : null,
      initiative.targetEndDate ? initiative.targetEndDate.toISOString() : null,
      JSON.stringify(initiative.linkedSolutionIds),
      JSON.stringify(initiative.linkedWorkflowIds),
      initiative.expectedOutcome ?? null,
      initiative.actualOutcome ?? null,
      initiative.version,
      initiative.concurrencyVersion,
      initiative.createdAt.toISOString(),
      initiative.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<BusinessInitiative | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_initiatives WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapToInitiative(row);
  }

  async listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessInitiative[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_initiatives WHERE objective_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(objectiveId, tenantId) as any[];
    return rows.map((r) => this.mapToInitiative(r));
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessInitiative[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_initiatives WHERE enterprise_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return rows.map((r) => this.mapToInitiative(r));
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessInitiative[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_initiatives WHERE tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(tenantId) as any[];
    return rows.map((r) => this.mapToInitiative(r));
  }

  private mapToInitiative(row: any): BusinessInitiative {
    return BusinessInitiative.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      objectiveId: row.objective_id,
      title: row.title,
      description: row.description,
      ownerPrincipalId: row.owner_principal_id,
      organizationId: row.organization_id ?? undefined,
      areaId: row.area_id ?? undefined,
      teamId: row.team_id ?? undefined,
      lifecycleState: row.lifecycle_state,
      targetStartDate: row.target_start_date ? new Date(row.target_start_date) : undefined,
      targetEndDate: row.target_end_date ? new Date(row.target_end_date) : undefined,
      linkedSolutionIds: row.linked_solutions_json ? JSON.parse(row.linked_solutions_json) : [],
      linkedWorkflowIds: row.linked_workflows_json ? JSON.parse(row.linked_workflows_json) : [],
      expectedOutcome: row.expected_outcome ?? undefined,
      actualOutcome: row.actual_outcome ?? undefined,
      version: Number(row.version),
      concurrencyVersion: Number(row.concurrency_version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteBusinessMetricRepository implements BusinessMetricRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS business_metrics (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        objective_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        target_value REAL NOT NULL,
        current_value REAL,
        gap REAL,
        period TEXT NOT NULL,
        source TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_metric_tenant_obj ON business_metrics(tenant_id, objective_id);
      CREATE INDEX IF NOT EXISTS idx_metric_tenant_ent ON business_metrics(tenant_id, enterprise_id);
    `);
  }

  async save(metric: BusinessMetric): Promise<void> {
    const existing = await this.findById(metric.id, metric.tenantId);
    if (existing && metric.concurrencyVersion <= existing.concurrencyVersion) {
      throw new BusinessConcurrencyConflictError(
        metric.id,
        metric.concurrencyVersion - 1,
        existing.concurrencyVersion
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO business_metrics (
        id, tenant_id, enterprise_id, objective_id, name, unit,
        target_value, current_value, gap, period, source, last_updated,
        status, version, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        name = excluded.name,
        unit = excluded.unit,
        target_value = excluded.target_value,
        current_value = excluded.current_value,
        gap = excluded.gap,
        period = excluded.period,
        source = excluded.source,
        last_updated = excluded.last_updated,
        status = excluded.status,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      metric.id,
      metric.tenantId,
      metric.enterpriseId,
      metric.objectiveId,
      metric.name,
      metric.unit,
      metric.targetValue,
      metric.currentValue !== undefined ? metric.currentValue : null,
      metric.gap !== undefined ? metric.gap : null,
      metric.period,
      metric.source,
      metric.lastUpdated.toISOString(),
      metric.status,
      metric.version,
      metric.concurrencyVersion,
      metric.createdAt.toISOString(),
      metric.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<BusinessMetric | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_metrics WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapToMetric(row);
  }

  async listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessMetric[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_metrics WHERE objective_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(objectiveId, tenantId) as any[];
    return rows.map((r) => this.mapToMetric(r));
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessMetric[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_metrics WHERE enterprise_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return rows.map((r) => this.mapToMetric(r));
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessMetric[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM business_metrics WHERE tenant_id = ? ORDER BY created_at ASC
    `);
    const rows = stmt.all(tenantId) as any[];
    return rows.map((r) => this.mapToMetric(r));
  }

  private mapToMetric(row: any): BusinessMetric {
    return BusinessMetric.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      objectiveId: row.objective_id,
      name: row.name,
      unit: row.unit,
      targetValue: Number(row.target_value),
      currentValue: row.current_value !== null && row.current_value !== undefined ? Number(row.current_value) : undefined,
      gap: row.gap !== null && row.gap !== undefined ? Number(row.gap) : undefined,
      period: row.period,
      source: row.source,
      lastUpdated: new Date(row.last_updated),
      status: row.status,
      version: Number(row.version),
      concurrencyVersion: Number(row.concurrency_version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteExecutiveDecisionRepository implements ExecutiveDecisionRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executive_decision_records (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        decision_maker_principal_id TEXT NOT NULL,
        authority_scope TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        rationale TEXT NOT NULL,
        policy_context TEXT,
        resulting_action TEXT,
        metadata_json TEXT,
        timestamp TEXT NOT NULL,
        version INTEGER NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dec_tenant_ent ON executive_decision_records(tenant_id, enterprise_id);
      CREATE INDEX IF NOT EXISTS idx_dec_tenant_tgt ON executive_decision_records(tenant_id, target_id);
    `);
  }

  async save(decision: ExecutiveDecisionRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO executive_decision_records (
        id, tenant_id, enterprise_id, decision_maker_principal_id,
        authority_scope, decision_type, target_type, target_id,
        rationale, policy_context, resulting_action, metadata_json,
        timestamp, version, concurrency_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        rationale = excluded.rationale,
        policy_context = excluded.policy_context,
        resulting_action = excluded.resulting_action,
        metadata_json = excluded.metadata_json,
        version = excluded.version,
        concurrency_version = excluded.concurrency_version
    `);

    stmt.run(
      decision.id,
      decision.tenantId,
      decision.enterpriseId,
      decision.decisionMakerPrincipalId,
      decision.authorityScope,
      decision.decisionType,
      decision.targetType,
      decision.targetId,
      decision.rationale,
      decision.policyContext ?? null,
      decision.resultingAction ?? null,
      decision.metadata ? JSON.stringify(decision.metadata) : null,
      decision.timestamp.toISOString(),
      decision.version,
      decision.concurrencyVersion,
      decision.createdAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveDecisionRecord | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_decision_records WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapToDecision(row);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_decision_records WHERE enterprise_id = ? AND tenant_id = ? ORDER BY timestamp DESC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return rows.map((r) => this.mapToDecision(r));
  }

  async listByTarget(targetId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_decision_records WHERE target_id = ? AND tenant_id = ? ORDER BY timestamp DESC
    `);
    const rows = stmt.all(targetId, tenantId) as any[];
    return rows.map((r) => this.mapToDecision(r));
  }

  async listByTenant(tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_decision_records WHERE tenant_id = ? ORDER BY timestamp DESC
    `);
    const rows = stmt.all(tenantId) as any[];
    return rows.map((r) => this.mapToDecision(r));
  }

  private mapToDecision(row: any): ExecutiveDecisionRecord {
    return ExecutiveDecisionRecord.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      decisionMakerPrincipalId: row.decision_maker_principal_id,
      authorityScope: row.authority_scope,
      decisionType: row.decision_type,
      targetType: row.target_type,
      targetId: row.target_id,
      rationale: row.rationale,
      policyContext: row.policy_context ?? undefined,
      resultingAction: row.resulting_action ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      timestamp: new Date(row.timestamp),
      version: Number(row.version),
      concurrencyVersion: Number(row.concurrency_version),
      createdAt: new Date(row.created_at),
    });
  }
}
