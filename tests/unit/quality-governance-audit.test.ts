/**
 * AI Operating Platform — Transversal Quality Governance & Audit Engine Unit Tests
 * 
 * Verifies:
 * 1. Evidence Hierarchy Levels (E0 to E7)
 * 2. AuditFinding classification and blocking evaluation
 * 3. AuditControl and AuditSession evaluation
 * 4. Audit Coverage Calculation
 * 5. Monotonic Verdict Evaluation (FAIL-CLOSED, DEBT, PASS)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EvidenceLevel,
  CANONICAL_EVIDENCE_LEVELS,
  AuditFinding,
  AuditControl,
  AuditSession,
  CapabilityInventoryItem,
} from "../../src/domain/governance/audit-models.js";

describe("Quality Governance & Transversal Audit Domain Model", () => {
  it("enforces canonical 8-level evidence hierarchy", () => {
    assert.equal(CANONICAL_EVIDENCE_LEVELS.length, 8);
    assert.deepEqual(CANONICAL_EVIDENCE_LEVELS, [
      "E0_DOCUMENTARY",
      "E1_STATIC_ANALYSIS",
      "E2_UNIT_TEST",
      "E3_INTEGRATION_TEST",
      "E4_E2E_SIMULATED",
      "E5_LIVE_HTTP",
      "E6_STAGING_ENV",
      "E7_PRODUCTION",
    ]);
  });

  it("determines blocking findings fail-closed based on severity and status", () => {
    const criticalOpen = new AuditFinding({
      id: "HAL-01",
      controlId: "CTRL-SEC-01",
      severity: "CRITICAL",
      category: "DEFECT_BUG",
      description: "Tenant isolation bypass",
      component: "src/platform/api/http-router.ts",
      evidenceLevel: "E5_LIVE_HTTP",
      evidenceDetails: "Tenant B can access Tenant A data",
      impact: "Cross-tenant data leakage",
      requiredAction: "Add tenant check",
      status: "OPEN",
    });
    assert.equal(criticalOpen.isBlocking(), true);

    const criticalFixed = new AuditFinding({
      id: "HAL-01",
      controlId: "CTRL-SEC-01",
      severity: "CRITICAL",
      category: "DEFECT_BUG",
      description: "Tenant isolation bypass",
      component: "src/platform/api/http-router.ts",
      evidenceLevel: "E5_LIVE_HTTP",
      evidenceDetails: "Tenant B can access Tenant A data",
      impact: "Cross-tenant data leakage",
      requiredAction: "Add tenant check",
      status: "FIXED",
    });
    assert.equal(criticalFixed.isBlocking(), false);

    const lowOpen = new AuditFinding({
      id: "HAL-02",
      controlId: "CTRL-DOC-01",
      severity: "LOW",
      category: "TECHNICAL_DEBT",
      description: "Minor comment mismatch",
      component: "docs/ARCH.md",
      evidenceLevel: "E0_DOCUMENTARY",
      evidenceDetails: "Outdated section reference",
      impact: "Cosmetic",
      requiredAction: "Update doc",
      status: "OPEN",
    });
    assert.equal(lowOpen.isBlocking(), false);
  });

  it("evaluates AuditSession verdict with fail-closed rules", () => {
    // 1. Session with blocking finding -> BLOQUEADA
    const blockedSession = new AuditSession({
      auditId: "AUD-TEST-01",
      auditType: "AUD_SISTEMA",
      baselineCommit: "commit-123",
      platformVersion: "1.4.0",
      startedAt: new Date().toISOString(),
      controls: [
        new AuditControl({
          controlId: "CTRL-01",
          name: "Security Check",
          domain: "SECURITY",
          layer: "PLATFORM",
          result: "NOT_VERIFIED",
          evidence: {
            level: "E5_LIVE_HTTP",
            sourceFile: "tests/e2e/test.ts",
            verifiedAt: new Date().toISOString(),
            demonstratedClaim: "Auth required",
            explicitLimitation: "Fails under stress",
          },
          findings: [
            new AuditFinding({
              id: "HAL-B1",
              controlId: "CTRL-01",
              severity: "CRITICAL",
              category: "DEFECT_BUG",
              description: "Auth bypass",
              component: "src/auth.ts",
              evidenceLevel: "E5_LIVE_HTTP",
              evidenceDetails: "Bypass reproducible",
              impact: "Severe",
              requiredAction: "Fix auth",
              status: "OPEN",
            }),
          ],
        }),
      ],
      capabilities: [],
    });

    assert.equal(blockedSession.evaluateVerdict(), "AUDITORIA_BLOQUEADA");

    // 2. Session with accepted technical debt -> APROBADA_CON_DEUDA
    const debtSession = new AuditSession({
      auditId: "AUD-TEST-02",
      auditType: "AUD_FASE",
      baselineCommit: "commit-123",
      platformVersion: "1.4.0",
      startedAt: new Date().toISOString(),
      controls: [
        new AuditControl({
          controlId: "CTRL-01",
          name: "Auth Provider",
          domain: "SECURITY",
          layer: "PLATFORM",
          result: "PARTIALLY_VERIFIED",
          evidence: {
            level: "E5_LIVE_HTTP",
            sourceFile: "tests/e2e/test.ts",
            verifiedAt: new Date().toISOString(),
            demonstratedClaim: "JWT verified locally",
            explicitLimitation: "Live cloud OIDC pending IdP",
          },
          findings: [
            new AuditFinding({
              id: "HAL-D1",
              controlId: "CTRL-01",
              severity: "MEDIUM",
              category: "ENVIRONMENT_GAP",
              description: "Live OIDC JWKS pending external cloud IdP",
              component: "src/infrastructure/security/jwt-token-verifier.ts",
              evidenceLevel: "E6_STAGING_ENV",
              evidenceDetails: "Mock verifier works, external connection pending",
              impact: "Requires enterprise IdP tenant",
              requiredAction: "Provision Okta/Entra",
              status: "PENDING_ENVIRONMENT",
            }),
          ],
        }),
      ],
      capabilities: [],
    });

    assert.equal(debtSession.evaluateVerdict(), "AUDITORIA_APROBADA_CON_DEUDA");

    // 3. Clean Session -> APROBADA
    const cleanSession = new AuditSession({
      auditId: "AUD-TEST-03",
      auditType: "AUD_SISTEMA",
      baselineCommit: "commit-123",
      platformVersion: "1.4.0",
      startedAt: new Date().toISOString(),
      controls: [
        new AuditControl({
          controlId: "CTRL-01",
          name: "Health API",
          domain: "PLATFORM",
          layer: "PLATFORM",
          result: "VERIFIED",
          evidence: {
            level: "E5_LIVE_HTTP",
            sourceFile: "tests/e2e/test.ts",
            verifiedAt: new Date().toISOString(),
            demonstratedClaim: "Returns 200 HEALTHY",
            explicitLimitation: "None",
          },
        }),
      ],
      capabilities: [],
    });

    assert.equal(cleanSession.evaluateVerdict(), "AUDITORIA_APROBADA");
  });

  it("calculates capability audit coverage with granular statuses", () => {
    const capabilities: CapabilityInventoryItem[] = [
      { capabilityId: "CAP-01", domain: "CORE", layer: "DOMAIN", implementedInCode: true, auditStatus: "AUDITED" },
      { capabilityId: "CAP-02", domain: "SEC", layer: "PLATFORM", implementedInCode: true, auditStatus: "AUDITED" },
      { capabilityId: "CAP-03", domain: "SSE", layer: "APP", implementedInCode: true, auditStatus: "PARTIALLY_AUDITED" },
      { capabilityId: "CAP-04", domain: "DIST", layer: "APP", implementedInCode: false, auditStatus: "NOT_AUDITED" },
    ];

    const session = new AuditSession({
      auditId: "AUD-COV-01",
      auditType: "AUD_SISTEMA",
      baselineCommit: "commit-123",
      platformVersion: "1.4.0",
      startedAt: new Date().toISOString(),
      controls: [],
      capabilities,
    });

    const cov = session.calculateCoverage();
    assert.equal(cov.totalCapabilities, 4);
    assert.equal(cov.auditedCount, 2);
    assert.equal(cov.partialCount, 1);
    assert.equal(cov.notAuditedCount, 1);
    // (2 + 1*0.5) / 4 = 2.5 / 4 = 62.5% -> rounded to 63%
    assert.equal(cov.auditCoveragePercent, 63);
  });
});
