# Chapter 6: External Applications & Consumers

## 1. External Integration Pattern

The AI Operating Platform is designed to power external software systems, microservices, and enterprise applications.

External applications MUST interact with the platform exclusively via the **Platform API** (`/api/v1`). They must NEVER:
- Import domain entities or value objects (`Task`, `Execution`, `ExecutionContext`).
- Import internal application use cases or strategies directly.
- Access in-memory or persisted repositories directly.

## 2. Case Study: AI Commerce Application

### 2.1 Scenario
An enterprise e-commerce platform requires AI capabilities to calculate complex order taxes and generate structured order fulfillment summaries.

### 2.2 Integration Flow
1. The external `commerce-order-service` constructs an orchestration payload containing:
   - Operation 1: A `TOOL` operation using `calculator` to sum line items and compute applicable VAT.
   - Operation 2: A `MODEL` operation using `stub-model` bound to the output of Operation 1 to generate a receipt narrative.
2. The payload is sent via HTTP POST to `http://127.0.0.1:3000/api/v1/orchestrate`.
3. The platform processes the request through the unified `CoreRuntime`, enforcing fail-closed policy governance, emitting correlated audit events, and returning the aggregated output.
4. The commerce service receives the structured response:
```json
{
  "taskId": "task-uuid",
  "executionId": "exec-uuid",
  "status": "COMPLETED",
  "operations": [
    { "operationId": "tax-calc", "kind": "TOOL", "status": "COMPLETED", "output": { "value": 119 } },
    { "operationId": "receipt-gen", "kind": "MODEL", "status": "COMPLETED", "output": { "echoedInput": { "orderTotal": 119 } } }
  ],
  "output": { "echoedInput": { "orderTotal": 119 } }
}
```

## 3. Preparation for v0.8

In **v0.8**, the platform will introduce:
- Autonomous agent execution loops.
- Stateful long-term conversation sessions and memory compaction.
- Dynamic multi-agent team orchestration.
- Advanced application gateway authentication and token-based rate limiting.

All external consumer contracts established in v0.7 under `/api/v1` will remain backward-compatible as these capabilities are added.
