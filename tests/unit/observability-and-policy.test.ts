import assert from "node:assert/strict";
import test from "node:test";
import { SequentialOrchestrator } from "../../src/application/orchestration/sequential-orchestrator.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { PolicyDeniedError, PolicyEvaluationError } from "../../src/domain/policy/policy.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryAuditLog } from "../../src/infrastructure/observability/in-memory-audit-log.js";
import { EventObservabilitySubscriber } from "../../src/infrastructure/observability/event-observability-subscriber.js";
import { InMemoryMetricsCollector } from "../../src/infrastructure/observability/in-memory-metrics-collector.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

const context = ExecutionContext.create("trace", "execution", "task");
const model = { generate: async () => ({ provider: "stub", model: "stub", output: { answer: 1 } }) };
const tools = { execute: async () => ({ output: {} }) };
test("observability records a correlated timeline and metrics", async () => {
  const events = new InMemoryEventPublisher(); const audit = new InMemoryAuditLog(); const metrics = new InMemoryMetricsCollector(); const observer = new EventObservabilitySubscriber(audit, metrics); events.subscribe(observer.handle.bind(observer));
  const orchestrator = new SequentialOrchestrator(model, tools, events, new InMemoryPolicyGateway());
  await orchestrator.execute({ execution: context, operations: [{ kind: "MODEL", id: "model", model: "stub", input: { prompt: "x" } }] });
  assert.ok(audit.findByTraceId("trace").length > 0); assert.ok(audit.findByExecutionId("execution").length > 0); assert.ok(audit.findByOperationId("model").length > 0); assert.equal(metrics.value("policy.allowed"), 1); assert.equal(metrics.value("operations.completed"), 1);
});
test("policy denial prevents the operation and is observable", async () => {
  let calls = 0; const events = new InMemoryEventPublisher(); const policy = new InMemoryPolicyGateway(() => ({ allowed: false, policyId: "deny-model", reason: "not approved" }));
  const orchestrator = new SequentialOrchestrator({ generate: async () => { calls += 1; return { provider: "stub", model: "stub", output: {} }; } }, tools, events, policy);
  const result = await orchestrator.execute({ execution: context, operations: [{ kind: "MODEL", id: "blocked", model: "stub", input: { prompt: "x" } }] });
  assert.equal(result.status, "FAILED"); assert.equal(calls, 0); assert.ok(result.operations[0]?.error instanceof PolicyDeniedError); assert.ok(events.events.some((item) => item.type === "policy.denied"));
});
test("policy evaluation failures fail closed", async () => {
  const policy = new InMemoryPolicyGateway(() => { throw new Error("policy unavailable"); }); const result = await new SequentialOrchestrator(model, tools, new InMemoryEventPublisher(), policy).execute({ execution: context, operations: [{ kind: "MODEL", id: "blocked", model: "stub", input: { prompt: "x" } }] });
  assert.ok(result.operations[0]?.error instanceof PolicyEvaluationError);
});
test("observability subscriber failure is isolated by event publication", () => {
  const events = new InMemoryEventPublisher(); events.subscribe(() => { throw new Error("audit unavailable"); }); let delivered = 0; events.subscribe(() => { delivered += 1; });
  events.publish({ id: "event", type: "execution.started", occurredAt: new Date(), traceId: "trace", aggregateId: "execution", executionId: "execution", taskId: "task", payload: {} }); assert.equal(delivered, 1);
});
