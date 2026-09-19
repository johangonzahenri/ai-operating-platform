/**
 * AI Operating Platform - SQLite Executive Repositories
 * 
 * Persistent SQLite storage for ExecutiveCycle, ExecutiveContextSnapshot,
 * ExecutiveAnalysis, and ExecutivePlan aggregates using node:sqlite DatabaseSync with WAL and OCC.
 */

import { DatabaseSync } from "node:sqlite";
import { ExecutiveCycle, ExecutiveCycleStatus } from "../../../domain/executive/executive-cycle.js";
import { ExecutiveContextSnapshot } from "../../../domain/executive/executive-context-snapshot.js";
import { ExecutiveAnalysis } from "../../../domain/executive/executive-analysis.js";
import { ExecutivePlan, ExecutivePlanStatus } from "../../../domain/executive/executive-plan.js";
import { ExecutiveSignal } from "../../../domain/executive/executive-signal.js";
import {
  ExecutiveCycleRepositoryPort,
  ExecutiveContextSnapshotRepositoryPort,
  ExecutiveAnalysisRepositoryPort,
  ExecutivePlanRepositoryPort,
} from "../../../application/ports/executive-repository-port.js";
import { SqliteDatabase } from "./sqlite-database.js";
import { ExecutiveConcurrencyConflictError } from "../../../domain/executive/executive-errors.js";

