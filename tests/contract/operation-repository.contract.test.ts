import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { Decision } from "../../src/domain/autonomy/decision.js";
import { Observation } from "../../src/domain/autonomy/observation.js";
import {
  OperationRecord,
  OperationRepositoryPort,
} from "../../src/domain/autonomy/operation-repository.js";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import {
  OperationDetailProjection,
  OperationProjection,
  OperationQueryPort,
} from "../../src/application/ports/query-ports.js";
import { InMemoryOperationRepository } from "../../src/infrastructure/persistence/in-memory-operation-repository.js";

/**
 * Reusable contract test suite for any implementation of OperationRepositoryPort & OperationQueryPort.
 * This ensures that InMemoryOperationRepository and future durable adapters (SQLite, PostgreSQL)
 * adhere to the exact same behavioral, immutability, and querying semantics.
 */
export function runOperationRepositoryContractTests(
  adapterName: string,
  factory: () => OperationRepositoryPort & OperationQueryPort
): void {
  test(`${adapterName} - OperationRepository & QueryPort Contract Suite`, async (t) => {
    const createSampleBudget = () =>
      AutonomyBudget.create({
        maxSteps: 5,
        maxDurationMs: 15000,
        maxToolCalls: 3,
      });

    const createSampleOperation = (id: string, agentId: string = "agent-1") =>
      AutonomousOperation.create({
        id,
        agentId,
        objective: `Execute contract task for ${id}`,
        budget: createSampleBudget(),
        createdAt: new Date("2026-09-08T10:00:00.000Z"),
      });

    await t.test("1. Basic Identity Persistence: saves and retrieves by ID", () => {
      const repo = factory();
      const op = createSampleOperation("contract-op-1");

      assert.equal(repo.findById("contract-op-1"), undefined);
      assert.equal(repo.findRecordById("contract-op-1"), undefined);
      assert.equal(repo.list().length, 0);

      repo.save(op);

      const retrieved = repo.findById("contract-op-1");
      assert.ok(retrieved);
      assert.equal(retrieved.id, "contract-op-1");
      assert.equal(retrieved.agentId, "agent-1");
      assert.equal(retrieved.status, "SUBMITTED");
      assert.equal(retrieved.consumption.stepsUsed, 0);

      const record = repo.findRecordById("contract-op-1");
      assert.ok(record);
      assert.equal(record.operation.id, "contract-op-1");
      assert.equal(record.plan, undefined);
      assert.deepEqual(record.observations, []);
      assert.deepEqual(record.decisions, []);
    });

    await t.test("2. Non-existent IDs: returns undefined gracefully", () => {
      const repo = factory();
      assert.equal(repo.findById("non-existent-id"), undefined);
      assert.equal(repo.findRecordById("non-existent-id"), undefined);
    });

    await t.test("3. Lifecycle State Updates: overwrites state without corrupting identity", () => {
      const repo = factory();
      const op = createSampleOperation("contract-op-lifecycle");
      repo.save(op);

      // Transition SUBMITTED -> RUNNING
      const running = op.start(new Date("2026-09-08T10:00:05.000Z"));
      repo.save(running);

      const retrievedRunning = repo.findById("contract-op-lifecycle");
      assert.ok(retrievedRunning);
      assert.equal(retrievedRunning.status, "RUNNING");
      assert.ok(retrievedRunning.startedAt);

      // Transition RUNNING -> COMPLETED
      const completed = running.complete(
        { summary: "Contract passed" },
        new Date("2026-09-08T10:00:10.000Z")
      );
      repo.save(completed);

      const retrievedCompleted = repo.findById("contract-op-lifecycle");
      assert.ok(retrievedCompleted);
      assert.equal(retrievedCompleted.status, "COMPLETED");
      assert.deepEqual(retrievedCompleted.resultOutput, { summary: "Contract passed" });
      assert.ok(retrievedCompleted.completedAt);
    });

    await t.test("4. Aggregate Persistence: saves operation with plan, observations, and decisions", () => {
      const repo = factory();
      const op = createSampleOperation("contract-op-aggregate");

      const step1 = PlanStep.create({
        id: "step-1",
        order: 1,
        action: "calculate",
        input: { expression: "2 + 2" },
      });
      const plan = Plan.create({
        id: "plan-1",
        operationId: "contract-op-aggregate",
        steps: [step1],
      });

      const obs1 = Observation.create({
        observationId: "obs-1",
        operationId: "contract-op-aggregate",
        stepId: "step-1",
        status: "SUCCESS",
        durationMs: 42,
        toolCalls: 1,
        output: { result: 4 },
      });

      const dec1 = Decision.create({
        operationId: "contract-op-aggregate",
        type: "COMPLETE",
        rationale: "Goal achieved with step-1",
        output: { finalValue: 4 },
      });

      repo.save(op, {
        plan,
        observations: [obs1],
        decisions: [dec1],
      });

      const record = repo.findRecordById("contract-op-aggregate");
      assert.ok(record);
      assert.ok(record.plan);
      assert.equal(record.plan.id, "plan-1");
      assert.equal(record.plan.steps.length, 1);
      assert.equal(record.plan.steps[0]?.action, "calculate");
      assert.equal(record.observations.length, 1);
      assert.equal(record.observations[0]?.observationId, "obs-1");
      assert.equal(record.decisions.length, 1);
      assert.equal(record.decisions[0]?.type, "COMPLETE");
    });

    await t.test("5. Immutability & Isolation: mutating caller objects does not mutate persisted data", () => {
      const repo = factory();
      const op = createSampleOperation("contract-op-immutable");
      repo.save(op);

      const retrieved1 = repo.findById("contract-op-immutable");
      assert.ok(retrieved1);

      // Advancing retrieved domain object produces new instance, does not alter repo until save()
      const advanced = retrieved1.start().recordStep({ elapsedMs: 100 });
      assert.equal(advanced.consumption.stepsUsed, 1);

      const retrieved2 = repo.findById("contract-op-immutable");
      assert.ok(retrieved2);
      assert.equal(retrieved2.consumption.stepsUsed, 0);
      assert.equal(retrieved2.status, "SUBMITTED");
    });

    await t.test("6. Listing: lists all operations and records", () => {
      const repo = factory();
      const opA = createSampleOperation("contract-list-a", "agent-a");
      const opB = createSampleOperation("contract-list-b", "agent-b");

      repo.save(opA);
      repo.save(opB);

      const list = repo.list();
      assert.equal(list.length, 2);
      assert.ok(list.some((o) => o.id === "contract-list-a"));
      assert.ok(list.some((o) => o.id === "contract-list-b"));

      const records = repo.listRecords();
      assert.equal(records.length, 2);
      assert.ok(records.some((r) => r.operation.id === "contract-list-a"));
      assert.ok(records.some((r) => r.operation.id === "contract-list-b"));
    });

    await t.test("7. CQRS Query Projections: listProjections returns lightweight summaries", () => {
      const repo = factory();
      const op = createSampleOperation("contract-proj-1");
      repo.save(op);

      const projections = repo.listProjections();
      assert.equal(projections.length, 1);
      const proj = projections[0];
      assert.ok(proj);
      assert.equal(proj.id, "contract-proj-1");
      assert.equal(proj.agentId, "agent-1");
      assert.equal(proj.status, "SUBMITTED");
      assert.equal(proj.budget.maxSteps, 5);
      assert.equal(proj.consumption.stepsUsed, 0);
    });

    await t.test("8. CQRS Query Projections: findDetailById returns deep projection", () => {
      const repo = factory();
      const op = createSampleOperation("contract-detail-1");

      const step = PlanStep.create({
        id: "step-detail-1",
        order: 1,
        action: "probe",
        input: { target: "system" },
      });
      const plan = Plan.create({
        id: "plan-detail-1",
        operationId: "contract-detail-1",
        steps: [step],
      });
      const obs = Observation.create({
        observationId: "obs-detail-1",
        operationId: "contract-detail-1",
        stepId: "step-detail-1",
        status: "SUCCESS",
        durationMs: 12,
        toolCalls: 0,
      });
      const dec = Decision.create({
        operationId: "contract-detail-1",
        type: "COMPLETE",
        rationale: "Probe completed successfully",
      });

      repo.save(op, {
        plan,
        observations: [obs],
        decisions: [dec],
      });

      const detail = repo.findDetailById("contract-detail-1");
      assert.ok(detail);
      assert.equal(detail.id, "contract-detail-1");
      assert.ok(detail.plan);
      assert.equal(detail.plan.id, "plan-detail-1");
      assert.equal(detail.plan.steps.length, 1);
      assert.equal(detail.observations.length, 1);
      assert.equal(detail.observations[0]?.observationId, "obs-detail-1");
      assert.equal(detail.decisions.length, 1);
      assert.equal(detail.decisions[0]?.type, "COMPLETE");

      assert.equal(repo.findDetailById("unknown-detail-id"), undefined);
    });
  });
}

// Execute contract test suite against InMemoryOperationRepository
runOperationRepositoryContractTests(
  "InMemoryOperationRepository",
  () => new InMemoryOperationRepository()
);
