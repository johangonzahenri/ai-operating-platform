# Changelog

All notable changes to the AI Operating Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

- **Spare Parts Search & Comparison: Phase 151 — Post-Release Certification Evidence Hardening & Governance Reconciliation (`AOP-SPAREPARTS-SEARCH`)**:
  - **Live Gateway Authentication Hardening (H-01)**: Executed direct HTTP 401 negative authentication certification tests with missing and invalid API keys on live platform instance (`enforceSecurity: true`) and validated HTTP 200 with sanitized responses on valid credentials.
  - **Scoped Authorization & Tenant Isolation (H-02)**: Enforced `spareparts.search` scope check in HTTP router (`POST /spareparts/search`), rejecting tokens with insufficient scopes (e.g. `tasks.read`) with HTTP 403, and rejecting tenant/application mismatches.
  - **OpenAPI 3.1 Contract Parity (H-03)**: Added `/spareparts/search` operation and associated schemas (`SparePartsSearchRequest`, `SparePartsSearchResponse`, `VehicleSearchInput`, `SparePartsSearchCluster`, `TransparentPriceComparison`, `PriceComparisonOfferItem`, `SourceExecutionReport`, `FitmentVerificationResult`) to canonical `docs/openapi.yaml`. Updated certification harness to validate OpenAPI 3.1 file structure, schemas, and endpoints.
  - **SSE Telemetry Protocol Semantics (H-04)**: Verified real streaming protocol semantics (`text/event-stream`), monotonic `Last-Event-ID`, deterministic deduplication, and isolation ensuring SSE transport degradation never blocks core search operations.
  - **Three-Tier Release Status Semantics (H-05)**: Formalized certification status type `SparePartsReleaseStatus` (`MVP_CERTIFIED`, `MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS`, `MVP_NOT_CERTIFIED`) with automated assessment logic.
  - **Master Work Plan & Documentation Reconciliation (H-06, H-07)**: Reconciled Phase 150 headers, opened and completed Phase 151 (Tasks 151.1–151.5) in `docs/MASTER_WORK_PLAN.md`, and updated `PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md`, `SPARE_PARTS_MVP_CERTIFICATION.md`, and `ROADMAP_MASTER.md`.
  - Expanded `tests/unit/spare-parts-mvp-certification.test.ts` to 23 comprehensive tests (1865 tests PASS across all 121 suites with 0 failures, 0 regressions).

- **Spare Parts Search & Comparison: Phase 150 — MVP Certification, Security & Release Governance (`AOP-SPAREPARTS-SEARCH`)**:
  - **9-Dimension Formal Certification Harness**: Implemented `runSparePartsCertification`, `formatSparePartsCertificationReport`, and `SPARE_PARTS_APPLICATION_MANIFEST` in `src/application/spareparts/spare-parts-certification.ts` verifying all 9 architectural dimensions (Identity, Health, Authentication, Authorization, Capabilities, Version, Observability, OpenAPI 3.1, and Server-Sent Events).
  - **Golden Journey E2E Validation**: Certified the end-to-end journey from User Intent to Side-by-Side Comparison with strict preservation of truth invariants (`UNKNOWN ≠ 0`, `UNKNOWN ≠ COMPATIBLE`, `CONFLICT ≠ FIT`, `NOT_FIT ≠ UNKNOWN`).
  - **DOM & Security Purity**: Audited and confirmed 100% compliance with 0 `.innerHTML`, 0 `.outerHTML`, 0 `eval`, and 0 `document.write` across all frontend assets, with fail-closed XSS escaping and tenant isolation.
  - **Third-Party Source Governance**: Verified source registry metadata, rate limit policies, timeout bounds, and explicit provenance tracking (`sourceId`, `productUrl`, `lastCheckedAt`).
  - Added dedicated unit test suite `tests/unit/spare-parts-mvp-certification.test.ts` (13 tests PASS, 1855 tests passing across all 121 suites with 0 failures, 0 regressions, 0 skipped, 0 todo).
  - Documented in `docs/SPARE_PARTS_MVP_CERTIFICATION.md`.

- **Multi-Agent Runtime Hardening: Track 4 — Official Enterprise MCP Server & Driving Adapter (`AOP-MULTIAGENT-HARDENING`)**:
  - **Official Enterprise MCP Server Driving Adapter (GAP-07)**: Integrated the official Model Context Protocol (MCP) TypeScript SDK v2 (`@modelcontextprotocol/server@2.1.0`) in `src/platform/mcp/`. Exposes governed platform capabilities (Tools, Prompts, Resources) to external IDEs (Antigravity, Cursor, VS Code, Claude Desktop) and autonomous AI agents while strictly preserving the Core Engine hexagonal boundary (zero third-party dependencies in Core/Domain, no direct SQLite or repository access).
  - **Dual Protocol Support**: Implemented native modern protocol revision `2026-07-28` (`server/discover`, request-scoped `_meta` envelope) and legacy `2024-11-05` (`initialize`) fallback serving via official `createMcpHandler(factory)` and `McpServer`.
  - **Methods & Capabilities**: Implemented handlers for `server/discover`, `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, and `prompts/list`.
  - **Governance & Security Pipeline**: Direct delegation to `ToolInvocationRuntime` enforcing RBAC authorization, agent rate limiting, team budget check, schema validation, idempotency caching, and taint boundary isolation. Connected to `HITLBridgePort` suspending sensitive/critical invocations non-blockingly (`status: "SUSPENDED_WAITING_FOR_APPROVAL"` with `resumptionToken`).
  - **Hardened MCP Transports**: Implemented official Stdio transport (`serveMcpStdio`) utilizing `serveStdio` and `StdioServerTransport` from `@modelcontextprotocol/server/stdio` over line-delimited streams (`stdout` strictly reserved for JSON-RPC, `stderr` for diagnostics) and HTTP transport (`handleMcpHttpRequest`) bridging `node:http` to Web Standard `createMcpHandler().fetch()` with streaming response.
  - **Safe Error Mapping**: Created `McpErrorMapper` mapping domain and runtime errors into standard MCP error codes (`-32600` to `-32005`) with correlation IDs (`traceId`), completely sanitizing internal stack traces and secrets.
  - Added dedicated unit test suite `tests/unit/platform-mcp-server.test.ts` (30 tests PASS, 1842 tests passing across all 120 suites with 0 failures, 0 regressions, 0 skipped, 0 todo).
  - Documented in `docs/decisions/0051-official-enterprise-mcp-server-adapter.md`, `docs/MCP_SERVER_ARCHITECTURE.md`, `docs/MCP_SECURITY_MODEL.md`, `docs/MCP_CONFORMANCE_MATRIX.md`, and `docs/ARCHITECTURAL_HARDENING_AUDIT.md`.

- **Multi-Agent Runtime Hardening: Track 3 — Evidence Cryptographic Integrity, HITL Async Bridge & W3C Trace Context (`AOP-MULTIAGENT-HARDENING`)**:
  - **Evidence Cryptographic Integrity & Hash Chain (GAP-06)**: Extended `EvidenceExportManifestProps` and `EvidenceExportManifest` with `sequenceNumber`, `previousPackageHashSha256`, and canonical `packageHashSha256`. Genesis packages strictly require `sequenceNumber = 1` and `previousPackageHashSha256 = null`. Created `EvidenceHashChainVerifier.verifyChain()` detecting sequence breaks, missing/deleted packages, tenant mismatches, and manifest tampering fail-closed. Updated `EvidenceExportService` to automatically manage and increment sequential hash chains per tenant.
  - **HITL Async Bridge & Suspension/Resumption (GAP-08)**: Created protocol-neutral domain model `HITLSuspensionRecord` with states (`SUSPENDED`, `WAITING_FOR_INPUT`, `WAITING_FOR_APPROVAL`, `RESUMED`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`), secure resumption tokens (`rst-...`), and expiration checks. Enforced Separation of Duties (SoD) fail-closed (`SelfApprovalError`) preventing requester or producer from approving or rejecting their own action. Created `HITLBridgePort` and reference `InMemoryHITLBridge` adapter with replay protection, tenant boundary isolation, and domain audit events (`hitl.*`).
  - **W3C Trace Context & OpenTelemetry Interoperability (GAP-09)**: Implemented domain parser, validator, and serializer `W3CTraceContext` adhering to W3C Trace Context specification (`traceparent` version `00`, non-zero 32-hex `trace-id`, non-zero 16-hex `parent-id`, 2-hex `trace-flags`; `tracestate` member key/value validation, 512-character limit, 32 member maximum, and child span context generation). Integrated into `RequestContext`, `extractRequestContextFromHeaders`, and `@ai-platform/client`.
  - Added dedicated unit test suite `tests/unit/evidence-hash-chain-hitl-w3c.test.ts` (23 tests PASS, 1812 tests passing across all 111 suites with 0 regressions, 0 skipped, 0 todo).

