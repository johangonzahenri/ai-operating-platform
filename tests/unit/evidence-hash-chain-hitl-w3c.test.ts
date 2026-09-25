import { describe, it } from "node:test";
import assert from "node:assert/strict";

// GAP-09: W3C Trace Context Primitives
import {
  W3CTraceContext,
  W3CTraceContextError,
} from "../../src/domain/context/w3c-trace-context.js";
import {
  RequestContext,
  extractRequestContextFromHeaders,
} from "../../src/domain/context/request-context.js";

// GAP-06: Evidence Hash Chain Primitives
import {
  EvidenceExportManifest,
  EvidenceExportPackage,
  EvidenceHashChainVerifier,
  computeManifestPackageHash,
} from "../../src/domain/governance/evidence-export.js";
import {
  EvidenceExportValidationError,
  EvidenceChainContinuityError,
  EvidenceChainTamperError,
} from "../../src/domain/governance/evidence-export-errors.js";
import { EvidenceExportService } from "../../src/application/governance/evidence-export-service.js";
import { SecurityContext } from "../../src/domain/security/security.js";

// GAP-08: HITL Async Bridge Primitives
import {
  HITLSuspensionRecord,
  HITLSuspensionValidationError,
  HITLSuspensionNotFoundError,
  HITLInvalidTokenError,
  HITLSuspensionExpiredError,
  HITLSuspensionStateConflictError,
  HITLTenantMismatchError,
} from "../../src/domain/workflow/hitl-bridge.js";
import { SelfApprovalError } from "../../src/domain/workflow/approval-errors.js";
import { InMemoryHITLBridge } from "../../src/infrastructure/workflow/in-memory-hitl-bridge.js";
import { DomainEvent } from "../../src/domain/events/events.js";

