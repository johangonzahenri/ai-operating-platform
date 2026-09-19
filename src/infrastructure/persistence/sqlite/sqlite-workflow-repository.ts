import { DatabaseSync } from "node:sqlite";
import { SqliteDatabase } from "./sqlite-database.js";
import {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowStatus,
} from "../../../domain/workflow/workflow-definition.js";
import {
  WorkflowInstance,
  WorkflowStepState,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
  WorkflowFailureDetail,
} from "../../../domain/workflow/workflow-instance.js";
import {
  WorkflowConcurrencyConflictError,
} from "../../../domain/workflow/workflow-errors.js";
import {
  WorkflowDefinitionRepositoryPort,
  WorkflowInstanceRepositoryPort,
} from "../../../application/ports/workflow-repository-port.js";
import { MembershipRole } from "../../../domain/organization/agent-membership.js";

interface WorkflowDefinitionRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  area_id: string | null;
  team_id: string | null;
  name: string;
  description: string | null;
  version: number;
  status: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowInstanceRow {
  id: string;
  workflow_definition_id: string;
  workflow_definition_version: number;
  tenant_id: string;
  organization_id: string;
  area_id: string | null;
  team_id: string | null;
  initiator_id: string;
  status: string;
  current_step_id: string | null;
  step_states_json: string;
  input_json: string;
  output_json: string | null;
  failure_json: string | null;
  correlation_id: string;
  trace_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class SqliteWorkflowDefinitionRepository implements WorkflowDefinitionRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(private readonly dbManager: SqliteDatabase) {
    this.db = this.dbManager.open();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        area_id TEXT,
        team_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_defs_tenant ON workflow_definitions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_defs_status ON workflow_definitions(status);
    `);
  }

  private mapRowToDefinition(row: WorkflowDefinitionRow): WorkflowDefinition {
    const rawSteps: any[] = JSON.parse(row.steps_json);
    const steps: WorkflowStepDefinition[] = rawSteps.map((s) => ({
      stepId: s.stepId,
      name: s.name,
      order: s.order,
      purpose: s.purpose,
      dependsOn: s.dependsOn ?? undefined,
      responsibility: s.responsibility ?? undefined,
      requiredCapabilities: s.requiredCapabilities ?? undefined,
      requiredRole: s.requiredRole as MembershipRole | undefined,
      assignedAgentId: s.assignedAgentId ?? undefined,
      assignedTeamId: s.assignedTeamId ?? undefined,
      inputTemplate: s.inputTemplate ?? undefined,
      timeoutMs: s.timeoutMs ?? undefined,
      maxRetries: s.maxRetries ?? undefined,
      requiresApproval: s.requiresApproval ?? undefined,
    }));

    return WorkflowDefinition.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      areaId: row.area_id ?? undefined,
      teamId: row.team_id ?? undefined,
      name: row.name,
      description: row.description ?? "",
      version: row.version,
      status: row.status as WorkflowStatus,
      steps,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async save(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    const existing = await this.findById(definition.id, definition.tenantId);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO workflow_definitions (
          id, tenant_id, organization_id, area_id, team_id, name, description, version, status, steps_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        definition.id,
        definition.tenantId,
        definition.organizationId,
        definition.areaId ?? null,
        definition.teamId ?? null,
        definition.name,
        definition.description || null,
        definition.version,
        definition.status,
        JSON.stringify(definition.steps),
        definition.createdAt.toISOString(),
        definition.updatedAt.toISOString()
      );
      return definition;
    }

    const expectedVersion = definition.version - 1;
    const updateStmt = this.db.prepare(`
      UPDATE workflow_definitions
      SET name = ?, description = ?, version = ?, status = ?, steps_json = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND version = ?
    `);

    const result = updateStmt.run(
      definition.name,
      definition.description || null,
      definition.version,
      definition.status,
      JSON.stringify(definition.steps),
      definition.updatedAt.toISOString(),
      definition.id,
      definition.tenantId,
      expectedVersion
    );

    if (result.changes === 0) {
      throw new WorkflowConcurrencyConflictError(
        `Workflow definition OCC conflict on '${definition.id}': expected version ${expectedVersion}`
      );
    }

    return definition;
  }

  async findById(id: string, tenantId: string): Promise<WorkflowDefinition | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_definitions WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as WorkflowDefinitionRow | undefined;
    if (!row) return undefined;
    return this.mapRowToDefinition(row);
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowDefinition[]> {
    let sql = `SELECT * FROM workflow_definitions WHERE tenant_id = ? ORDER BY created_at DESC`;
    const params: any[] = [tenantId];

    if (limit !== undefined && limit > 0) {
      sql += ` LIMIT ?`;
      params.push(limit);
      if (offset !== undefined && offset > 0) {
        sql += ` OFFSET ?`;
        params.push(offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as WorkflowDefinitionRow[];
    return rows.map((r) => this.mapRowToDefinition(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM workflow_definitions WHERE id = ? AND tenant_id = ?
    `);
    const result = stmt.run(id, tenantId);
    return result.changes > 0;
  }
}

