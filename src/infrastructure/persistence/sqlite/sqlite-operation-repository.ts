import { DatabaseSync, StatementSync } from "node:sqlite";
import {
  OperationDetailProjection,
  OperationProjection,
  OperationQueryPort,
} from "../../../application/ports/query-ports.js";
import { AutonomousOperation } from "../../../domain/autonomy/autonomous-operation.js";
import { Decision } from "../../../domain/autonomy/decision.js";
import { Observation } from "../../../domain/autonomy/observation.js";
import {
  OperationRecord,
  OperationRepositoryPort,
} from "../../../domain/autonomy/operation-repository.js";
import { Plan } from "../../../domain/autonomy/plan.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import {
  DecisionRow,
  mapRowsToDetailProjection,
  mapRowToAutonomousOperation,
  mapRowToDecision,
  mapRowToObservation,
  mapRowToPlan,
  mapRowToProjection,
  ObservationRow,
  OperationRow,
  PlanRow,
  PlanStepRow,
} from "./sqlite-mapper.js";
import { initializeSchema } from "./sqlite-schema.js";
import { OptimisticConcurrencyError, SqlitePersistenceError } from "./sqlite-errors.js";

export interface SaveOperationDetails {
  readonly plan?: Plan | undefined;
  readonly observations?: readonly Observation[] | undefined;
  readonly decisions?: readonly Decision[] | undefined;
  readonly expectedVersion?: number | undefined;
}

/**
 * Production SQLite durable adapter for OperationRepositoryPort & OperationQueryPort.
 * Implements atomic transactions, OCC versioning, idempotent persistence,
 * and CQRS read projections with zero external runtime dependencies.
 */