export class SqliteExecutiveCycleRepository implements ExecutiveCycleRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executive_cycles (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        status TEXT NOT NULL,
        context_snapshot_id TEXT,
        analysis_id TEXT,
        plan_id TEXT,
        active_action_index INTEGER NOT NULL DEFAULT 0,
        decision_record_ids TEXT NOT NULL,
        workflow_instance_ids TEXT NOT NULL,
        verification_result_ids TEXT NOT NULL,
        approval_request_id TEXT,
        replanning_count INTEGER NOT NULL DEFAULT 0,
        max_replanning_attempts INTEGER NOT NULL DEFAULT 3,
        max_actions_per_cycle INTEGER NOT NULL DEFAULT 10,
        outcome_summary TEXT,
        failure_reason TEXT,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_exec_cycles_tenant ON executive_cycles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_exec_cycles_enterprise ON executive_cycles(enterprise_id, tenant_id);
    `);
  }

  async save(cycle: ExecutiveCycle): Promise<void> {
    const existing = await this.findById(cycle.id, cycle.tenantId);
    if (existing && existing.concurrencyVersion >= cycle.concurrencyVersion) {
      throw new ExecutiveConcurrencyConflictError(cycle.id, existing.concurrencyVersion, cycle.concurrencyVersion);
    }

    const stmt = this.db.prepare(`
      INSERT INTO executive_cycles (
        id, tenant_id, enterprise_id, status, context_snapshot_id, analysis_id, plan_id,
        active_action_index, decision_record_ids, workflow_instance_ids, verification_result_ids,
        approval_request_id, replanning_count, max_replanning_attempts, max_actions_per_cycle,
        outcome_summary, failure_reason, concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        status = excluded.status,
        context_snapshot_id = excluded.context_snapshot_id,
        analysis_id = excluded.analysis_id,
        plan_id = excluded.plan_id,
        active_action_index = excluded.active_action_index,
        decision_record_ids = excluded.decision_record_ids,
        workflow_instance_ids = excluded.workflow_instance_ids,
        verification_result_ids = excluded.verification_result_ids,
        approval_request_id = excluded.approval_request_id,
        replanning_count = excluded.replanning_count,
        max_replanning_attempts = excluded.max_replanning_attempts,
        max_actions_per_cycle = excluded.max_actions_per_cycle,
        outcome_summary = excluded.outcome_summary,
        failure_reason = excluded.failure_reason,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      cycle.id,
      cycle.tenantId,
      cycle.enterpriseId,
      cycle.status,
      cycle.contextSnapshotId ?? null,
      cycle.analysisId ?? null,
      cycle.planId ?? null,
      cycle.activeActionIndex,
      JSON.stringify(cycle.decisionRecordIds),
      JSON.stringify(cycle.workflowInstanceIds),
      JSON.stringify(cycle.verificationResultIds),
      cycle.approvalRequestId ?? null,
      cycle.replanningCount,
      cycle.maxReplanningAttempts,
      cycle.maxActionsPerCycle,
      cycle.outcomeSummary ?? null,
      cycle.failureReason ?? null,
      cycle.concurrencyVersion,
      cycle.createdAt.toISOString(),
      cycle.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveCycle | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_cycles WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToCycle(row);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveCycle[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_cycles WHERE enterprise_id = ? AND tenant_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRowToCycle(r)));
  }

  async listByTenant(tenantId: string): Promise<readonly ExecutiveCycle[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_cycles WHERE tenant_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRowToCycle(r)));
  }

  private mapRowToCycle(row: any): ExecutiveCycle {
    return ExecutiveCycle.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      status: row.status as ExecutiveCycleStatus,
      contextSnapshotId: row.context_snapshot_id ?? undefined,
      analysisId: row.analysis_id ?? undefined,
      planId: row.plan_id ?? undefined,
      activeActionIndex: row.active_action_index,
      decisionRecordIds: Object.freeze(JSON.parse(row.decision_record_ids || "[]")),
      workflowInstanceIds: Object.freeze(JSON.parse(row.workflow_instance_ids || "[]")),
      verificationResultIds: Object.freeze(JSON.parse(row.verification_result_ids || "[]")),
      approvalRequestId: row.approval_request_id ?? undefined,
      replanningCount: row.replanning_count,
      maxReplanningAttempts: row.max_replanning_attempts,
      maxActionsPerCycle: row.max_actions_per_cycle,
      outcomeSummary: row.outcome_summary ?? undefined,
      failureReason: row.failure_reason ?? undefined,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteExecutiveContextSnapshotRepository implements ExecutiveContextSnapshotRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executive_context_snapshots (
        id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        enterprise_name TEXT NOT NULL,
        enterprise_status TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        objectives_json TEXT NOT NULL,
        initiatives_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        solutions_json TEXT NOT NULL,
        workflows_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_exec_snap_cycle ON executive_context_snapshots(cycle_id, tenant_id);
    `);
  }

  async save(snapshot: ExecutiveContextSnapshot): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO executive_context_snapshots (
        id, cycle_id, tenant_id, enterprise_id, enterprise_name, enterprise_status,
        captured_at, objectives_json, initiatives_json, metrics_json, solutions_json,
        workflows_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        enterprise_name = excluded.enterprise_name,
        enterprise_status = excluded.enterprise_status,
        objectives_json = excluded.objectives_json,
        initiatives_json = excluded.initiatives_json,
        metrics_json = excluded.metrics_json,
        solutions_json = excluded.solutions_json,
        workflows_json = excluded.workflows_json,
        metadata_json = excluded.metadata_json
    `);

    stmt.run(
      snapshot.id,
      snapshot.cycleId,
      snapshot.tenantId,
      snapshot.enterpriseId,
      snapshot.enterpriseName,
      snapshot.enterpriseStatus,
      snapshot.capturedAt.toISOString(),
      JSON.stringify(snapshot.objectives),
      JSON.stringify(snapshot.initiatives),
      JSON.stringify(snapshot.metrics),
      JSON.stringify(snapshot.solutions),
      JSON.stringify(snapshot.workflows),
      JSON.stringify(snapshot.metadata)
    );
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_context_snapshots WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToSnapshot(row);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_context_snapshots WHERE cycle_id = ? AND tenant_id = ?
    `);
    const row = stmt.get(cycleId, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToSnapshot(row);
  }

  private mapRowToSnapshot(row: any): ExecutiveContextSnapshot {
    return new ExecutiveContextSnapshot({
      id: row.id,
      cycleId: row.cycle_id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      enterpriseName: row.enterprise_name,
      enterpriseStatus: row.enterprise_status,
      capturedAt: new Date(row.captured_at),
      objectives: JSON.parse(row.objectives_json || "[]"),
      initiatives: JSON.parse(row.initiatives_json || "[]"),
      metrics: JSON.parse(row.metrics_json || "[]"),
      solutions: JSON.parse(row.solutions_json || "[]"),
      workflows: JSON.parse(row.workflows_json || "[]"),
      metadata: JSON.parse(row.metadata_json || "{}"),
    });
  }
}

export class SqliteExecutiveAnalysisRepository implements ExecutiveAnalysisRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executive_analyses (
        id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        affected_objectives_json TEXT NOT NULL,
        affected_initiatives_json TEXT NOT NULL,
        impacted_solutions_json TEXT NOT NULL,
        impacted_workflows_json TEXT NOT NULL,
        budget_constraints_json TEXT NOT NULL,
        evidence_references_json TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_exec_analysis_cycle ON executive_analyses(cycle_id, tenant_id);
    `);
  }

  async save(analysis: ExecutiveAnalysis): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO executive_analyses (
        id, cycle_id, tenant_id, enterprise_id, signals_json, affected_objectives_json,
        affected_initiatives_json, impacted_solutions_json, impacted_workflows_json,
        budget_constraints_json, evidence_references_json, recommended_action, summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        signals_json = excluded.signals_json,
        affected_objectives_json = excluded.affected_objectives_json,
        affected_initiatives_json = excluded.affected_initiatives_json,
        impacted_solutions_json = excluded.impacted_solutions_json,
        impacted_workflows_json = excluded.impacted_workflows_json,
        budget_constraints_json = excluded.budget_constraints_json,
        evidence_references_json = excluded.evidence_references_json,
        recommended_action = excluded.recommended_action,
        summary = excluded.summary
    `);

    stmt.run(
      analysis.id,
      analysis.cycleId,
      analysis.tenantId,
      analysis.enterpriseId,
      JSON.stringify(analysis.observedSignals.map((s) => s.toJSON())),
      JSON.stringify(analysis.affectedObjectiveIds),
      JSON.stringify(analysis.affectedInitiativeIds),
      JSON.stringify(analysis.impactedSolutionIds),
      JSON.stringify(analysis.impactedWorkflowIds),
      JSON.stringify(analysis.budgetConstraints),
      JSON.stringify(analysis.evidenceReferences),
      analysis.recommendedActionCategory,
      analysis.summary,
      analysis.createdAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveAnalysis | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_analyses WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToAnalysis(row);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveAnalysis | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_analyses WHERE cycle_id = ? AND tenant_id = ?
    `);
    const row = stmt.get(cycleId, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToAnalysis(row);
  }

  private mapRowToAnalysis(row: any): ExecutiveAnalysis {
    const rawSignals = JSON.parse(row.signals_json || "[]");
    const signals = rawSignals.map((s: any) => new ExecutiveSignal(s));
    return new ExecutiveAnalysis({
      id: row.id,
      cycleId: row.cycle_id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      observedSignals: signals,
      affectedObjectiveIds: JSON.parse(row.affected_objectives_json || "[]"),
      affectedInitiativeIds: JSON.parse(row.affected_initiatives_json || "[]"),
      impactedSolutionIds: JSON.parse(row.impacted_solutions_json || "[]"),
      impactedWorkflowIds: JSON.parse(row.impacted_workflows_json || "[]"),
      budgetConstraints: JSON.parse(row.budget_constraints_json || "[]"),
      evidenceReferences: JSON.parse(row.evidence_references_json || "[]"),
      recommendedActionCategory: row.recommended_action,
      summary: row.summary,
      createdAt: new Date(row.created_at),
    });
  }
}

