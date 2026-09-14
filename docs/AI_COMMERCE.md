# AI Commerce Intelligence Architecture

## 1. Overview & Strategic Positioning

Tentaciones AI Commerce acts as the primary external application demonstrating real-world consumption of the **AI Operating Platform**.

Core Invariant:
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

Tentaciones maintains complete ownership of:
- Product catalog data, prices, inventory, variants, and cart storage.
- User session state, checkout funnel, payment gateways, and visual rendering.

The AI Operating Platform provides:
- Intent parsing & natural language product discovery (`product.discovery`).
- Dynamic catalog ranking & explainable recommendations (`product.recommendation`).
- Multi-attribute product comparison matrix calculation (`product.compare`).
- Cart assistance, bundling, and threshold evaluation (`cart.assistance`).
- Zero hallucination of pricing or stock levels by design.

---

## 2. Capability Matrix

| Capability | Scope | Input | Output | SOT |
| :--- | :--- | :--- | :--- | :--- |
| `product.discovery` | Catalog Discovery | Natural language query | Extracted terms & intent | Platform API |
| `product.recommendation` | Personalization | User preferences, history, candidate items | Scored items + explainability | Platform API |
| `product.compare` | Evaluation | 2+ product definitions | Attribute matrix & differentiators | Platform API |
| `cart.assistance` | Cart Optimization | Current cart state & items | Thresholds, addons, eligibility | Platform API |

---

## 3. Resilience & Fallback Hierarchy

1. **AI Operating Platform (Live Mode)**: Authenticated via API key, executes through Agent Runtime and Model Gateway with structured deterministic outputs and audit events in SQLite WAL EventStore.
2. **Local AI Engine Fallback**: Fallback on authentication or scope restriction error (`UNAUTHORIZED` / `FORBIDDEN`).
3. **Traditional Commerce Fallback**: Offline degradation (`PLATFORM_UNAVAILABLE`) preserving standard search and cart capabilities without crashing the commerce application.
