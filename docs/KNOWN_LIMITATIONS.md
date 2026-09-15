# Known Limitations & Transparency Audit — AI Operating Platform (v1.0)

## 1. Executive Statement
To ensure strict technical credibility and avoid unverified marketing claims, this document explicitly details the boundaries, mock components, synthetic datasets, and future evolution targets of the **AI Operating Platform**.

---

## 2. Component-by-Component Classification

### 1. Model Providers & Inference
* **Current Local State (`IMPLEMENTED / AVAILABLE`):** The platform uses an internal `StubModelGateway` that produces deterministic JSON responses to enable offline execution, rapid CI testing, and zero-cost local reproducibility.
* **Designed Extension (`DESIGNED / PLANNED`):** Direct API adapters for OpenAI (`gpt-4o`), Anthropic (`claude-3-5-sonnet`), and local Ollama are architected via the `ModelProviderPort`, but disabled by default in local test runs to avoid requiring external billing keys.

### 2. Relational Persistence & Durability
* **Current Local State (`IMPLEMENTED / OPERATIONAL`):** Embedded SQLite 3 database operating with Write-Ahead Logging (WAL), transaction runner, schema migrations (V1 $\to$ V2 $\to$ V3), and proven restart durability.
* **Production Target (`DESIGNED / PLANNED`):** Scaled distributed relational storage (PostgreSQL / Aurora) via the existing hexagonal `PersistencePort` abstraction.

### 3. Asynchronous Worker Execution
* **Current Local State (`IMPLEMENTED / AVAILABLE`):** `WorkerQueuePort` backed by `InMemoryWorkerQueue` with lease renewal heartbeats, exponential retries, and dead-letter queue containment.
* **Production Target (`DESIGNED / PLANNED`):** Distributed message broker adapters (Redis Streams / RabbitMQ / SQS).

### 4. Augmented Reality & 3D Hardware Integration
* **Current Local State (`IMPLEMENTED / OPERATIONAL`):** Deterministic local AR sizing engine, anatomical coordinate transformations, SemVer asset governance (`urn:tentaciones:ar:*`), and avatar profiles (*Nova*, *Sora*, *Mateo*).
* **Production Target (`DESIGNED / PLANNED`):** Direct WebXR / Apple QuickLook native device camera streaming.

### 5. Commerce Catalog & Pricing Data
* **Current Local State (`IMPLEMENTED / AVAILABLE`):** Deterministic synthetic footwear and apparel catalog in Tentaciones AI Commerce for reliable end-to-end integration testing.
* **Production Target (`DESIGNED / PLANNED`):** Real-time webhook synchronization with commercial platforms (Shopify, Magento, VTEX).
