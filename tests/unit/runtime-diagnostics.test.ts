import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventStore } from "../../src/infrastructure/persistence/in-memory-event-store.js";
import { RuntimeDiagnosticsService } from "../../src/application/diagnostics/runtime-diagnostics.js";

test("RuntimeDiagnosticsService Unit Suite", async (t) => {
  await t.test("reconstructs completed execution trace with duration and causal chain", () => {
    const store = new InMemoryEventStore();
    const service = new RuntimeDiagnosticsService(store);

    const tStart = new Date("2026-09-09T12:00:00.000Z");
    const tComplete = new Date("2026-09-09T12:00:01.500Z");

    store.append({
      eventId: "e-ctx",
      eventType: "context.created",
      aggregateType: "context",
      aggregateId: "ctx-1",
      traceId: "tr-diag-1",
      correlationId: "tr-diag-1",
      occurredAt: tStart,
      payload: { taskId: "task-1", executionId: "exec-1" },
    });

    store.append({
      eventId: "e-task-created",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-1",
      traceId: "tr-diag-1",
      correlationId: "tr-diag-1",
      occurredAt: tStart,
      payload: { status: "CREATED", agentId: "agent-alpha" },
    });

    store.append({
      eventId: "e-exec-started",
      eventType: "execution.started",
      aggregateType: "execution",
      aggregateId: "exec-1",
      traceId: "tr-diag-1",
      correlationId: "tr-diag-1",
      causationId: "task-1",
      occurredAt: tStart,
      payload: { status: "RUNNING" },
    });

    store.append({
      eventId: "e-exec-completed",
      eventType: "execution.completed",
      aggregateType: "execution",
      aggregateId: "exec-1",
      traceId: "tr-diag-1",
      correlationId: "tr-diag-1",
      causationId: "task-1",
      occurredAt: tComplete,
      payload: { status: "COMPLETED" },
    });

    store.append({
      eventId: "e-task-completed",
      eventType: "task.completed",
      aggregateType: "task",
      aggregateId: "task-1",
      traceId: "tr-diag-1",
      correlationId: "tr-diag-1",
      occurredAt: tComplete,
      payload: { status: "COMPLETED" },
    });

    const diag = service.getTraceDiagnostics("tr-diag-1");
    assert.ok(diag);
    assert.equal(diag.traceId, "tr-diag-1");
    assert.equal(diag.rootTaskId, "task-1");
    assert.equal(diag.executionId, "exec-1");
    assert.equal(diag.agentId, "agent-alpha");
    assert.equal(diag.status, "COMPLETED");
    assert.equal(diag.isCrashRecovered, false);
    assert.equal(diag.durationMs, 1500);
    assert.equal(diag.timeline.length, 5);
    assert.ok(diag.causalChain.length >= 2);
  });

  await t.test("reconstructs failed execution trace with root cause and error message", () => {
    const store = new InMemoryEventStore();
    const service = new RuntimeDiagnosticsService(store);

    const tStart = new Date("2026-09-09T12:00:00.000Z");
    const tFail = new Date("2026-09-09T12:00:00.250Z");

    store.append({
      eventId: "e-task-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-fail",
      traceId: "tr-fail",
      correlationId: "tr-fail",
      occurredAt: tStart,
      payload: { status: "CREATED" },
    });

    store.append({
      eventId: "e-exec-fail",
      eventType: "execution.failed",
      aggregateType: "execution",
      aggregateId: "exec-fail",
      traceId: "tr-fail",
      correlationId: "tr-fail",
      causationId: "task-fail",
      occurredAt: tFail,
      payload: { status: "FAILED", code: "EXECUTION_FAILURE", message: "Network connection refused" },
    });

    const diag = service.getTraceDiagnostics("tr-fail");
    assert.ok(diag);
    assert.equal(diag.status, "FAILED");
    assert.equal(diag.failureCode, "EXECUTION_FAILURE");
    assert.equal(diag.timeline[1]?.message, "Network connection refused");
    assert.equal(diag.isCrashRecovered, false);
  });

  await t.test("detects crash recovery diagnostics", () => {
    const store = new InMemoryEventStore();
    const service = new RuntimeDiagnosticsService(store);

    store.append({
      eventId: "rec-1",
      eventType: "execution.failed",
      aggregateType: "execution",
      aggregateId: "exec-crashed",
      traceId: "tr-crashed",
      correlationId: "tr-crashed",
      occurredAt: new Date("2026-09-09T12:05:00.000Z"),
      payload: { status: "FAILED", code: "CRASH_RECOVERY", reason: "crash_recovery" },
    });

    store.append({
      eventId: "rec-2",
      eventType: "task.failed",
      aggregateType: "task",
      aggregateId: "task-crashed",
      traceId: "tr-crashed",
      correlationId: "tr-crashed",
      occurredAt: new Date("2026-09-09T12:05:00.000Z"),
      payload: { status: "FAILED", code: "CRASH_RECOVERY", reason: "crash_recovery" },
    });

    const crashDiagnostics = service.getCrashRecoveryDiagnostics();
    assert.equal(crashDiagnostics.length, 2);
    assert.equal(crashDiagnostics[0]?.code, "CRASH_RECOVERY");
    assert.equal(crashDiagnostics[0]?.reason, "crash_recovery");
    assert.equal(crashDiagnostics[0]?.terminalStatus, "FAILED");

    const traceDiag = service.getTraceDiagnostics("tr-crashed");
    assert.ok(traceDiag);
    assert.equal(traceDiag.isCrashRecovered, true);
    assert.equal(traceDiag.failureReason, "crash_recovery");
  });

  await t.test("returns undefined for unknown trace ID", () => {
    const store = new InMemoryEventStore();
    const service = new RuntimeDiagnosticsService(store);

    const diag = service.getTraceDiagnostics("non-existent");
    assert.equal(diag, undefined);
  });

  await t.test("reconstructs task history timeline", () => {
    const store = new InMemoryEventStore();
    const service = new RuntimeDiagnosticsService(store);

    store.append({
      eventId: "th-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-h",
      traceId: "tr-h",
      correlationId: "tr-h",
      payload: { status: "CREATED" },
    });

    store.append({
      eventId: "th-2",
      eventType: "task.started",
      aggregateType: "task",
      aggregateId: "task-h",
      traceId: "tr-h",
      correlationId: "tr-h",
      payload: { status: "RUNNING" },
    });

    const history = service.getTaskHistory("task-h");
    assert.equal(history.length, 2);
    assert.equal(history[0]?.status, "CREATED");
    assert.equal(history[1]?.status, "RUNNING");
  });
});