- **Multi-Agent Runtime Hardening: Track 2 — Taint Tracking, Data Isolation & Saga Compensation (`AOP-MULTIAGENT-HARDENING`)**:
  - **Taint Tracking, Provenance & Trust Boundary Enforcement (GAP-01)**: Created `TaintedValue<T>` primitive with four trust statuses (`TRUSTED`, `UNTRUSTED_EXTERNAL`, `UNTRUSTED_USER`, `DERIVED_UNTRUSTED`). Implemented conservative derivation logic `derive()`, auditable transformation `sanitize()` with full historic provenance retention, fail-closed control-plane validation (`assertNoTaintedControlKeys`, `assertUntrustedNotControlPlane`) preventing malicious injection into `tenantId`, `principalId`, or `approvalToken`, automated `TaintedValue` wrapping for tools with `openWorldHint: true` in `ToolInvocationRuntime`, and prompt injection isolation wrapping (`formatModelInputWithTaintEnvelopes`) in `GovernedModelRouter`.
  - **Saga / Compensation for Multi-Step Plan Executions (GAP-05)**: Formalized `CompensableTool` contract, `isCompensableTool` type guard, and `SagaExecution` 8-state coordinator (`NOT_STARTED`, `RUNNING`, `FORWARD_FAILED`, `COMPENSATING`, `COMPENSATED`, `COMPENSATION_FAILED`, `IN_DOUBT`, `COMPLETED`). Integrated deterministic reverse LIFO compensation execution in `PlanExecutionEngine`, excluding read-only steps, strictly preserving both forward and compensation errors simultaneously, and handling compensation timeouts/network failures deterministically as `IN_DOUBT`.
  - Added dedicated unit test suite `tests/unit/taint-tracking-and-saga-compensation.test.ts` (19 tests PASS, 1789 tests passing across all 107 suites with 0 regressions, 0 skipped, 0 todo).

- **Multi-Agent Runtime Hardening: Track 1 — Tool Governance, Idempotency & Rate Limiting (`AOP-MULTIAGENT-HARDENING`)**:
  - **Tool Idempotency & Replay Protection (GAP-02)**: Integrated `IdempotencyStore` into `ToolInvocationRuntime.invokeTool()`. Enforces fail-closed duplicate execution prevention (`ToolConcurrentExecutionConflictError` on `IN_PROGRESS`), payload fingerprint mismatch detection (`ToolIdempotencyConflictError`), and deterministic replay caching (`metadata.cachedReplay = true`, `durationMs = 0`). Key space isolated strictly by `tool:${toolId}:v${toolVersion}:${idempotencyKey}` under `tenantId` and `principalId`.
  - **Agent Velocity & Rate Limiting (GAP-03)**: Created `AgentRateLimiterPort` and `InMemoryAgentRateLimiter` token-bucket sliding-window adapter. Enforces agent-level and tenant-level velocity limits and independent destructive tool quotas prior to execution and idempotency checks, throwing `ToolRateLimitedError` with `retryAfterMs`.
  - **Tool Semantic & Schema Versioning (GAP-04)**: Enriched `ToolDefinition` with `schemaVersion?: string` and `executionHints?: ToolExecutionHints` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). Implemented deterministic hint auto-derivation in `InMemoryToolRegistry` based on execution mode and risk level.
  - Added dedicated unit test suite `tests/unit/tool-governance-idempotency-ratelimit.test.ts` (16 tests PASS).

---

## [1.4.0] - 2026-09-21 (Multi-Enterprise Governance, Governed Runtime, Mandate Reconciliation & Compliance Export)

- **Deep Platform Integration & Reactive SSE Telemetry (`AOP-SPAREPARTS-SEARCH`, Phase 149)**:
  - Developed satellite client adapter `SparePartsPlatformAdapter` and reactive stream manager `SparePartsTelemetryManager` in `src/application/spareparts/spare-parts-platform-adapter.ts` consuming `@ai-platform/client` with zero internal domain leakage.
  - Implemented exponential backoff reconnection, monotonic `Last-Event-ID` tracking, and deterministic event deduplication.
  - Registered `spareparts.search` capability in `PLATFORM_CAPABILITY_CATALOG` (`src/domain/application/application-contract.ts`) with canonical endpoint `POST /api/v1/spareparts/search`.
  - Instrumenting `POST /spareparts/search` in `src/platform/api/http-router.ts` to emit lifecycle telemetry events (`spareparts.search.started`, `spareparts.source.completed`, `spareparts.search.completed`, `spareparts.search.failed`) to `EventStreamAdapter`.
  - Connected reactive telemetry state and live event feed into Web UX `SparePartsView` with strict 0 `.innerHTML` DOM manipulation.
  - Created dedicated unit and integration test suite `tests/unit/spare-parts-platform-integration.test.ts` (1754 tests PASS / 0 FAIL across 100 suites).
  - Published official technical specification in `docs/SPARE_PARTS_PLATFORM_INTEGRATION.md`.