describe("Track 3 — Hardening Suite: GAP-06, GAP-08, GAP-09", () => {
  // =========================================================================
  // GAP-09: W3C Trace Context Specification Tests
  // =========================================================================
  describe("GAP-09 — W3C Trace Context Specification", () => {
    it("parses valid traceparent header conforming to W3C recommendation", () => {
      const raw = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const tp = W3CTraceContext.parseTraceparent(raw);
      assert.equal(tp.version, "00");
      assert.equal(tp.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
      assert.equal(tp.parentId, "00f067aa0ba902b7");
      assert.equal(tp.traceFlags, "01");
    });

    it("rejects invalid traceparent versions (e.g. ff is forbidden)", () => {
      assert.throws(
        () => W3CTraceContext.parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
        W3CTraceContextError
      );
    });

    it("rejects all-zero traceId and all-zero parentId fail-closed", () => {
      assert.throws(
        () => W3CTraceContext.parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01"),
        W3CTraceContextError
      );
      assert.throws(
        () => W3CTraceContext.parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"),
        W3CTraceContextError
      );
    });

    it("rejects malformed traceparent strings (bad length, non-hex characters)", () => {
      assert.throws(() => W3CTraceContext.parseTraceparent("invalid-traceparent"), W3CTraceContextError);
      assert.throws(() => W3CTraceContext.parseTraceparent("00-shortid-00f067aa0ba902b7-01"), W3CTraceContextError);
      assert.throws(() => W3CTraceContext.parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e473z-00f067aa0ba902b7-01"), W3CTraceContextError);
    });

    it("parses valid tracestate header and supports vendor member updates", () => {
      const stateHeader = "rojo=1,congo=t61rcWkgMzE";
      const { entries } = W3CTraceContext.parseTracestate(stateHeader);
      assert.equal(entries.length, 2);
      assert.equal(entries[0]?.key, "rojo");
      assert.equal(entries[0]?.value, "1");
      assert.equal(entries[1]?.key, "congo");
      assert.equal(entries[1]?.value, "t61rcWkgMzE");
    });

    it("enforces tracestate maximum limits (512 chars, max 32 entries)", () => {
      // Create over 32 entries
      const members: string[] = [];
      for (let i = 0; i < 35; i++) {
        members.push(`vendor${i}=val${i}`);
      }
      assert.throws(() => W3CTraceContext.parseTracestate(members.join(",")), W3CTraceContextError);

      // Create > 512 chars
      const longVal = "a".repeat(500);
      assert.throws(() => W3CTraceContext.parseTracestate(`k1=${longVal},k2=${longVal}`), W3CTraceContextError);
    });

    it("creates child span context preserving traceId and updating parentId and tracestate", () => {
      const parent = W3CTraceContext.create(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "vendor1=opaqueValue"
      );

      assert.equal(parent.isSampled, true);

      const child = parent.createChildSpan().withTracestateEntry("vendor2", "childValue");
      assert.equal(child.traceId, parent.traceId);
      assert.notEqual(child.parentId, parent.parentId);
      assert.equal(child.parentId.length, 16);
      assert.ok(child.tracestate?.startsWith("vendor2=childValue"));
      assert.ok(child.tracestate?.includes("vendor1=opaqueValue"));
    });

    it("integrates seamlessly into RequestContext and HTTP header extraction", () => {
      const headers = {
        "x-request-id": "req-12345",
        "x-tenant-id": "tenant-alpha",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "congo=t61rcWkgMzE",
      };

      const ctx = extractRequestContextFromHeaders(headers);
      assert.equal(ctx.requestId, "req-12345");
      assert.equal(ctx.tenantId, "tenant-alpha");
      assert.ok(ctx.traceContext);
      assert.equal(ctx.traceContext?.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
      assert.equal(ctx.traceContext?.parentId, "00f067aa0ba902b7");
      assert.equal(ctx.traceContext?.tracestate, "congo=t61rcWkgMzE");
    });
  });

  // =========================================================================
  // GAP-06: Evidence Cryptographic Integrity & Hash Chain Tests
  // =========================================================================
  describe("GAP-06 — Evidence Hash Chain & Cryptographic Integrity", () => {
    const tenantId = "tenant-integrity-test";
    const requestedBy = "auditor-01";

    function makeManifest(
      exportId: string,
      sequenceNumber: number,
      previousHash: string | null,
      customData = "sample-data"
    ): EvidenceExportManifest {
      return new EvidenceExportManifest({
        exportId,
        tenantId,
        requestedByPrincipalId: requestedBy,
        generatedAt: new Date("2026-09-25T12:00:00Z"),
        scope: "AUDIT_TRAIL",
        filters: { limit: 100 },
        recordCounts: { items: 1 },
        totalRecords: 1,
        checksumSha256: "data-checksum-" + customData,
        sequenceNumber,
        previousPackageHashSha256: previousHash,
      });
    }

    it("genesis package enforces sequenceNumber=1 and previousPackageHashSha256=null", () => {
      const genesis = makeManifest("exp-gen", 1, null);
      assert.equal(genesis.sequenceNumber, 1);
      assert.equal(genesis.previousPackageHashSha256, null);
      assert.ok(genesis.packageHashSha256);

      // Violations fail-closed
      assert.throws(
        () => makeManifest("exp-fail", 1, "previous-hash-should-not-exist"),
        EvidenceExportValidationError
      );
      assert.throws(
        () => makeManifest("exp-fail2", 2, null),
        EvidenceExportValidationError
      );
    });

    it("verifies unbroken sequential hash chain of multiple packages", () => {
      const p1 = makeManifest("exp-01", 1, null, "pack1");
      const p2 = makeManifest("exp-02", 2, p1.packageHashSha256, "pack2");
      const p3 = makeManifest("exp-03", 3, p2.packageHashSha256, "pack3");

      const result = EvidenceHashChainVerifier.verifyChain([p1, p2, p3]);
      assert.equal(result.valid, true);
      assert.equal(result.packageCount, 3);
      assert.equal(result.headSequenceNumber, 3);
      assert.equal(result.headPackageHash, p3.packageHashSha256);
    });

    it("detects deleted package / sequence gap in evidence chain fail-closed", () => {
      const p1 = makeManifest("exp-01", 1, null, "pack1");
      const p2 = makeManifest("exp-02", 2, p1.packageHashSha256, "pack2");
      const p3 = makeManifest("exp-03", 3, p2.packageHashSha256, "pack3");

      // Skip package 2: [p1, p3]
      assert.throws(
        () => EvidenceHashChainVerifier.verifyChain([p1, p3]),
        EvidenceChainContinuityError
      );
    });

    it("detects payload/manifest content tampering in the middle of chain fail-closed", () => {
      const p1 = makeManifest("exp-01", 1, null, "pack1");
      const p2 = makeManifest("exp-02", 2, p1.packageHashSha256, "pack2");

      // Forged p2 with modified checksum but maintaining declared packageHashSha256
      assert.throws(() => {
        new EvidenceExportManifest({
          exportId: p2.exportId,
          tenantId: p2.tenantId,
          requestedByPrincipalId: p2.requestedByPrincipalId,
          generatedAt: p2.generatedAt,
          scope: p2.scope,
          filters: p2.filters,
          recordCounts: p2.recordCounts,
          totalRecords: 999999, // Tampered count!
          checksumSha256: p2.checksumSha256,
          sequenceNumber: p2.sequenceNumber,
          previousPackageHashSha256: p2.previousPackageHashSha256,
          packageHashSha256: p2.packageHashSha256, // Stale/mismatched hash
        });
      }, EvidenceChainTamperError);
    });

    it("detects cross-tenant chain injection fail-closed", () => {
      const p1 = makeManifest("exp-01", 1, null, "pack1");
      const foreignP2 = new EvidenceExportManifest({
        exportId: "exp-alien",
        tenantId: "tenant-alien",
        requestedByPrincipalId: "intruder",
        generatedAt: new Date("2026-09-25T12:00:00Z"),
        scope: "AUDIT_TRAIL",
        filters: { limit: 100 },
        recordCounts: { items: 1 },
        totalRecords: 1,
        checksumSha256: "foreign-data",
        sequenceNumber: 2,
        previousPackageHashSha256: p1.packageHashSha256,
      });

      assert.throws(
        () => EvidenceHashChainVerifier.verifyChain([p1, foreignP2]),
        EvidenceChainContinuityError
      );
    });

    it("EvidenceExportService automatically generates sequential hash chain across tenant exports", async () => {
      const service = new EvidenceExportService();
      const secCtx: SecurityContext = {
        tenantId: "tenant-corp",
        principal: { id: "sec-auditor", roles: ["AUDITOR"] },
      };

      const pack1 = await service.exportEvidence(secCtx, { scope: "TENANT" });
      assert.equal(pack1.manifest.sequenceNumber, 1);
      assert.equal(pack1.manifest.previousPackageHashSha256, null);

      const pack2 = await service.exportEvidence(secCtx, { scope: "TENANT" });
      assert.equal(pack2.manifest.sequenceNumber, 2);
      assert.equal(pack2.manifest.previousPackageHashSha256, pack1.manifest.packageHashSha256);

      const pack3 = await service.exportEvidence(secCtx, { scope: "TENANT" });
      assert.equal(pack3.manifest.sequenceNumber, 3);
      assert.equal(pack3.manifest.previousPackageHashSha256, pack2.manifest.packageHashSha256);

      // Verify the whole chain with EvidenceHashChainVerifier
      const verification = EvidenceHashChainVerifier.verifyChain([pack1, pack2, pack3]);
      assert.equal(verification.valid, true);
      assert.equal(verification.packageCount, 3);
      assert.equal(verification.headSequenceNumber, 3);
    });
  });

  // =========================================================================
  // GAP-08: HITL Async Bridge / Suspension & Resumption Tests
  // =========================================================================
  describe("GAP-08 — HITL Async Bridge / Suspension & Resumption", () => {
    it("creates a suspension record with secure resumption token and waiting state", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        workflowId: "wf-payment",
        stepId: "step-transfer",
        suspensionType: "APPROVAL",
        reason: "Amount exceeds autonomous threshold ($50,000)",
        requestedAction: "EXECUTE_WIRE_TRANSFER",
        requesterPrincipalId: "agent-finance-01",
        producerPrincipalId: "agent-treasury-02",
        ttlMs: 3600000,
      });

      assert.equal(record.tenantId, "tenant-hitl");
      assert.equal(record.status, "WAITING_FOR_APPROVAL");
      assert.ok(record.resumptionToken.startsWith("rst-"));
      assert.equal(record.isTerminal(), false);
      assert.equal(record.isExpired(), false);
    });

    it("enforces Separation of Duties (SoD): requester cannot approve their own suspension", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Production DB deployment",
        requestedAction: "RUN_MIGRATION",
        requesterPrincipalId: "developer-alice",
      });

      assert.throws(() => {
        record.resume({
          resumptionToken: record.resumptionToken,
          actorPrincipalId: "developer-alice", // Self-approval!
          tenantId: "tenant-hitl",
          decision: "APPROVE",
        });
      }, SelfApprovalError);
    });

    it("enforces Separation of Duties (SoD): producer cannot approve their own output", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Contract amendment",
        requestedAction: "SIGN_CONTRACT",
        requesterPrincipalId: "service-bot",
        producerPrincipalId: "lawyer-bob",
      });

      assert.throws(() => {
        record.resume({
          resumptionToken: record.resumptionToken,
          actorPrincipalId: "lawyer-bob", // Producer approval!
          tenantId: "tenant-hitl",
          decision: "APPROVE",
        });
      }, SelfApprovalError);
    });

    it("allows independent authority to approve suspension and transitions to APPROVED", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Budget overrun",
        requestedAction: "APPROVE_OVERRUN",
        requesterPrincipalId: "agent-01",
        producerPrincipalId: "agent-02",
      });

      const approved = record.resume({
        resumptionToken: record.resumptionToken,
        actorPrincipalId: "manager-charlie",
        tenantId: "tenant-hitl",
        decision: "APPROVE",
        reason: "Approved per Q3 budget adjustment",
      });

      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.resolutionOutcome, "APPROVED");
      assert.equal(approved.resolvedByPrincipalId, "manager-charlie");
      assert.equal(approved.isTerminal(), true);
    });

    it("rejects resumption with invalid resumption token fail-closed", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "INPUT",
        reason: "Requires user 2FA code",
        requestedAction: "PROCEED_LOGIN",
        requesterPrincipalId: "auth-agent",
      });

      assert.throws(() => {
        record.resume({
          resumptionToken: "rst-wrong-token-12345",
          actorPrincipalId: "user-dan",
          tenantId: "tenant-hitl",
          decision: "PROVIDE_INPUT",
        });
      }, HITLInvalidTokenError);
    });

    it("prevents double-resumption / replay attack (idempotent / conflict fail-closed)", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Access grant",
        requestedAction: "GRANT_ROLE",
        requesterPrincipalId: "agent-iam",
      });

      const approved = record.resume({
        resumptionToken: record.resumptionToken,
        actorPrincipalId: "admin-eve",
        tenantId: "tenant-hitl",
        decision: "APPROVE",
      });

      assert.equal(approved.status, "APPROVED");

      // Attempting to resume again
      assert.throws(() => {
        approved.resume({
          resumptionToken: record.resumptionToken,
          actorPrincipalId: "admin-eve",
          tenantId: "tenant-hitl",
          decision: "APPROVE",
        });
      }, HITLSuspensionStateConflictError);
    });

    it("rejects resumption when suspension has expired fail-closed", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-hitl",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Flash loan",
        requestedAction: "EXECUTE_LOAN",
        requesterPrincipalId: "bot-01",
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      assert.equal(record.isExpired(), true);

      assert.throws(() => {
        record.resume({
          resumptionToken: record.resumptionToken,
          actorPrincipalId: "human-boss",
          tenantId: "tenant-hitl",
          decision: "APPROVE",
        });
      }, HITLSuspensionExpiredError);
    });

    it("enforces tenant isolation: tenant B cannot resume tenant A suspension", () => {
      const record = HITLSuspensionRecord.create({
        tenantId: "tenant-alpha",
        applicationId: "app-core",
        suspensionType: "APPROVAL",
        reason: "Security change",
        requestedAction: "ROTATE_ROOT_KEY",
        requesterPrincipalId: "admin-01",
      });

      assert.throws(() => {
        record.resume({
          resumptionToken: record.resumptionToken,
          actorPrincipalId: "admin-beta",
          tenantId: "tenant-beta", // Cross-tenant!
          decision: "APPROVE",
        });
      }, HITLTenantMismatchError);
    });

    it("InMemoryHITLBridge publishes domain events across suspension lifecycle", async () => {
      const publishedEvents: DomainEvent[] = [];
      const bridge = new InMemoryHITLBridge({
        publish: (e) => publishedEvents.push(e),
      });

      // 1. Suspend
      const suspension = await bridge.suspend({
        tenantId: "tenant-fin",
        applicationId: "app-billing",
        suspensionType: "APPROVAL",
        reason: "Invoice payment $100k",
        requestedAction: "PAY_INVOICE",
        requesterPrincipalId: "agent-ap",
        producerPrincipalId: "agent-billing",
      });

      assert.equal(publishedEvents.length, 1);
      assert.equal(publishedEvents[0]?.type, "hitl.approval_required");

      // 2. Resume
      const resumed = await bridge.resume({
        resumptionToken: suspension.resumptionToken,
        actorPrincipalId: "cfo-carol",
        tenantId: "tenant-fin",
        decision: "APPROVE",
      });

      assert.equal(resumed.status, "APPROVED");
      assert.equal(publishedEvents.length, 2);
      assert.equal(publishedEvents[1]?.type, "hitl.approved");
    });
  });
});
