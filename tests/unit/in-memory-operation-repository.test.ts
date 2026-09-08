import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOperationRepository } from "../../src/infrastructure/persistence/in-memory-operation-repository.js";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { Observation } from "../../src/domain/autonomy/observation.js";
import { Decision } from "../../src/domain/autonomy/decision.js";
import { OperationProjection } from "../../src/application/ports/query-ports.js";

test("InMemoryOperationRepository Suite", async (t) => {
  await t.test("Saves, retrieves, and updates an AutonomousOperation", () => {
    const repo = new InMemoryOperationRepository();
    const budget = AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 10000,
      maxToolCalls: 2,
    });
    const op = AutonomousOperation.create({
      id: "op-test-1",
      agentId: "test-agent",
      objective: "Test repository persistence",
      budget,
    });

    assert.equal(repo.list().length, 0);
    repo.save(op);
    assert.equal(repo.list().length, 1);

    const retrieved = repo.findById("op-test-1");
    assert.ok(retrieved);
    assert.equal(retrieved.id, "op-test-1");
    assert.equal(retrieved.agentId, "test-agent");
    assert.equal(retrieved.objective, "Test repository persistence");
    assert.equal(retrieved.status, "SUBMITTED");
  });

  await t.test("Returns undefined for non-existent operation", () => {
    const repo = new InMemoryOperationRepository();
    const result = repo.findById("op-non-existent");
    assert.equal(result, undefined);
  });

  await t.test("Lists all operations and projections", () => {
    const repo = new InMemoryOperationRepository();
    const budget = AutonomyBudget.create({
      maxSteps: 3,
      maxDurationMs: 5000,
      maxToolCalls: 1,
    });

    const op1 = AutonomousOperation.create({
      id: "op-1",
      agentId: "agent-1",
      objective: "Objective 1",
      budget,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    const op2 = AutonomousOperation.create({
      id: "op-2",
      agentId: "agent-2",
      objective: "Objective 2",
      budget,
      createdAt: new Date("2026-01-01T10:01:00Z"),
    });

    repo.save(op1);
    repo.save(op2);

    const list = repo.list();
    assert.equal(list.length, 2);

    const projections = repo.listProjections();
    assert.equal(projections.length, 2);
    assert.ok(projections.some((p: OperationProjection) => p.id === "op-1"));
    assert.ok(projections.some((p: OperationProjection) => p.id === "op-2"));
  });

  await t.test("Preserves defensive copies and snapshot integrity (immutability)", () => {
    const repo = new InMemoryOperationRepository();
    const budget = AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 10000,
      maxToolCalls: 2,
    });
    const op = AutonomousOperation.create({
      id: "op-immutability-test",
      agentId: "agent-1",
      objective: "Immutability test",
      budget,
    });

    repo.save(op);

    const retrieved1 = repo.findById("op-immutability-test");
    assert.ok(retrieved1);
    assert.equal(retrieved1.consumption.stepsUsed, 0);

    // Creating updated entity via recordStep produces new immutable instance
    const runningOp = retrieved1.start();
    const consumedOp = runningOp.recordStep({ elapsedMs: 50 });
    // Saved record is unchanged until explicitly saved
    const retrieved2 = repo.findById("op-immutability-test");
    assert.ok(retrieved2);
    assert.equal(retrieved2.consumption.stepsUsed, 0);

    // Save updated entity
    repo.save(consumedOp);
    const retrieved3 = repo.findById("op-immutability-test");
    assert.ok(retrieved3);
    assert.equal(retrieved3.consumption.stepsUsed, 1);
    assert.equal(retrieved3.status, "RUNNING");
  });

  await t.test("findDetailById returns complete observation and decision history", () => {
    const repo = new InMemoryOperationRepository();
    const budget = AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 10000,
      maxToolCalls: 2,
    });
    const op = AutonomousOperation.create({
      id: "op-detail-test",
      agentId: "agent-1",
      objective: "Detail test",
      budget,
    });

    const obs = Observation.create({
      observationId: "obs-1",
      operationId: "op-detail-test",
      stepId: "step-1",
      status: "SUCCESS",
      durationMs: 50,
      toolCalls: 0,
    });

    const dec = Decision.create({
      operationId: "op-detail-test",
      type: "COMPLETE",
      rationale: "Goal achieved successfully",
    });

    repo.save(op, {
      observations: [obs],
      decisions: [dec],
    });

    const detail = repo.findDetailById("op-detail-test");
    assert.ok(detail);
    assert.equal(detail.id, "op-detail-test");
    assert.equal(detail.observations.length, 1);
    assert.equal(detail.decisions.length, 1);
    assert.equal(detail.decisions[0]?.type, "COMPLETE");
  });
});