- **Spare Parts Web UX, Reactive Filters & Side-by-Side Comparison (`AOP-SPAREPARTS-SEARCH`, Phase 148)**:
  - Built unified application facade `SparePartsFacade` in `src/application/spareparts/spare-parts-facade.ts` coordinating multi-source search orchestration, canonical clustering, parametric fitment verification, and price comparison.
  - Exposed HTTP REST endpoint `POST /spareparts/search` in `src/platform/api/http-router.ts` governed by `tool.invoke` permissions.
  - Implemented vanilla Single-Page Application view `SparePartsView` in `src/platform/web/spare-parts-view.js` with vehicle selector bar, quick vehicle presets, multi-source telemetry chips, reactive sidebar filters, offer cards, and side-by-side comparison modal/drawer.
  - Enforced strict 0 `.innerHTML`, 0 `outerHTML`, 0 `insertAdjacentHTML`, and 0 `eval` security audit across all web source files in `src/platform/web/`.
  - Enforced truth preservation invariant (`UNKNOWN ≠ 0`), rendering undisclosed shipping/tax costs as `TOTAL_UNKNOWN` with full calculation breakdown.
  - Implemented fail-closed fitment enforcement, marking `NOT_FIT` products with incompatibility alerts and disqualifying them from side-by-side comparison.
  - Added modern responsive CSS styling in `src/platform/web/spare-parts.css` adhering to platform design system and bilingüe navigation tabs in `src/platform/web/index.html` and `src/platform/web/app.js`.
  - Added dedicated test suite in `tests/unit/spare-parts-web-ux.test.ts` (1744 tests PASS / 0 FAIL across 99 suites).
  - Published official technical specification in `docs/SPARE_PARTS_WEB_UX.md`.

- **Price Intelligence, Reputation & Total Cost Engine (`AOP-SPAREPARTS-SEARCH`, Phase 147)**:
  - Implemented domain model for cost breakdown, total acquisition cost (*Landed Cost*) and seller trust score in `src/domain/spareparts/price-intelligence.ts` (`NormalizedPrice`, `ShippingCostItem`, `TaxCostItem`, `ImportCostItem`, `TotalAcquisitionCost`, `SellerTrustScore`, `TransparentPriceComparison`).
  - Developed `SellerReputationService` in `src/application/spareparts/seller-reputation-service.ts` evaluating seller reliability deterministically across 5 explicit weighted factors while maintaining strict separation between platform source trust and direct seller trustworthiness.
  - Implemented `PriceIntelligenceEngine` in `src/application/spareparts/price-intelligence-engine.ts` supporting traceable FX conversion, unit price normalization by pack size, discount deduction, and total acquisition cost computation enforcing `UNKNOWN ≠ 0` fail-closed rules.
  - Built transparent multi-source comparison engine filtering out-of-stock listings and integrating fitment verification verdicts (`NOT_FIT` exclusion).
  - Added dedicated unit test suite in `tests/unit/price-intelligence.test.ts` (1735 tests PASS / 0 FAIL across 98 suites).
  - Published official technical specification in `docs/SPARE_PARTS_PRICE_INTELLIGENCE.md`.

- **Deterministic Fitment Verification Engine (`AOP-SPAREPARTS-SEARCH`, Phase 146)**:
  - Implemented domain model for compatibility verdicts and parametric evaluation in `src/domain/spareparts/fitment-verdict.ts` (`FitmentVerdict`: `FIT`, `NOT_FIT`, `UNKNOWN`, `CONFLICT`; `FitmentParameterResult`, `FitmentConflictDetail`, `buildVehicleFitmentKey`).
  - Developed `FitmentVerificationEngine` in `src/application/spareparts/fitment-verification-engine.ts` with parameter-by-parameter evaluation (make, model, year, engine, generation, market), fail-closed handling of missing critical parameters, and explicit isolation of contradicting source evidence.
  - Implemented lossless evidence propagation, preserving all `StructuredClaimEvidence` without allowing trust scores to override mandatory parametric fitment constraints.
  - Added dedicated unit test suite in `tests/unit/fitment-verification-engine.test.ts` (1721 tests PASS / 0 FAIL across 97 suites).
  - Published official technical specification in `docs/SPARE_PARTS_FITMENT_VERIFICATION.md`.

- **Normalization, Deduplication & Cross-Reference Engine (`AOP-SPAREPARTS-SEARCH`, Phase 145)**:
  - Implemented domain model for entity clustering and deduplication in `src/domain/spareparts/part-cluster.ts` (`CanonicalPartCluster`, `MatchClassification`, `DuplicateMatchResult`, `generateClusterId`, `createPartCluster`).
  - Developed `PartNormalizationService` in `src/application/spareparts/part-normalization-service.ts` providing deterministic part number stripping (preserving `rawValue`), canonical brand mapping with market tiers, listing URL tracking sanitation, and seller name normalization.
  - Built rule-based `DuplicateDetectionService` in `src/application/spareparts/duplicate-detection-service.ts` evaluating `EXACT_DUPLICATE`, `PROBABLE_MATCH`, `DISTINCT`, and `CONFLICT` classifications with fail-closed protection against accidental merges.
  - Implemented `CrossReferenceService` in `src/application/spareparts/cross-reference-service.ts` maintaining bidirectional OEM <-> Aftermarket relationships and resolving connected components of equivalence graphs.
  - Created `PartClusteringEngine` in `src/application/spareparts/part-clustering-engine.ts` orchestrating deterministic Disjoint-Set grouping, ensuring order-independence and idempotency while preserving structured evidence losslessly.
  - Added dedicated unit test suite in `tests/unit/normalization-deduplication-crossref.test.ts` (1709 tests PASS / 0 FAIL across 96 suites).
  - Published official technical specification in `docs/SPARE_PARTS_NORMALIZATION_DEDUP_CROSS_REFERENCE.md`.

- **Multi-Source Automotive Search & Specialized Agent Routing (`AOP-SPAREPARTS-SEARCH`, Phase 144)**:
  - Implemented deterministic intent classification and task decomposition in `src/domain/spareparts/search-intent.ts` (`SearchIntentType`, `SearchTask`, `SearchBudget`).
  - Created `SourceSelectionService` in `src/application/spareparts/source-selection-service.ts` with multi-criteria candidate selection and explicit inclusion/exclusion reason tracking.
  - Developed `MultiSourceSearchOrchestrator` in `src/application/spareparts/multi-source-search-orchestrator.ts` enabling parallel multi-source execution, per-source timeout races, failure isolation (`SUCCESS`, `PARTIAL_SUCCESS`, `NO_RESULTS`, `FAILED`), and verification agent integration.
  - Implemented configurable test fixture connectors in `src/infrastructure/spareparts/fixture-connectors.ts` for deterministic simulation of success, empty results, timeouts, rate limits, and blocks.
  - Published technical specification in `docs/SPARE_PARTS_MULTI_SOURCE_SEARCH.md`.
  - Added dedicated unit test suite in `tests/unit/multi-source-search-orchestrator.test.ts` (1698 tests PASS / 0 FAIL across 95 suites).

