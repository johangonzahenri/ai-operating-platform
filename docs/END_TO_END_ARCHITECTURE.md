# End-to-End Application Architecture & Verification

## 1. The Core Paradigm

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

```text
┌────────────────────────────────────────────────────────┐
│               EXTERNAL APPLICATION                     │
│            (Tentaciones AI Commerce)                   │
│   - Catalog, Cart, Pricing, Checkout, AR UI            │
│   - Consumes via TentacionesPlatformAdapter            │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP REST /api/platform/v1
                           ▼
┌────────────────────────────────────────────────────────┐
│                  PLATFORM API                          │
│   - API Key Authentication & Tenant Binding            │
│   - ApplicationRequestContext capability authorization │
│   - HTTP Status & Error Mapping                        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                  AGENT RUNTIME                         │
│   - Task Execution & Orchestration                     │
│   - LLM Planner & Model Gateway (zero hallucination)   │
│   - Tool Registry & Security Governance                │
│   - Durable SQLite WAL Event Store & Telemetry         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Golden User Journey Trace

1. **Intent**: User expresses unstructured need in Spanish ("Quiero zapatillas negras para maratón").
2. **Platform Invocation**: `TentacionesPlatformAdapter` calls `POST /api/v1/tasks` with capability `product.discovery`.
3. **Execution**: Core Agent Runtime executes deterministic plan -> extracts terms -> emits lifecycle events.
4. **Recommendation**: Calls `product.recommendation` -> ranks real candidates without inventing items.
5. **AR Fitting Room**: Resolves `urn:tentaciones:ar:footwear:runner-black-pro` for avatar `Nova`.
6. **Sizing Engine**: Evaluates body measurements -> recommends exact size with fit rationale.
7. **Comparison**: Compares real product specs side-by-side.
8. **Cart Assistance**: Calculates cart threshold, qualifies for free shipping, and suggests matching accessories.
9. **Observability**: Complete audit trace preserved in SQLite WAL EventStore matching single correlation `traceId`.