export class SqliteExecutivePlanRepository implements ExecutivePlanRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executive_plans (
        id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        objective_id TEXT NOT NULL,
        initiative_id TEXT,
        rationale TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        status TEXT NOT NULL,
        validation_violations_json TEXT NOT NULL,
        rejection_reason TEXT,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_exec_plans_cycle ON executive_plans(cycle_id, tenant_id);
    `);
  }

  async save(plan: ExecutivePlan): Promise<void> {
    const existing = await this.findById(plan.id, plan.tenantId);
    if (existing && existing.concurrencyVersion >= plan.concurrencyVersion) {
      throw new ExecutiveConcurrencyConflictError(plan.id, existing.concurrencyVersion, plan.concurrencyVersion);
    }

    const stmt = this.db.prepare(`
      INSERT INTO executive_plans (
        id, cycle_id, tenant_id, enterprise_id, objective_id, initiative_id,
        rationale, actions_json, status, validation_violations_json, rejection_reason,
        concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        rationale = excluded.rationale,
        actions_json = excluded.actions_json,
        status = excluded.status,
        validation_violations_json = excluded.validation_violations_json,
        rejection_reason = excluded.rejection_reason,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      plan.id,
      plan.cycleId,
      plan.tenantId,
      plan.enterpriseId,
      plan.objectiveId,
      plan.initiativeId ?? null,
      plan.rationale,
      JSON.stringify(plan.actions),
      plan.status,
      JSON.stringify(plan.validationViolations),
      plan.rejectionReason ?? null,
      plan.concurrencyVersion,
      plan.createdAt.toISOString(),
      plan.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<ExecutivePlan | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_plans WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToPlan(row);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutivePlan | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM executive_plans WHERE cycle_id = ? AND tenant_id = ?
    `);
    const row = stmt.get(cycleId, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToPlan(row);
  }

  private mapRowToPlan(row: any): ExecutivePlan {
    return ExecutivePlan.rehydrate({
      id: row.id,
      cycleId: row.cycle_id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      objectiveId: row.objective_id,
      initiativeId: row.initiative_id ?? undefined,
      rationale: row.rationale,
      actions: JSON.parse(row.actions_json || "[]"),
      status: row.status as ExecutivePlanStatus,
      validationViolations: JSON.parse(row.validation_violations_json || "[]"),
      rejectionReason: row.rejection_reason ?? undefined,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