- **Canonical Automotive Domain Model for Spare Parts Search & Comparison (`AOP-SPAREPARTS-SEARCH`, Phase 143)**:
  - Formalized canonical vehicle domain (`VehicleProfile`, `VehicleSpecification`, `VehicleVariant`, `VehicleIdentifier`) and normalization rules in `src/domain/spareparts/vehicle.ts`.
  - Implemented part number value objects, type taxonomy, and normalization stripping noise/brand prefixes in `src/domain/spareparts/part-number.ts`.
  - Developed canonical `Part` aggregate with category hierarchy, condition, position, and strict separation between `Brand` and `Manufacturer` in `src/domain/spareparts/part.ts`.
  - Created `CrossReference` entity supporting `EXACT`, `EQUIVALENT`, `REPLACEMENT`, `SUPERSEDES` and confidence scoring in `src/domain/spareparts/cross-reference.ts`.
  - Built `Fitment` aggregate with parametric rules evaluation (`matchesFitmentRule`), provenance, and `CONFLICT` status preservation in `src/domain/spareparts/fitment.ts`.
  - Established commerce aggregates (`Product`, `Listing`, `Seller`, `SellerReputation`, `ProductRating`, `Price`, `TotalCost`, `Availability`, `ShippingInfo`, and `Offer`) in `src/domain/spareparts/product-offer.ts`.
  - Defined search query contracts (`SparePartsSearchQuery`, `SearchCriteria`, `NormalizedSearchInput`) in `src/domain/spareparts/search-query.ts`.
  - Published canonical domain model documentation in `docs/SPARE_PARTS_DOMAIN_MODEL.md`.
  - Added dedicated unit test suite in `tests/unit/spareparts-domain-model.test.ts` (1688 tests PASS / 0 FAIL across 91 suites).

- **Automotive Source Discovery & Intelligence Layer (`AOP-SPAREPARTS-DISCOVERY`, Phase 142)**:
  - Implemented domain model for automotive sources in `src/domain/spareparts/automotive-source.ts` (`AutomotiveSource`, `AutomotiveSourceType`, `AutomotiveAccessMethod`, `AutomotiveSourceStatus`, `SourceDataCapabilities`, `SourceAccessPolicy`, `SourceCoverage`, and `SourceTrustRating`).
  - Created `InMemoryAutomotiveSourceRegistry` in `src/application/spareparts/automotive-source-registry.ts` with multi-criteria filtering by region, vehicle make, part category, fitment, price, and trust rating.
  - Defined canonical source dataset `CANONICAL_AUTOMOTIVE_SOURCES` in `src/infrastructure/spareparts/canonical-sources.ts` profiling 7 verified real-world sources (3 Chilean, 3 International, 1 OEM Catalog reference).
  - Defined connector interface `AutomotiveSourceConnector` and base implementation in `src/application/spareparts/automotive-source-connector.ts` emitting `SourceProductOffer` with `StructuredClaimEvidence`.
  - Created comprehensive source map documentation in `docs/AUTOMOTIVE_SOURCE_MAP.md`.
  - Added dedicated unit test suite in `tests/unit/automotive-source-discovery.test.ts` (1669 tests PASS / 0 FAIL across 80 suites).

- **Multi-Agent Web AI & Agent Capability Platform (`AOP-MULTI-AGENT-WEB-AI`, Phase 141)**:
  - Formalized 8-type agent taxonomy (`NATIVE`, `MODEL`, `WEB`, `RESEARCH`, `CODE`, `AUTOMATION`, `VERIFICATION`, `EXTERNAL`) in `src/domain/agent/agent-taxonomy.ts`.
  - Implemented `WebToolGateway` in `src/application/tools/web-tool-gateway.ts` with strict domain whitelist/blacklist controls, rate limiting, and structured evidence claims.
  - Built `ExternalAgentGateway` in `src/application/agent/external-agent-gateway.ts` with decoupled adapters for OpenAI Codex CLI, OpenHands, and Aider pair programming without runtime core lock-in.
  - Developed `AgentEvaluationHarness` in `src/application/agent/agent-evaluation-harness.ts` for reproducible benchmarking with multi-score metrics (task success, schema correctness, evidence completeness, latency, and lifecycle binding).
  - Published canonical architecture specification in `docs/MULTI_AGENT_PLATFORM.md` and enterprise use-case matrix across 13 business areas in `docs/BUSINESS_AGENT_USE_CASES.md`.
  - Added dedicated unit test suite in `tests/unit/multi-agent-capability-platform.test.ts` (1664 tests PASS / 0 FAIL across 75 suites).

- **Master Work Plan Synchronization & PROJ-02 Product Charter (`AOP-MASTER-WORK-PLAN-V2`, Phase 140)**:
  - Synchronized Master Work Plan in `docs/MASTER_WORK_PLAN.md` incorporating active Phase 140 and preliminary product roadmap (Fases 141-149).
  - Established canonical Agent Operating Protocol in `docs/AGENT_OPERATING_PROTOCOL.md`, `.agent/rules/agent-operating-protocol.md`, and `AGENTS.md` for permanent agent workspace memory.
  - Formalized Product Charter for `PROJ-02-SPAREPARTS` (*Spare Parts Search & Comparison*) in `docs/PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md` (multi-store comparison, deterministic fitment verification, price intelligence, reputation trust score, and source registry).
  - Reconciled application portfolio registries (`docs/AI_APPLICATION_PORTFOLIO_MAP.md`, `docs/APPLICATION_PORTFOLIO.md`, `docs/APPLICATION_REGISTRY.md`) and updated `docs/ROADMAP_MASTER.md` with `AOP-SPAREPARTS-SEARCH` in `PLANNED` status.

- **Master Work Plan & Dynamic Traceability Governance (`AOP-MASTER-WORK-PLAN`, Phase 139)**:
  - Canonical operational planning and dynamic traceability system established in `docs/MASTER_WORK_PLAN.md`.
  - Hierarchical 3-level indexing convention (`X / X.Y / X.Y.Z`) preserving historical immutability across phases, scheduled tasks, and unpredictable change adjustments.
  - Formal taxonomy of record types (`PHASE`, `TASK`, `CHANGE`, `DECISION`, `BLOCKER`, `EVIDENCE`) and explicit separation between technical and operational states.
  - Global mandatory phase close checklist (15 quality gates) governing execution from Phase 140 onwards.
  - Automated integrity validator `scripts/master-work-plan-check.mjs` integrated into `npm run plan:check`, `scripts/docs-check.mjs`, and `npm run check`.
  - Reconciled initiatives in `docs/ROADMAP_MASTER.md` and cleaned up resolved SSE streaming entries in `docs/TECHNICAL_DEBT.md`.