export class SqliteWorkflowInstanceRepository implements WorkflowInstanceRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(private readonly dbManager: SqliteDatabase) {
    this.db = this.dbManager.open();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_instances (
        id TEXT PRIMARY KEY,
        workflow_definition_id TEXT NOT NULL,
        workflow_definition_version INTEGER NOT NULL,
        tenant_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        area_id TEXT,
        team_id TEXT,
        initiator_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_step_id TEXT,
        step_states_json TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        failure_json TEXT,
        correlation_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant ON workflow_instances(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_def ON workflow_instances(workflow_definition_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
    `);
  }

  private mapRowToInstance(row: WorkflowInstanceRow): WorkflowInstance {
    const rawStepStates: Record<string, any> = JSON.parse(row.step_states_json);
    const stepStates: Record<string, WorkflowStepState> = {};

    for (const [k, s] of Object.entries(rawStepStates)) {
      stepStates[k] = {
        stepId: s.stepId,
        status: s.status as WorkflowStepStatus,
        assignedAgentId: s.assignedAgentId ?? undefined,
        assignedTeamId: s.assignedTeamId ?? undefined,
        taskId: s.taskId ?? undefined,
        executionId: s.executionId ?? undefined,
        coordinationId: s.coordinationId ?? undefined,
        attempts: s.attempts ?? 0,
        maxRetries: s.maxRetries ?? 0,
        input: s.input ?? {},
        output: s.output ?? undefined,
        error: s.error ?? undefined,
        startedAt: s.startedAt ? new Date(s.startedAt) : undefined,
        completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
      };
    }

    return WorkflowInstance.rehydrate({
      id: row.id,
      workflowDefinitionId: row.workflow_definition_id,
      workflowDefinitionVersion: row.workflow_definition_version,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      areaId: row.area_id ?? undefined,
      teamId: row.team_id ?? undefined,
      initiatorId: row.initiator_id,
      status: row.status as WorkflowInstanceStatus,
      currentStepId: row.current_step_id ?? undefined,
      stepStates,
      input: JSON.parse(row.input_json),
      output: row.output_json ? JSON.parse(row.output_json) : undefined,
      failure: row.failure_json ? (JSON.parse(row.failure_json) as WorkflowFailureDetail) : undefined,
      correlationId: row.correlation_id,
      traceId: row.trace_id,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    });
  }

  async save(instance: WorkflowInstance): Promise<WorkflowInstance> {
    const existing = await this.findById(instance.id, instance.tenantId);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO workflow_instances (
          id, workflow_definition_id, workflow_definition_version, tenant_id,
          organization_id, area_id, team_id, initiator_id, status, current_step_id,
          step_states_json, input_json, output_json, failure_json, correlation_id,
          trace_id, version, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        instance.id,
        instance.workflowDefinitionId,
        instance.workflowDefinitionVersion,
        instance.tenantId,
        instance.organizationId,
        instance.areaId ?? null,
        instance.teamId ?? null,
        instance.initiatorId,
        instance.status,
        instance.currentStepId ?? null,
        JSON.stringify(instance.stepStates),
        JSON.stringify(instance.input),
        instance.output ? JSON.stringify(instance.output) : null,
        instance.failure ? JSON.stringify(instance.failure) : null,
        instance.correlationId,
        instance.traceId,
        instance.version,
        instance.createdAt.toISOString(),
        instance.updatedAt.toISOString(),
        instance.completedAt?.toISOString() ?? null
      );
      return instance;
    }

    const expectedVersion = instance.version - 1;
    const updateStmt = this.db.prepare(`
      UPDATE workflow_instances
      SET status = ?, current_step_id = ?, step_states_json = ?, output_json = ?,
          failure_json = ?, version = ?, updated_at = ?, completed_at = ?
      WHERE id = ? AND tenant_id = ? AND version = ?
    `);

    const result = updateStmt.run(
      instance.status,
      instance.currentStepId ?? null,
      JSON.stringify(instance.stepStates),
      instance.output ? JSON.stringify(instance.output) : null,
      instance.failure ? JSON.stringify(instance.failure) : null,
      instance.version,
      instance.updatedAt.toISOString(),
      instance.completedAt?.toISOString() ?? null,
      instance.id,
      instance.tenantId,
      expectedVersion
    );

    if (result.changes === 0) {
      throw new WorkflowConcurrencyConflictError(
        `Workflow instance OCC conflict on '${instance.id}': expected version ${expectedVersion}`
      );
    }

    return instance;
  }

  async findById(id: string, tenantId: string): Promise<WorkflowInstance | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_instances WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as WorkflowInstanceRow | undefined;
    if (!row) return undefined;
    return this.mapRowToInstance(row);
  }

  async findByDefinitionId(definitionId: string, tenantId: string): Promise<readonly WorkflowInstance[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_instances WHERE workflow_definition_id = ? AND tenant_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(definitionId, tenantId) as unknown as WorkflowInstanceRow[];
    return rows.map((r) => this.mapRowToInstance(r));
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly WorkflowInstance[]> {
    let sql = `SELECT * FROM workflow_instances WHERE tenant_id = ? ORDER BY created_at DESC`;
    const params: any[] = [tenantId];

    if (limit !== undefined && limit > 0) {
      sql += ` LIMIT ?`;
      params.push(limit);
      if (offset !== undefined && offset > 0) {
        sql += ` OFFSET ?`;
        params.push(offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as WorkflowInstanceRow[];
    return rows.map((r) => this.mapRowToInstance(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM workflow_instances WHERE id = ? AND tenant_id = ?
    `);
    const result = stmt.run(id, tenantId);
    return result.changes > 0;
  }
}
