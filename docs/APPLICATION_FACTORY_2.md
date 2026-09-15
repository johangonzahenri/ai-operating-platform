# Application Factory 2.0 Specification

## 1. Architectural Role
The **Application Factory 2.0** automates the generation, validation, capability entitlement checking, test harness execution, and packaging of external applications consuming the AI Operating Platform.

---

## 2. 8-Step Creation Wizard

```text
1. Identity (applicationId, name, version, category)
2. Runtime (node, browser, edge, universal)
3. Tenant (tenant-tentaciones, tenant-automotive, tenant-support, custom)
4. Capabilities (product.discovery, cart.assistance, automation.execute, etc.)
5. Security Requirements (networkIsolation, auditTrail, defaultDeny)
6. Templates (Generic, Commerce, Support, Automation)
7. Review & Dependency Graph (live entitlement & dependency validation)
8. Generate & Export (project skeleton & manifest generation)
```

---

## 3. Official Templates

1. **Generic AI Application (`generic-ai-app`)**:
   - Capabilities: `product.discovery`, `report.generate`
   - Runtime: `node`
2. **Commerce AI Application (`commerce-ai-app`)**:
   - Capabilities: `product.discovery`, `product.recommendation`, `product.compare`, `cart.assistance`
   - Runtime: `universal`
3. **Enterprise Support AI (`support-ai-app`)**:
   - Capabilities: `report.generate`, `automation.execute`
   - Runtime: `node`
4. **Data & Automation AI (`automation-ai-app`)**:
   - Capabilities: `automation.execute`, `report.generate`
   - Runtime: `edge`

---

## 4. Capability Dependency Graph

```text
ar.fitting_room
  ├── Requires: WebXR / Model3D Pipeline, Avatar Silhouette Projection
  └── Components: AR Pipeline Subsystem, Media Gateway

automation.execute
  ├── Requires: Webhook Ingestion, Autonomous Planner Loop
  └── Components: Autonomous Operation Engine, Durable Event Store

product.discovery
  ├── Requires: Semantic & Keyword Search, Catalog Projection
  └── Components: Model Gateway, Tool Registry
```

---

## 5. 7-Criteria Test Harness & Verification

Every generated application must pass:
1. **Identity**: Valid slug format and semantic versioning.
2. **Authentication**: Rejection of unauthenticated requests fail-closed.
3. **Authorization**: Tenant-level capability entitlement checks.
4. **Capabilities**: Conformance to platform capability registry.
5. **Health**: Live HTTP/SDK connectivity verification.
6. **Version**: Compatibility against target platform version.
7. **Observability**: Consistent trace propagation across requests.