- **Application Integration Certification & Reference Consumer (`AOP-APP-CERTIFICATION`, Phase 138)**:
  - Canonical reference consumer application implemented in `examples/reference-consumer/` demonstrating the platform as a consumable product ("Platform as a Product").
  - Scaffolding generated and validated via `create-aop-app init reference-consumer` and verified with `create-aop-app doctor` (7/7 checks PASS).
  - Production-grade typed adapter `ReferenceConsumerPlatformAdapter` wrapping `@ai-platform/client` for health probes, metadata discovery, capability listing, and task execution.
  - Real-time reactive event ingestion `LiveEventManager` with ring buffer (200 events), automatic reconnection, `Last-Event-ID` tracking, and client-side secret redaction.
  - Official 9-point certification engine `runReferenceAppCertification()` evaluating Identity, Health, Authentication, Authorization, Capabilities, Version compatibility, Observability/traceId propagation, OpenAPI 3.1 contract compliance, and SSE live stream ingestion.
  - Zero-dependency Vanilla JS web UI served via HTTP Router at `/reference-app` and `/reference-consumer` (0 `innerHTML`, 0 `eval`, full DOM API security purity).
  - Comprehensive 3-tier test suites: `tests/unit/reference-consumer-unit.test.ts`, `tests/integration/reference-consumer-integration.test.ts`, and `tests/contract/reference-consumer-certification.test.ts` (1656 tests PASS / 0 FAIL across 74 suites).
  - Official technical guide: `docs/REFERENCE_APPLICATION.md`.

- **Real-Time Event Streaming via Server-Sent Events (`AOP-REALTIME-SSE`, Phase 137)**:
  - Resilient, low-latency operational event stream endpoint `GET /api/v1/events/stream` based on W3C Server-Sent Events.
  - Core streaming engine `EventStreamAdapter` supporting dynamic filtering by `tenantId`, `applicationId`, `agentId`, `executionId`, `traceId`, and `eventType`.
  - Deterministic historical replay using `Last-Event-ID` header and `lastEventId` query parameter backed by `SqliteEventStore.query()`.
  - Automatic sensitive data redaction (`sanitizePayload`) protecting passwords, bearer tokens, and API credentials.
  - Heartbeat timer (15s interval) and comprehensive backpressure / connection limits (100 global / 20 tenant).
  - SDK integration in `@ai-platform/client` with typed `client.events.stream()` and `client.events.subscribe()` methods.
  - End-to-end contract and integration test suites: `tests/contract/sse-event-stream.test.ts` and `tests/integration/sse-event-stream.test.ts` (1646 tests PASS / 0 FAIL).
  - Official technical guide: `docs/SSE_EVENT_STREAMING.md`.

- **Platform API OpenAPI 3.1 Contract Productization (`AOP-API-OPENAPI`, Phase 136)**:
  - Canonical OpenAPI 3.1.0 formal specification (`docs/openapi.yaml`) covering 73 routes, 90 unique operationIds, and 138 component references across all 11 core platform domains.
  - Complete request/response schemas for Tasks, Executions, Agents, Autonomous Operations, Workflows, Solutions, Organizations, Multi-Enterprise Portfolios, Governance Evidence, Credentials, Applications, and Business Devices.
  - Standard error envelope (`Error`) and status codes (400, 401, 403, 404, 409, 413, 415, 429, 500, 503).
  - Security schemes for `apiKeyAuth` (SHA-256 hashed API key) and `bearerAuth` (asymmetric RS256/ES256 JWT) with scope enforcement.
  - Automated contract test suite `tests/contract/openapi-contract.test.ts` ensuring zero unresolved references and 1:1 SDK alignment.
  - Structural validator script `scripts/validate-openapi.mjs` and npm script `npm run api:check`.
  - Official technical guide: `docs/OPENAPI_GUIDE.md`.

- **Application Factory Developer CLI (`create-aop-app`, Phase 135)**:
  - Developer-facing scaffolding and certification CLI `create-aop-app` (`src/platform-client/create-aop-app.ts` / `npm run create-aop-app`) converting `ApplicationFactoryEngine` into an automated developer experience.
  - Commands implemented: `init <app-id>` (full governed scaffolding with template, capabilities, tenant, plan, dry-run, force, and json flags), `templates` (factory catalog inspection), `capabilities` (platform capability catalog with dependency graph resolution), `validate <path>` (manifest validation), and `doctor <path>` (7-point certification harness).
  - Canonical alignment: resolved legacy `@ai-platform/sdk` package reference to `@ai-platform/client` across all generated adapters.
  - Comprehensive unit and integration test suite `tests/unit/create-aop-app-cli.test.ts`.
  - Official technical guide: `docs/APPLICATION_FACTORY_CLI.md`.
- **Developer Platform & SDK Productization (`AOP-DEV-PLATFORM`, Phase 125)**:
  - `@ai-platform/client` typed SDK productization: unified error mapping (`PlatformClientError`), deterministic retry engine for idempotent methods and requests with `Idempotency-Key` or `X-Idempotency-Key` headers (HTTP 500-504 & network codes `ECONNRESET`/`ETIMEDOUT`), and distributed trace ID extraction (`x-trace-id`).
  - Developer CLI (`src/platform-client/cli.ts` / `npm run cli:dev`) supporting `health`, `info`, `agents`, `tasks`, `applications`, and `governance export`.
  - Comprehensive technical specifications: `docs/DEVELOPER_PLATFORM.md`, `docs/SDK_GUIDE.md`, and `docs/APPLICATION_INTEGRATION_GUIDE.md`.
  - Suite `tests/unit/platform-client-sdk.test.ts` with 23 new test assertions (Total test suite: **1623 tests PASS / 0 FAIL** across 74 suites).
- **Governance & Compliance Evidence Export (`AOP-COMPLIANCE-EXPORT`, Phase 78 / ADR 0050)**:
  - Deterministic export package generator across 9 scopes: `TENANT`, `PORTFOLIO`, `ENTERPRISE`, `WORKFLOW`, `EXECUTION`, `MANDATE`, `APPROVAL`, `RECONCILIATION`, `AUDIT_TRAIL`.
  - Zero state mutation invariant: reading, packaging, and sealing evidence causes 0 state changes.
  - Multi-tenant boundary isolation and fail-closed access control.
  - Automated sensitive data redaction via `SensitiveDataRedactor` and deterministic canonical JSON serialization (`canonicalJsonStringify`).
  - Cryptographic SHA-256 integrity seal in immutable export manifest (`EvidenceExportManifest.integritySeal`).
  - Query bounds enforcement: `maxRecords <= 1000`, `dateRange <= 90 days`, `fromDate <= toDate`.
  - REST endpoint `POST /api/v1/governance/evidence/export` with idempotency support and SDK methods `client.exportEvidence()` / `client.governance.exportEvidence()`.
