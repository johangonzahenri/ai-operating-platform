# Case Study: Tentaciones AI Commerce on AI Operating Platform (v1.1.0)

## 1. Executive Summary & Problem Statement
**Tentaciones AI Commerce** is an enterprise footwear, fashion, and virtual fitting room retailer. Integrating Generative AI into modern e-commerce traditionally introduces severe architectural risks:
- **Domain Entanglement:** LLM prompt strings hardcoding business logic and manipulating store databases directly.
- **Inventory & Pricing Hallucination:** Models recommending out-of-stock items, hallucinating non-existent variants, or quoting arbitrary prices.
- **Brittle Resilience:** Storefronts crashing when external LLM endpoints experience latency spikes or 429 rate limits.
- **Security & Privacy Exposure:** Customer measurements and proprietary transaction data leaking into public inference logs.

---

## 2. Technical Solution
By integrating with the **AI Operating Platform (v1.1.0)** via typed contracts (`TentacionesPlatformAdapter` and `TentacionesCommerceEngine`), Tentaciones retains absolute ownership of the commercial domain while offloading intelligence, governance, and auditability to the platform:

```text
+-------------------------------------------------------------------------+
|                  TENTACIONES AI COMMERCE STORE DOMAIN                   |
|  Products • Variants • Stock Integrity • Cart • Orders • Webpay Demo   |
+-------------------------------------------------------------------------+
                                     |
                          Typed Platform Adapter
                                     |
                                     v
+-------------------------------------------------------------------------+
|                          AI OPERATING PLATFORM                          |
|  AI Discovery • Smart Ranking • 3D/AR Fitting • Sizing • Cart Assistant |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     GOVERNANCE & DURABLE LEDGER                         |
|  Default-Deny RBAC • Monotonic Event Store • Crash Recovery Diagnostics |
+-------------------------------------------------------------------------+
```

---

## 3. Architecture & Implementation

### 3.1 Domain Ownership
* **Tentaciones Domain:** Responsible for product catalog lifecycle, SKU inventory counts, pricing tiers, cart state machines, customer orders, and checkout execution.
* **Platform Domain:** Responsible for agent scheduling, prompt intent extraction, LLM fallback routing, AR URN validation, and immutable event auditing.

### 3.2 AI Product Discovery & Recommendations
* **Natural Language Search:** Interprets natural language queries in Spanish (e.g., *"zapatillas negras para correr"*, *"vestido elegante para una cena"*, *"chaqueta impermeable"*) and extracts structured search terms without hallucinating catalog items.
* **Explainable Ranking:** Recommends companion and alternative products based strictly on verified catalog attributes (sport category, materials, price bracket).

### 3.3 3D / AR Virtual Fitting Room & Sizing
* **Asset URNs:** Standardized URN resolution (`urn:tentaciones:ar:<category>:<productSlug>`) adhering to SemVer specifications.
* **Calibrated Avatar Profiles:** Pre-calibrated 3D anthropometric models (*Nova*, *Sora*, *Mateo*) and custom measurements.
* **Deterministic Sizing Engine:** Converts foot length and width into exact shoe sizes with transparent confidence ratings.

### 3.4 Security & Tenant Isolation
* **Authenticated Calling:** Authenticated with dedicated service keys (`key-tentaciones`) under tenant `tenant-tentaciones`.
* **Scoped Capabilities:** Restricted strictly to registered grants: `product.discovery`, `product.recommendation`, `product.compare`, `cart.assistance`, `ar.fitting_room`.
* **Zero Secret Leakage:** Sanitization of payment tokens and customer credentials before event persistence.

### 3.5 Observability & Durability
* **Correlated Trace:** Single `traceId` links search query, model generation, sizing calculation, and cart assistant response.
* **SQLite WAL v3:** All operations append to the monotonic durable ledger.

---

## 4. End-to-End User Journey Walkthrough
```text
1. Customer queries: "Quiero unas zapatillas negras para correr y ver cómo me quedan"
   ↓
2. TentacionesCommerceEngine dispatches task to Platform API with capability 'product.discovery'
   ↓
3. CoreRuntime matches intent -> Ranks 'Pro Carbon Racer Marathon Shoes' (SKU: PCR-BLK-42, 149.99 EUR)
   ↓
4. Virtual Fitting Room resolves asset URN 'urn:tentaciones:ar:footwear:pro-carbon-racer' for avatar 'Nova'
   ↓
5. Sizing Engine evaluates 25.5 cm foot length -> Recommends Size 40
   ↓
6. Customer adds item to cart -> Cart Assistant validates subtotal (149.99 EUR) and confirms Free Shipping
   ↓
7. Customer completes checkout via Webpay Demo -> Order confirmed and persisted in durable ledger
```

---

## 5. Verified Results & Metrics
* **0 Inventory Hallucinations:** 100% of recommended items originate from authentic stock.
* **Deterministic Fallback:** Immediate graceful degradation to traditional 2D search if the AI platform is offline.
* **Latency Profile:** Sub-50ms intent extraction and local AR resolution in Demo and Local modes.

---

## 6. Known Limitations & Future Roadmap
* **Known Limitations:**
  - Token tracking in usage summaries requires a live tokenizer provider.
  - Disk storage quota monitoring is reported via tenant plan limits.
* **Future Roadmap:**
  - Dynamic multi-angle 3D avatar photogrammetry.
  - Multi-lingual conversational shopping assistant supporting voice input.
