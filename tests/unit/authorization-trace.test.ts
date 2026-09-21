import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthorizationTrace } from "../../src/domain/security/authorization-trace.js";

describe("AuthorizationTrace", () => {
  it("should capture all fields", () => {
    const trace: AuthorizationTrace = {
      traceId: "trace-123",
      timestamp: new Date(),
      principal: {
        id: "user-1",
        type: "HUMAN",
        tenantId: "t-1",
      },
      organization: {
        organizationId: "org-1",
        areaId: "area-1",
        teamId: "team-1",
      },
      agent: {
        agentId: "agent-1",
        status: "ACTIVE",
      },
      resource: {
        type: "TASK",
        id: "task-1",
        action: "EXECUTE",
      },
      policy: {
        decision: "ALLOW",
        reason: "Matched user role",
        evaluatedRoles: ["admin"],
        matchedPermissions: ["task.execute"],
      },
      budget: {
        teamId: "team-1",
        status: "WITHIN_LIMITS",
        remainingExecutions: 100,
      },
      result: "AUTHORIZED",
      durationMs: 15,
    };

    assert.strictEqual(trace.traceId, "trace-123");
    assert.strictEqual(trace.result, "AUTHORIZED");
    assert.ok(trace.agent);
    assert.ok(trace.budget);
  });

  it("should work with minimal fields", () => {
    const trace: AuthorizationTrace = {
      traceId: "trace-456",
      timestamp: new Date(),
      principal: {
        id: "service-1",
        type: "SERVICE",
        tenantId: "t-1",
      },
      resource: {
        type: "API",
        action: "READ",
      },
      policy: {
        decision: "ALLOW",
        reason: "Public endpoint",
        evaluatedRoles: ["anonymous"],
        matchedPermissions: ["*"],
      },
      result: "AUTHORIZED",
      durationMs: 2,
    };

    assert.strictEqual(trace.traceId, "trace-456");
    assert.strictEqual(trace.result, "AUTHORIZED");
    assert.strictEqual(trace.agent, undefined);
    assert.strictEqual(trace.budget, undefined);
  });

  it("should capture DENY decisions with reason", () => {
    const trace: AuthorizationTrace = {
      traceId: "trace-789",
      timestamp: new Date(),
      principal: {
        id: "user-2",
        type: "HUMAN",
        tenantId: "t-2",
      },
      resource: {
        type: "TASK",
        action: "DELETE",
      },
      policy: {
        decision: "DENY",
        reason: "Missing required permission task.delete",
        evaluatedRoles: ["viewer"],
        matchedPermissions: [],
      },
      result: "DENIED",
      durationMs: 5,
    };

    assert.strictEqual(trace.result, "DENIED");
    assert.strictEqual(trace.policy.decision, "DENY");
    assert.strictEqual(trace.policy.reason, "Missing required permission task.delete");
  });
});