- **Governed Mandate Reconciliation & Runtime Consistency (`AOP-MANDATE-RECONCILIATION-DAEMON`, Phase 77 / ADR 0046)**:
  - Deterministic evaluation engine (`evaluateMandateReconciliation()`) handling mandate expirations, revocations, cancellations, scope restrictions, and autonomy reductions.
  - Zero retroactive mutation: terminal states (`COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REJECTED`, `BUDGET_EXHAUSTED`) are strictly preserved as immutable historical truth.
  - In-flight execution adaptation: `QUEUED` steps are cancelled, `RUNNING` steps are safely paused for human oversight or cancelled, and pending `AWAITING_APPROVAL` requests are re-evaluated fail-closed.
  - `MandateReconciliationService` with optimistic concurrency control (`concurrencyVersion`), idempotency caching (`idempotencyKey`), and periodic scanning daemon (`reconcileExpiredMandates`).
  - REST endpoints `POST /api/v1/mandates/:id/reconcile` and `POST /api/v1/mandates/reconcile-expired`.
  - SDK methods `client.portfolios.reconcileMandate()` and `client.portfolios.reconcileExpiredMandates()`.
- **Multi-Enterprise Operational Runtime & Governed Execution (Phase 76 / ADR 0045)**:
  - Canonical governance-to-execution chain ($\text{Portfolio} \to \text{Enterprise} \to \text{Objective} \to \text{Workflow} \to \text{Mandate} \to \text{Execution} \to \text{Metric Aggregation}$).
  - Cross-Enterprise default-deny enforcement and 3-way Segregation of Duties (Executor $\neq$ Verifier $\neq$ Approver).
- **Multi-Enterprise Governance & Portfolio Operating Model (Phase 75 / ADR 0044)**:
  - Enterprise portfolio aggregates (`EnterprisePortfolio`, `EnterpriseGovernanceMandate`, `PortfolioObjective`).
  - Deterministic mathematical metric rollup (0 LLM estimation).

## [1.3.0] - 2026-09-19 (Enterprise Authentication, Credential Governance, Autonomous Operations & Control Plane)

### Added
- **Enterprise Authentication, API Authorization & Credential Governance (`AOP-AUTH`)**:
  - `ApiCredential` aggregate root with zero-plaintext storage: SHA-256 `keyHash`, safe `keyPrefix`, raw keys (`aop_live_*`) revealed strictly once upon creation/rotation.
  - Server-side verification of principal types (`SERVICE`, `HUMAN`, `AGENT`, `TOOL`), explicit capability scopes (`tasks.read`, `tasks.create`, `credentials.manage`, etc.), and expiration/revocation lifecycles.
  - Fail-closed tenant and application reconciliation: `TENANT_MISMATCH` and `APPLICATION_MISMATCH` header validation preventing cross-tenant access.
  - SQLite WAL persistence for credentials in table `api_credentials` with composite indices and OCC.
  - Credential governance in Web Control Plane (`#tab-security`) with zero-innerHTML DOM safety and one-time secret modal.
  - `PlatformClient` SDK credential management namespace (`client.credentials`).
  - Strict secret scrubbing (`Authorization: [REDACTED]`) in structured logging and forensic audit trails.
- **Autonomous Operations Runtime & Continuous Business Governance**:
  - `AutonomousOperationsRuntime` daemon orchestrator with state transitions (`STOPPED`, `RUNNING`, `PAUSED`, `SAFETY_HALTED`).
  - `AutonomousTrigger` domain aggregate with multi-modal trigger policies (`SCHEDULED`, `EVENT_DRIVEN`, `THRESHOLD`, `MANUAL`).
  - `RuntimeLease` concurrency lease mechanism with Optimistic Concurrency Control (OCC) and heartbeat expiration.
  - Continuous business safety engine with `SafetyBreakerTrip` circuit breaker and instant emergency stop.
- **Web Control Plane Integration (`#tab-operations` & `#tab-security`)**:
  - Full autonomous runtime dashboard with live daemon state badges, trigger table, and execution controls.
  - Interactive 6-stage autonomous execution chain visualizer ($\text{Trigger} \to \text{Decision} \to \text{Plan} \to \text{Execution} \to \text{Verification} \to \text{Governance}$).
  - Safety Operations Hub with circuit breaker logs and emergency stop buttons.
  - Credential Governance Console with creation, rotation, and revocation controls.
  - Strict DOM generation across all components with **0 `.innerHTML`**.
  - Bilingual localization (`es-419` and `en`).
- **Enterprise Capabilities Integration**:
  - Enterprise Workflow Orchestration (DAG validation), Verification (Segregation of Duties), and Human Oversight escalation.
  - Quantitative Agent Lifecycle & Evaluation and declarative AI Solution Factory.
