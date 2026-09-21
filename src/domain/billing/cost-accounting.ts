/**
 * Cost Accounting — Tracks actual resource consumption with financial attribution.
 * 
 * Separates three concerns:
 * 1. RESOURCE GOVERNANCE: hard limits enforced by TeamResourceBudget
 * 2. COST ACCOUNTING: token/call tracking with price estimation (this file)
 * 3. FINANCIAL GOVERNANCE: billing, invoicing, payment (FUTURE)
 */

export interface CostRecord {
  readonly id: string;
  readonly traceId: string;
  readonly executionId: string;
  readonly tenantId: string;
  readonly teamId: string;
  readonly agentId?: string;
  readonly timestamp: Date;
  
  // Provider details
  readonly provider: string;       // 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'stub'
  readonly model: string;          // 'gpt-4' | 'claude-3' | 'gemini-pro' etc.
  
  // Token consumption
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  
  // Cost estimation (optional - depends on provider reporting)
  readonly estimatedCost?: {
    readonly currency: string;     // 'USD'
    readonly amount: number;       // e.g. 0.0023
    readonly pricePerInputToken?: number;
    readonly pricePerOutputToken?: number;
  };
  
  // Budget context
  readonly budgetImpact: {
    readonly dimension: string;    // 'modelCalls' | 'tokens' | 'toolCalls'
    readonly consumed: number;
    readonly limitType: 'HARD' | 'SOFT' | 'ACCOUNTED';
  };
}

export interface CostSummary {
  readonly tenantId: string;
  readonly teamId: string;
  readonly period: { from: Date; to: Date };
  readonly totalRecords: number;
  readonly totalTokens: number;
  readonly totalEstimatedCost: number;
  readonly byProvider: Record<string, { tokens: number; cost: number; calls: number }>;
  readonly byModel: Record<string, { tokens: number; cost: number; calls: number }>;
}

// Budget limit type clarification
export type BudgetLimitType = 
  | 'HARD'       // Pre-execution gate: DENY if exceeded (executions, modelCalls, toolCalls, autonomousSteps)
  | 'SOFT'       // Warning threshold: alert at 80/90%, continue until hard limit
  | 'ACCOUNTED'  // Post-execution accounting: may overshoot (durationMs, tokens)
  | 'RESERVED';  // Pre-reserved quota: reserve → execute → settle → release
