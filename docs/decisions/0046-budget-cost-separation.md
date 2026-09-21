# ADR 0046: Budget and Cost Separation

## Status
Accepted

## Context
As the AI Operating Platform evolves, we need to distinguish between limiting resource consumption (budgeting) and tracking financial impact (cost accounting). Mixing these concerns makes it difficult to implement soft limits, post-execution accounting (where we only know the tokens after the call), and precise attribution.

## Decision
We will separate cost accounting from resource governance:
1. `TeamResourceBudget` remains responsible for Resource Governance (hard limits).
2. `CostRecord` and `CostSummary` will handle Cost Accounting (tracking actual consumption and financial attribution).
3. We define distinct `BudgetLimitType`s:
   - **HARD**: Pre-execution gate (DENY if exceeded).
   - **SOFT**: Warning threshold.
   - **ACCOUNTED**: Post-execution accounting (may overshoot, like tokens).
   - **RESERVED**: Pre-reserved quota (reserve → execute → settle → release).

## Consequences
- Better financial attribution.
- Proper handling of metrics that are only known after execution (e.g., tokens).
- Clear separation of concerns between domain layers.
