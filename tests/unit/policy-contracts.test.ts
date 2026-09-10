import assert from "node:assert/strict";
import test from "node:test";
import { PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

test("InMemoryPolicyGateway evaluates ALLOW decision", async () => {
  const gateway = new InMemoryPolicyGateway(() => ({
    allowed: true,
    policyId: "custom-allow",
  }));

  const context: PolicyContext = {
    traceId: "tr-1",
    operationType: "TOOL",
    resourceId: "calculator",
    agentId: "foundation-agent",
    riskLevel: "LOW",
    metadata: {},
  };

  const decision = await gateway.evaluate(context);
  assert.equal(decision.allowed, true);
  assert.equal(decision.policyId, "custom-allow");
});

test("InMemoryPolicyGateway evaluates DENY decision with explicit reason and code", async () => {
  const gateway = new InMemoryPolicyGateway((ctx) => {
    if (ctx.riskLevel === "CRITICAL") {
      return {
        allowed: false,
        policyId: "risk-blocker",
        code: "POLICY_RISK_TOO_HIGH",
        reason: "Critical risk tools require human operator approval",
      };
    }
    return { allowed: true, policyId: "default-allow" };
  });

  const lowRiskDecision = await gateway.evaluate({
    traceId: "tr-1",
    operationType: "TOOL",
    resourceId: "safe_tool",
    riskLevel: "LOW",
    metadata: {},
  });
  assert.equal(lowRiskDecision.allowed, true);

  const criticalRiskDecision = await gateway.evaluate({
    traceId: "tr-2",
    operationType: "TOOL",
    resourceId: "dangerous_tool",
    riskLevel: "CRITICAL",
    metadata: {},
  });
  assert.equal(criticalRiskDecision.allowed, false);
  assert.equal(criticalRiskDecision.code, "POLICY_RISK_TOO_HIGH");
  assert.equal(criticalRiskDecision.reason, "Critical risk tools require human operator approval");
});
