import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { CostRecord, CostSummary, BudgetLimitType } from "../../src/domain/billing/cost-accounting.js";

describe("Cost Accounting", () => {
  test("creates a valid CostRecord", () => {
    const record: CostRecord = {
      id: "cost_123",
      traceId: "trace_456",
      executionId: "exec_789",
      tenantId: "t_1",
      teamId: "tm_1",
      timestamp: new Date(),
      provider: "openai",
      model: "gpt-4",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: {
        currency: "USD",
        amount: 0.003,
      },
      budgetImpact: {
        dimension: "tokens",
        consumed: 150,
        limitType: "ACCOUNTED" as BudgetLimitType,
      }
    };
    
    assert.equal(record.totalTokens, 150);
    assert.equal(record.estimatedCost?.amount, 0.003);
    assert.equal(record.budgetImpact.limitType, "ACCOUNTED");
  });

  test("creates a valid CostSummary", () => {
    const summary: CostSummary = {
      tenantId: "t_1",
      teamId: "tm_1",
      period: { from: new Date(), to: new Date() },
      totalRecords: 1,
      totalTokens: 150,
      totalEstimatedCost: 0.003,
      byProvider: {
        openai: { tokens: 150, cost: 0.003, calls: 1 }
      },
      byModel: {
        "gpt-4": { tokens: 150, cost: 0.003, calls: 1 }
      }
    };
    
    assert.equal(summary.totalRecords, 1);
    assert.equal(summary.byProvider.openai.tokens, 150);
    assert.equal(summary.byModel["gpt-4"].cost, 0.003);
  });
});