export class SqliteOperationRepository
  implements OperationRepositoryPort, OperationQueryPort
{
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  // Prepared statements for operations
  private readonly selectOpStmt: StatementSync;
  private readonly selectAllOpsStmt: StatementSync;
  private readonly insertOpStmt: StatementSync;
  private readonly updateOpStmt: StatementSync;

  // Prepared statements for plans & steps
  private readonly selectPlanStmt: StatementSync;
  private readonly selectPlanStepsStmt: StatementSync;
  private readonly insertPlanStmt: StatementSync;
  private readonly deletePlanStepsStmt: StatementSync;
  private readonly insertPlanStepStmt: StatementSync;

  // Prepared statements for observations
  private readonly selectObservationsStmt: StatementSync;
  private readonly insertObservationStmt: StatementSync;

  // Prepared statements for decisions
  private readonly selectDecisionsStmt: StatementSync;
  private readonly selectDecisionExistsStmt: StatementSync;
  private readonly insertDecisionStmt: StatementSync;

  constructor(options: SqliteDatabaseOptions = {}) {
    this.dbManager = new SqliteDatabase(options);
    this.db = this.dbManager.open();

    // Bootstrap and validate schema
    initializeSchema(this.db);

    // Prepare operations statements
    this.selectOpStmt = this.db.prepare("SELECT * FROM operations WHERE id = ?;");
    this.selectAllOpsStmt = this.db.prepare(
      "SELECT * FROM operations ORDER BY created_at ASC;"
    );
    this.insertOpStmt = this.db.prepare(`
      INSERT INTO operations (
        id, agent_id, objective, status,
        budget_max_steps, budget_max_duration_ms, budget_max_tool_calls, budget_max_tokens,
        consumption_steps_used, consumption_elapsed_ms, consumption_tool_calls_used, consumption_tokens_used,
        created_at, started_at, completed_at, termination_reason,
        failure_error_code, failure_error_message, result_output, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    this.updateOpStmt = this.db.prepare(`
      UPDATE operations SET
        agent_id = ?, objective = ?, status = ?,
        budget_max_steps = ?, budget_max_duration_ms = ?, budget_max_tool_calls = ?, budget_max_tokens = ?,
        consumption_steps_used = ?, consumption_elapsed_ms = ?, consumption_tool_calls_used = ?, consumption_tokens_used = ?,
        started_at = ?, completed_at = ?, termination_reason = ?,
        failure_error_code = ?, failure_error_message = ?, result_output = ?,
        version = ?
      WHERE id = ? AND version = ?;
    `);

    // Prepare plans & steps statements
    this.selectPlanStmt = this.db.prepare("SELECT * FROM plans WHERE operation_id = ?;");
    this.selectPlanStepsStmt = this.db.prepare(
      "SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY step_order ASC;"
    );
    this.insertPlanStmt = this.db.prepare(`
      INSERT INTO plans (id, operation_id, total_steps, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET total_steps = excluded.total_steps;
    `);
    this.deletePlanStepsStmt = this.db.prepare("DELETE FROM plan_steps WHERE plan_id = ?;");
    this.insertPlanStepStmt = this.db.prepare(`
      INSERT INTO plan_steps (id, plan_id, operation_id, step_order, action, input, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `);

    // Prepare observations statements
    this.selectObservationsStmt = this.db.prepare(
      "SELECT * FROM observations WHERE operation_id = ? ORDER BY created_at ASC;"
    );
    this.insertObservationStmt = this.db.prepare(`
      INSERT INTO observations (
        observation_id, operation_id, step_id, status, duration_ms, tool_calls,
        output, error_code, error_message, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(observation_id) DO UPDATE SET
        status = excluded.status,
        duration_ms = excluded.duration_ms,
        tool_calls = excluded.tool_calls,
        output = excluded.output,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        metadata = excluded.metadata;
    `);

    // Prepare decisions statements
    this.selectDecisionsStmt = this.db.prepare(
      "SELECT * FROM decisions WHERE operation_id = ? ORDER BY id ASC;"
    );
    this.selectDecisionExistsStmt = this.db.prepare(`
      SELECT id FROM decisions
      WHERE operation_id = ? AND type = ? AND coalesce(step_id, '') = ? AND decided_at = ?;
    `);
    this.insertDecisionStmt = this.db.prepare(`
      INSERT INTO decisions (
        operation_id, type, step_id, action, input, output, reason,
        failure_error_code, failure_error_message, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
  }

  save(operation: AutonomousOperation, details?: SaveOperationDetails): void {
    const snap = operation.snapshot();

    this.dbManager.transaction(() => {
      const existing = this.selectOpStmt.get(snap.id) as OperationRow | undefined;

      if (!existing) {
        if (details?.expectedVersion !== undefined) {
          throw new OptimisticConcurrencyError(
            snap.id,
            details.expectedVersion,
            undefined
          );
        }

        // Insert new operation record at version 1
        this.insertOpStmt.run(
          snap.id,
          snap.agentId,
          snap.objective,
          snap.status,
          snap.budget.maxSteps,
          snap.budget.maxDurationMs,
          snap.budget.maxToolCalls,
          snap.budget.maxTokens ?? null,
          snap.consumption.stepsUsed,
          snap.consumption.elapsedMs,
          snap.consumption.toolCallsUsed,
          snap.consumption.tokensUsed ?? null,
          snap.createdAt.toISOString(),
          snap.startedAt ? snap.startedAt.toISOString() : null,
          snap.completedAt ? snap.completedAt.toISOString() : null,
          snap.terminationReason ?? null,
          snap.failureError?.code ?? null,
          snap.failureError?.message ?? null,
          snap.resultOutput ? JSON.stringify(snap.resultOutput) : null,
          1
        );
      } else {
        const currentVersion = existing.version;
        if (
          details?.expectedVersion !== undefined &&
          details.expectedVersion !== currentVersion
        ) {
          throw new OptimisticConcurrencyError(
            snap.id,
            details.expectedVersion,
            currentVersion
          );
        }

        const nextVersion = currentVersion + 1;
        const result = this.updateOpStmt.run(
          snap.agentId,
          snap.objective,
          snap.status,
          snap.budget.maxSteps,
          snap.budget.maxDurationMs,
          snap.budget.maxToolCalls,
          snap.budget.maxTokens ?? null,
          snap.consumption.stepsUsed,
          snap.consumption.elapsedMs,
          snap.consumption.toolCallsUsed,
          snap.consumption.tokensUsed ?? null,
          snap.startedAt ? snap.startedAt.toISOString() : null,
          snap.completedAt ? snap.completedAt.toISOString() : null,
          snap.terminationReason ?? null,
          snap.failureError?.code ?? null,
          snap.failureError?.message ?? null,
          snap.resultOutput ? JSON.stringify(snap.resultOutput) : null,
          nextVersion,
          snap.id,
          currentVersion
        );

        if (result.changes === 0) {
          throw new OptimisticConcurrencyError(
            snap.id,
            currentVersion,
            undefined
          );
        }
      }

      // Persist plan if provided
      if (details?.plan) {
        const plan = details.plan;
        this.insertPlanStmt.run(
          plan.id,
          plan.operationId,
          plan.totalSteps,
          plan.createdAt.toISOString()
        );

        // Replace steps atomically to preserve order and avoid duplicates
        this.deletePlanStepsStmt.run(plan.id);
        for (const step of plan.steps) {
          this.insertPlanStepStmt.run(
            step.id,
            plan.id,
            plan.operationId,
            step.order,
            step.action,
            JSON.stringify(step.input),
            step.metadata ? JSON.stringify(step.metadata) : null
          );
        }
      }

      // Persist observations if provided
      if (details?.observations) {
        for (const obs of details.observations) {
          this.insertObservationStmt.run(
            obs.observationId,
            obs.operationId,
            obs.stepId,
            obs.status,
            obs.durationMs,
            obs.toolCalls ?? 0,
            obs.output ? JSON.stringify(obs.output) : null,
            obs.error?.code ?? null,
            obs.error?.message ?? null,
            obs.metadata ? JSON.stringify(obs.metadata) : null,
            new Date().toISOString()
          );
        }
      }

      // Persist decisions if provided (idempotent check against duplicate records)
      if (details?.decisions) {
        for (const dec of details.decisions) {
          const stepIdKey = dec.stepId ?? "";
          const decidedAtKey = dec.decidedAt.toISOString();

          const existingDec = this.selectDecisionExistsStmt.get(
            dec.operationId,
            dec.type,
            stepIdKey,
            decidedAtKey
          );

          if (!existingDec) {
            this.insertDecisionStmt.run(
              dec.operationId,
              dec.type,
              dec.stepId ?? null,
              dec.action ?? null,
              dec.input ? JSON.stringify(dec.input) : null,
              dec.output ? JSON.stringify(dec.output) : null,
              dec.reason ?? null,
              dec.failureError?.code ?? null,
              dec.failureError?.message ?? null,
              decidedAtKey
            );
          }
        }
      }
    });
  }

  findById(id: string): AutonomousOperation | undefined {
    const row = this.selectOpStmt.get(id) as OperationRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapRowToAutonomousOperation(row);
  }

  findRecordById(id: string): OperationRecord | undefined {
    const opRow = this.selectOpStmt.get(id) as OperationRow | undefined;
    if (!opRow) {
      return undefined;
    }

    const op = mapRowToAutonomousOperation(opRow);

    const planRow = this.selectPlanStmt.get(id) as PlanRow | undefined;
    let plan: Plan | undefined = undefined;
    if (planRow) {
      const stepRows = this.selectPlanStepsStmt.all(planRow.id) as unknown as PlanStepRow[];
      plan = mapRowToPlan(planRow, stepRows);
    }

    const obsRows = this.selectObservationsStmt.all(id) as unknown as ObservationRow[];
    const observations = Object.freeze(obsRows.map(mapRowToObservation));

    const decRows = this.selectDecisionsStmt.all(id) as unknown as DecisionRow[];
    const decisions = Object.freeze(decRows.map(mapRowToDecision));

    return {
      operation: op,
      plan,
      observations,
      decisions,
    };
  }

  list(): readonly AutonomousOperation[] {
    const rows = this.selectAllOpsStmt.all() as unknown as OperationRow[];
    return rows.map(mapRowToAutonomousOperation);
  }

  listRecords(): readonly OperationRecord[] {
    const rows = this.selectAllOpsStmt.all() as unknown as OperationRow[];
    return rows.map((r) => this.findRecordById(r.id)!);
  }

  // --- OperationQueryPort ---

  listProjections(): readonly OperationProjection[] {
    const rows = this.selectAllOpsStmt.all() as unknown as OperationRow[];
    return rows.map(mapRowToProjection);
  }

  findDetailById(id: string): OperationDetailProjection | undefined {
    const opRow = this.selectOpStmt.get(id) as OperationRow | undefined;
    if (!opRow) {
      return undefined;
    }

    const planRow = this.selectPlanStmt.get(id) as PlanRow | undefined;
    const stepRows = planRow
      ? (this.selectPlanStepsStmt.all(planRow.id) as unknown as PlanStepRow[])
      : [];

    const obsRows = this.selectObservationsStmt.all(id) as unknown as ObservationRow[];
    const decRows = this.selectDecisionsStmt.all(id) as unknown as DecisionRow[];

    return mapRowsToDetailProjection(opRow, planRow, stepRows, obsRows, decRows);
  }

  /**
   * Retrieves the current OCC integer version for an operation.
   */
  getVersion(id: string): number | undefined {
    const row = this.selectOpStmt.get(id) as OperationRow | undefined;
    return row ? row.version : undefined;
  }

  /**
   * Access to the underlying SQLite database connection.
   */
  getDatabase(): DatabaseSync {
    return this.db;
  }

  /**
   * Closes the underlying database connection.
   */
  close(): void {
    this.dbManager.close();
  }
}