- **Enterprise Network Topology, Secure API Exposure & External Consumer Connectivity (`AOP-NETWORK`)**:
  - Secure transport configuration defaults (`HOST=127.0.0.1`, request timeout: 30s, headers timeout: 15s, keep-alive: 5s) and fail-closed prevention against `0.0.0.0` exposure in production without `ALLOW_PUBLIC_BINDING=true`.
  - Layered perimeter defense: Strict security headers (`HSTS`, `CSP`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cache-Control: no-store`).
  - Safe proxy trust resolution (`trustProxy`, `trustedProxyIps`) with socket-level IP validation against `X-Forwarded-For` spoofing.
  - Host header injection / poisoning mitigation via `allowedHosts` whitelist check.
  - Dynamic CORS allowlisting with mandatory `Vary: Origin, Accept-Encoding` header emission and `403 Forbidden` rejection of unlisted origins in production.
  - Device isolation preserving Brother DCP-1600 Printer on `USB001` strictly behind authenticated and authorized API gateway (`POST /api/v1/devices/:id/print-jobs`).
  - Network perimeter diagnostics endpoints (`/api/v1/diagnostics/network` and `/network/diagnostics`), Web Control Plane card (`#tab-security`), and enhanced `PlatformClient` SDK with request timeouts and exponential backoff retries for idempotent HTTP methods.
- **Test Baseline**: 1399 deterministic tests passing across 59 suites (0 failures, 100% success rate).

---

## [1.1.0] - 2026-09-17 (v1.1.0 Baseline Auditada & Extended Ecosystem)

### Added
- **Real AI Model Providers**: `OpenAIModelGateway`, `AnthropicModelGateway`, and `OllamaModelGateway` with streaming, structured JSON output, retry policies, and `ProviderFactory` with deterministic fallback router.
- **Business Devices & Printing**: `BrotherPrinterAdapter` for Brother DCP-1600 series on local port `USB001`, `PrintJob` management, and spooler health monitoring.
- **Bilingual Web Control Plane**: Single-Page Application native interface with dynamic internationalization supporting Spanish Latin America (`es-419`, default) and English (`en`), 0 `innerHTML`, and real-time telemetry.
- **Application Ecosystem**: `TentacionesPlatformAdapter` with AR Virtual Fitting Room and size calculation, plus `Vehicle Parts Platform` reference application with automotive mechanical compatibility engine.
- **Operational Diagnostics & Hardening**: `RuntimeDiagnosticsService`, `/api/v1/diagnostics` forensic endpoints, and rate limiting per tenant/principal.
- **Test Baseline**: Verification of 966 deterministic tests passing (0 failures, 11 test suites).

### Changed
- **Official Documentation Re-synchronization**: Updated `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` to v2.0 reflecting actual v1.1.0 architecture, updated ADR traceability matrix, and established `docs/SOURCE_OF_TRUTH.md`.

---

## [1.0.0] - 2026-09-12 (v1.0.0 Baseline Release)

### Added
- **Platform API Layer**: Native Node.js HTTP server (`src/platform/server.ts`, `src/platform/api/http-router.ts`) exposing REST contracts under `/api/v1/*` and `/api/platform/v1/*`.
- **Platform Client SDK (`@ai-platform/client`)**: Typed TypeScript SDK for decoupled external consumers with automatic fallback and schema validation.
- **Tentaciones AI Commerce Integration**: Production-ready platform adapter for AI-assisted product discovery and recommendation.
- **Security Context & RBAC**: Default-deny security governance, tenant isolation boundaries, and role-based access control.

---

## [0.13.0] - 2026-09-10 (Crash Recovery & Reconciliation)

### Added
- **Crash Recovery Service (`RestartRecoveryService`)**: Atomic startup reconciliation of stranded active tasks, executions, and autonomous operations into terminal states.
- **Durable Event Store (`SqliteEventStore`)**: Append-only SQLite event log with correlation indexing by `traceId`, `taskId`, and `executionId`.
- **Architectural Decision Records**: ADR 0020 (Crash Recovery and Restart Reconciliation), ADR 0021 (Durable Events and Audit Infrastructure), and ADR 0022 (Observability Audit Query and Runtime Diagnostics).

---

## [0.12.0] - 2026-09-09 (Durable Execution Persistence)

### Added
- **SQLite Task Repository (`SqliteTaskRepository`)**: Durable implementation of `TaskRepository` and `TaskQueryPort` over native SQLite WAL.
- **SQLite Execution Repository (`SqliteExecutionRepository`)**: Durable implementation of `ExecutionRepository` and `ExecutionQueryPort`.
- **SQLite Agent Repository (`SqliteAgentRepository`)**: Durable storage and OCC versioning for Agent aggregates.
- **Architectural Decision Record**: ADR 0019 (Durable SQLite Adapters for Task, Execution, and Agent).

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #3 — Agent Domain Rehydration Boundary)

### Added
- **Agent Domain Rehydration Boundary (`Agent.rehydrate`)**: Static factory method on `Agent` accompanied by `AgentRehydrateProps` boundary interface, enabling persistent storage adapters to restore Agent aggregates across all lifecycle states without reflection.
- **Fail-Closed State Invariant Validation**: Comprehensive domain validation enforcing status constraints (`ACTIVE` / `INACTIVE`), OCC version integrity (`version >= 1`), identifier validation via canonical `validateAgentId()`, non-empty name and model, and chronological timestamp consistency (`createdAt <= updatedAt`).
- **Runtime Immutability & Defensive Copying**: Constructor-level `Object.freeze(this)` on `Agent`, tool capability deduplication and freezing (`Object.freeze([...new Set(...)])`), and timestamp defensive cloning.
- **Dedicated Agent Rehydration Unit Suite**: Added 11 new targeted assertions to `tests/unit/agent.test.ts` verifying full configuration rehydration, minimal configuration rehydration, prototype preservation (`instanceof Agent`), mutation resistance, fail-closed validation, and lifecycle continuation (`update`, `activate`, `deactivate`, `toDefinition`).
- **Architectural Decision Record (ADR 0018)**: Formal decision document defining Agent domain rehydration boundaries, encapsulation principles, and persistence adapter integration rules.

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #2 — Core Execution Domain Rehydration Boundary)

### Added
- **Core Execution Rehydration Boundaries (`Task.rehydrate`, `Execution.rehydrate`)**: Static factory methods on `Task` and `Execution` accompanied by `TaskRehydrateProps` and `ExecutionRehydrateProps` boundary interfaces, allowing persistent storage adapters to reconstitute core execution entities across all lifecycle states without reflection.
- **Fail-Closed State Invariant Validation**: Comprehensive domain validation enforcing status-specific constraints, result and error mutual exclusivity, and chronological timestamp ordering (`createdAt <= startedAt <= completedAt`).
- **Runtime Immutability & Defensive Copying**: Constructor-level `Object.freeze(this)` on `Task`, `Execution`, and `TaskError`, with deep defensive copying of payload dictionaries (`request.input`, `result.output`, `resultMetadata`).
- **Dedicated Rehydration Test Suites**: Extended `tests/unit/task.test.ts` and `tests/unit/execution.test.ts` with 21 new targeted assertions covering valid rehydrations, fail-closed invalid inputs, prototype preservation (`instanceof`), and runtime mutation resistance.
- **Architectural Decision Record (ADR 0017)**: Formal decision document defining Core Execution domain rehydration boundaries, encapsulation principles, and persistence adapter integration rules.

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #1 — Formal Domain Rehydration Boundary)

### Added
- **Formal Rehydration Boundary (`AutonomousOperation.rehydrate`)**: Static factory method on `AutonomousOperation` and `AutonomousOperationRehydrateProps` interface enabling persistence adapters to reconstruct aggregates while strictly enforcing domain invariants.
- **Dedicated Rehydration Unit Tests**: Comprehensive test suite verifying aggregate rehydration across all statuses, value object prototype validation, defensive immutability checks, and fail-closed validation on invalid input.
- **Architectural Decision Record (ADR 0016)**: Documented rationale for formal domain rehydration boundary and elimination of reflection in infrastructure adapters.

### Changed
- **Eliminated `Reflect.construct` in Persistence**: `sqlite-mapper.ts` now delegates rehydration directly to `AutonomousOperation.rehydrate()`, removing technical debt and reflection across all infrastructure persistence mappers.

---

## [0.10.0] - 2026-09-08 (v0.10 Increment #2 — SQLite Durable Adapter & Storage Engine)

### Added
- **Native SQLite Storage Engine**: Implementation of `SqliteDatabase` utilizing Node.js 22 native `node:sqlite` (`DatabaseSync`) with WAL journal mode, busy timeout, and foreign key enforcement.
- **Relational Schema (Version 1)**: Bootstrap for tables `schema_metadata`, `operations`, `plans`, `plan_steps`, `observations`, and `decisions` with relational integrity, cascading deletes, and optimized query indexes.
- **Durable Operation Repository**: `SqliteOperationRepository` implementing both `OperationRepositoryPort` and `OperationQueryPort` with parameterized queries and prepared statements.
- **Transactional Atomicity**: Atomic mutation boundary ensuring operation aggregates, deliberate plans, observations, and decisions commit together or roll back cleanly on failure.
- **Optimistic Concurrency Control (OCC)**: Monotonic `version` tracking rejecting stale concurrent writes with `OptimisticConcurrencyError`.
- **Idempotency & Rehydration**: Child record idempotency preventing duplicate history on re-save, and aggregate rehydration preserving class invariants, frozen snapshots, and CQRS projections.
- **Composition Root Integration**: Configured `createPlatform` and production server bootstrap to support durable SQLite storage (`data/app.db`) while retaining `InMemoryOperationRepository` for fast, isolated unit testing.
- **Contract & Integration Test Suites**: Parity contract verification across both in-memory and SQLite repositories, unit test coverage of durability, transactions, OCC, and schema versioning, and end-to-end HTTP REST API integration tests.

### Architecture
- **Strict Domain Purity**: Zero SQLite or SQL imports in `src/domain` and `src/application`.
- **Zero Runtime Dependencies**: Engine operates exclusively on Node.js standard library APIs (`npm ls --omit=dev` empty).

---

## [0.9.0] - 2026-09-07 (Release Candidate)

### Added
- **Autonomy Budgeting**: Value Object `AutonomyBudget` with positive validation for `maxSteps`, `maxDurationMs`, `maxToolCalls`, and optional `maxTokens`.
- **Autonomy Consumption**: Value Object `AutonomyConsumption` providing copy-on-write tracking of steps, wall-clock time, tool calls, and tokens used.
- **Autonomous Operation Aggregate**: Domain entity `AutonomousOperation` with finite state machine (`SUBMITTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `BUDGET_EXHAUSTED`) and deterministic budget checks.
- **Planning Contracts**: Domain objects `PlanningRequest`, `Plan`, and `PlanStep` with strict immutability, unique step IDs, sequential order, and rejection of executable functions.
- **Decision Contracts**: Domain entity `Decision` with explicit types (`EXECUTE_STEP`, `COMPLETE`, `STOP`, `FAIL`).
- **Observation Pipeline**: Value Object `Observation` capturing step duration, output, normalized errors, and tool count.
- **Objective Evaluation**: Value Object `ObjectiveEvaluation` decoupling technical execution success from goal satisfaction (`ACHIEVED`, `NOT_ACHIEVED`, `UNKNOWN`).
- **Pure Decision Evaluator**: Domain service `DeterministicDecisionEvaluator` implementing 7 pure rules for state derivation.
- **Bounded Orchestrator**: Application service `AutonomousOrchestrator` coordinating multi-step cycles strictly through `CoreRuntime` with mandatory per-step fail-closed `PolicyGateway` governance.
- **Autonomous Operation Service**: Application service `AutonomousOperationService` mediating between HTTP/API and orchestrator with active cooperative cancellation tracking.
- **Operation Repositories & Projections**: Domain port `OperationRepositoryPort`, query port `OperationQueryPort`, and zero-dependency adapter `InMemoryOperationRepository`.
- **Platform REST Endpoints**: Canonical `/api/v1/operations*` and backward-compatible `/api/operations*` endpoints for listing, inspecting, creating, and cancelling autonomous operations.
- **Web Control Plane Operations View**: Dedicated SPA navigation tab, operation creation form, reactive operations table with badges/metrics, and deep operation inspector.
- **Architecture Documentation**: ADR 0013 (Bounded Autonomous Operations Architecture) and ADR 0014 (Autonomous Operations API Integration).

### Changed
- **PlatformService**: Integrated `operationService` and added operation count to system status telemetry.
- **HttpRouter**: Added operation routes, 1MB body limit enforcement, path traversal protection, CORS origin restrictions, and structured HTTP error responses.
- **Web UI Client**: Extended `api-client.js` and `app.js` with DOM-based operation rendering (strictly zero `innerHTML`).
- **Documentation**: Updated Manual Chapter 15 to reflect full v0.9 implementation.

### Security
- **Strict DOM Construction**: 100% pure DOM APIs across the entire Web UI, eliminating `innerHTML` usage.
- **Fail-Closed Policy Enforcement**: Verified that policy denial or policy evaluation exceptions halt execution immediately without calling `CoreRuntime`.
- **Path Traversal Shield**: Encoded and raw URL traversal attempts (`..`) blocked with HTTP 403.
- **CORS Restriction**: Headers restricted strictly to local origins (`localhost`, `127.0.0.1`, `[::1]`).
- **Input Sanitization**: Alphanumeric ID regex filtering and 1MB maximum payload ceiling.

### Architecture
- **Preserved CoreRuntime Invariant**: CoreRuntime remains the single owner of execution; no secondary autonomous runtimes introduced.
- **Zero Runtime Dependencies**: Engine and platform operate strictly on Node.js standard library (`npm ls --omit=dev` empty).

### Known Limitations
- In-memory persistence only; state is non-durable across process restarts (durable persistence scheduled for v0.10).
- Synchronous request-response execution over HTTP bounded by `maxDurationMs`.
- Cancellation is inter-step; in-flight model socket preemption is an open design (OAD-001).

---

## [0.8.0] - 2026-09-07

### Added
- First-class `Agent` domain aggregate with model binding, behavioral instructions, tool authorization whitelists, and lifecycle status.
- `AgentRegistry` domain port and `InMemoryAgentRegistry` adapter.
- `AgentExecutionStrategy` integrating Agent execution under `CoreRuntime`.
- `AgentService` application service.
- REST endpoints `/api/v1/agents*` for agent management and execution dispatch.
- Web Control Plane SPA dedicated Agents management panel.
- Architecture Decision Record ADR 0011 (Agent Architecture).

---

## [0.7.0] - 2026-09-06

### Added
- Native HTTP REST API (`/api/v1/` and `/api/` compat).
- Web Control Plane Single-Page Application (HTML5 / Vanilla JS).
- Execution timeline forensic audit endpoints.
