import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  VerificationResult,
  WorkflowStepVerificationRule,
} from "../../src/domain/workflow/verification-result.js";
import {
  VerificationValidationError,
  SelfVerificationError,
  VerificationConcurrencyConflictError,
  VerificationPolicyDeniedError,
} from "../../src/domain/workflow/verification-errors.js";
import { DeterministicVerifier } from "../../src/application/workflow/deterministic-verifier.js";
import { WorkflowVerificationService } from "../../src/application/workflow/workflow-verification-service.js";
import { InMemoryVerificationResultRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-verification-repository.js";
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";
import { WorkflowInstance } from "../../src/domain/workflow/workflow-instance.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { PolicyGateway, PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";
import { SqliteVerificationResultRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-verification-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";

describe("Phase 63: Workflow Verification & Result Validation Unit Tests", () => {
  const tenantId = "tenant-test-verification";
  const orgId = "org-test";

  describe("DeterministicVerifier Engine", () => {
    it("verifies PASS when output satisfies all presence, schema, and range rules", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "SCHEMA",
        requiredFields: ["reportId", "score", "approved"],
        fieldTypes: {
          reportId: "string",
          score: "number",
          approved: "boolean",
        },
        numericRanges: {
          score: { min: 0, max: 100 },
        },
        allowedValues: {
          approved: [true],
        },
        customInvariants: ["non-empty-object", "no-null-fields"],
      };

      const output = {
        reportId: "rep-101",
        score: 95,
        approved: true,
      };

      const outcome = DeterministicVerifier.evaluate(output, rule);
      assert.strictEqual(outcome.verdict, "PASS");
      assert.strictEqual(outcome.method, "SCHEMA");
      assert.ok(outcome.reason?.includes("satisfied"));
    });

    it("verifies MISSING when output is null, undefined, or empty object", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "DETERMINISTIC",
        requiredFields: ["status"],
      };

      const outcomeNull = DeterministicVerifier.evaluate(undefined, rule);
      assert.strictEqual(outcomeNull.verdict, "MISSING");

      const outcomeEmpty = DeterministicVerifier.evaluate({}, rule);
      assert.strictEqual(outcomeEmpty.verdict, "MISSING");
    });

    it("verifies MALFORMED when field types do not match expected types", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "SCHEMA",
        requiredFields: ["count", "active"],
        fieldTypes: {
          count: "number",
          active: "boolean",
        },
      };

      const output = {
        count: "not-a-number",
        active: "not-a-boolean",
      };

      const outcome = DeterministicVerifier.evaluate(output, rule);
      assert.strictEqual(outcome.verdict, "MALFORMED");
      assert.match(outcome.reason ?? "", /expected type 'number'/);
    });

    it("verifies FAIL when numeric range or allowed value constraints are violated", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "DETERMINISTIC",
        numericRanges: {
          percentage: { min: 0, max: 100 },
        },
        allowedValues: {
          status: ["ACCEPTED", "REJECTED"],
        },
      };

      const outputBadRange = { percentage: 150, status: "ACCEPTED" };
      const outcome1 = DeterministicVerifier.evaluate(outputBadRange, rule);
      assert.strictEqual(outcome1.verdict, "FAIL");

      const outputBadValue = { percentage: 50, status: "UNKNOWN_STATE" };
      const outcome2 = DeterministicVerifier.evaluate(outputBadValue, rule);
      assert.strictEqual(outcome2.verdict, "FAIL");
    });

    it("verifies CONFLICT when conflicting fields or values are present", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "INVARIANT",
        customInvariants: ["conflict"],
      };

      const output = {
        status: "CONFLICT",
        conflictReason: "Conflicting assertions detected across distributed shards",
      };

      const outcome = DeterministicVerifier.evaluate(output, rule);
      assert.strictEqual(outcome.verdict, "CONFLICT");
    });

    it("verifies AMBIGUOUS when multiple conflicting status indicators exist", () => {
      const rule: WorkflowStepVerificationRule = {
        method: "INVARIANT",
        customInvariants: ["ambiguous"],
      };

      const output = {
        status: "AMBIGUOUS",
        ambiguousReason: "Multiple plausible candidates found with identical scores",
      };

      const outcome = DeterministicVerifier.evaluate(output, rule);
      assert.strictEqual(outcome.verdict, "AMBIGUOUS");
    });
  });

  describe("VerificationResult Aggregate Root", () => {
    it("creates a valid VerificationResult and mutates verdict monotonically", () => {
      const result = VerificationResult.create({
        id: "vr-100",
        tenantId,
        workflowId: "wf-1",
        workflowInstanceId: "wfi-1",
        workflowStepId: "step-1",
        producerPrincipalId: "agent-writer",
        verifierPrincipalId: "agent-auditor",
        verifierSource: "AGENT",
        verdict: "PASS",
        method: "SCHEMA",
        evidence: { passedCount: 5 },
      });

      assert.strictEqual(result.isPass(), true);
      assert.strictEqual(result.verdict, "PASS");
      assert.strictEqual(result.version, 1);

      // Mutates verdict
      const updated = result.updateVerdict({ verdict: "FAIL", reason: "Re-evaluated after new findings" });
      assert.strictEqual(updated.verdict, "FAIL");
      assert.strictEqual(updated.isPass(), false);
      assert.strictEqual(updated.version, 2);
    });

    it("rejects creation with empty IDs or missing mandatory fields", () => {
      assert.throws(() => {
        VerificationResult.create({
          id: "",
          tenantId,
          workflowId: "wf-1",
          workflowInstanceId: "wfi-1",
          workflowStepId: "step-1",
          verifierPrincipalId: "agent-auditor",
          verifierSource: "AGENT",
          verdict: "PASS",
          method: "DETERMINISTIC",
        });
      }, VerificationValidationError);
    });
  });

  describe("WorkflowVerificationService Governance & Segregation of Duties", () => {
    let vRepo: InMemoryVerificationResultRepository;
    let defRepo: InMemoryWorkflowDefinitionRepository;
    let instRepo: InMemoryWorkflowInstanceRepository;
    let events: InMemoryEventPublisher;
    let service: WorkflowVerificationService;
    let activeDef: WorkflowDefinition;

    beforeEach(async () => {
      vRepo = new InMemoryVerificationResultRepository();
      defRepo = new InMemoryWorkflowDefinitionRepository();
      instRepo = new InMemoryWorkflowInstanceRepository();
      events = new InMemoryEventPublisher();

      // Create sample definition & instance
      const def = WorkflowDefinition.create({
        id: "wf-sec-01",
        tenantId,
        organizationId: orgId,
        name: "Verified Pipeline",
        steps: [
          {
            stepId: "step-produce",
            name: "Data Producer",
            order: 1,
            purpose: "Data Generation",
            responsibility: "Data Generation",
            dependsOn: [],
            assignedAgentId: "agent-producer",
            verificationRule: {
              method: "SCHEMA",
              requiredFields: ["payload", "checksum"],
              fieldTypes: { payload: "string", checksum: "string" },
            },
          },
          {
            stepId: "step-consume",
            name: "Data Consumer",
            order: 2,
            purpose: "Data Consumption",
            responsibility: "Data Consumption",
            dependsOn: ["step-produce"],
            assignedAgentId: "agent-consumer",
          },
        ],
      });
      activeDef = def.activate();
      await defRepo.save(activeDef);

      const inst = WorkflowInstance.create({
        id: "wfi-sec-01",
        workflowDefinition: activeDef,
        initiatorId: "user-initiator",
        input: { inputKey: "test-data" },
      });
      const runningInst = inst.start();
      const stepRunning = runningInst.markStepRunning("step-produce");
      const stepDone = stepRunning.markStepCompleted("step-produce", { payload: "valid-data", checksum: "sha256-abc" });
      await instRepo.save(stepDone);

      service = new WorkflowVerificationService({
        verificationRepo: vRepo,
        instanceRepo: instRepo,
        defRepo,
        events,
      });
    });

    it("Invariant 1: Segregation of Duties — Producer CANNOT self-verify", async () => {
      await assert.rejects(async () => {
        await service.verifyStepResult({
          tenantId,
          workflowInstanceId: "wfi-sec-01",
          stepId: "step-produce",
          verifierPrincipalId: "agent-producer", // Attempted self-verification
          verifierSource: "AGENT",
          producerPrincipalId: "agent-producer",
        });
      }, SelfVerificationError);
    });

    it("Invariant 2: Execution COMPLETED with Verification FAIL prevents subsequent steps", async () => {
      // Step produce is verified as FAIL by auditor
      const vResult = await service.verifyStepResult({
        tenantId,
        workflowInstanceId: "wfi-sec-01",
        stepId: "step-produce",
        verifierPrincipalId: "agent-auditor",
        verifierSource: "AGENT",
        producerPrincipalId: "agent-producer",
        overrideOutput: { payload: 123, checksum: null }, // Causes MALFORMED / FAIL
      });

      assert.strictEqual(vResult.verdict, "MALFORMED");
      assert.strictEqual(vResult.isPass(), false);

      // Check instance state: step-produce has verificationVerdict MALFORMED
      const updatedInst = await instRepo.findById("wfi-sec-01", tenantId);
      assert.ok(updatedInst);
      const stepState = updatedInst.getStepState("step-produce");
      assert.strictEqual(stepState?.verificationVerdict, "MALFORMED");
      assert.strictEqual(stepState?.status, "FAILED");

      // Next runnable steps must NOT include step-consume
      const runnable = updatedInst.getNextRunnableStepIds(activeDef);
      assert.strictEqual(runnable.length, 0);
    });

    it("Invariant 3: Successful PASS verification enables dependent steps", async () => {
      const vResult = await service.verifyStepResult({
        tenantId,
        workflowInstanceId: "wfi-sec-01",
        stepId: "step-produce",
        verifierPrincipalId: "agent-auditor",
        verifierSource: "AGENT",
        producerPrincipalId: "agent-producer",
      });

      assert.strictEqual(vResult.verdict, "PASS");
      assert.strictEqual(vResult.isPass(), true);

      const updatedInst = await instRepo.findById("wfi-sec-01", tenantId);
      assert.ok(updatedInst);
      const stepState = updatedInst.getStepState("step-produce");
      assert.strictEqual(stepState?.verificationVerdict, "PASS");
      assert.strictEqual(stepState?.status, "COMPLETED");

      // Next runnable steps now includes step-consume
      const runnable = updatedInst.getNextRunnableStepIds(activeDef);
      assert.deepStrictEqual(runnable, ["step-consume"]);
    });

    it("Invariant 4: Multi-Tenant Isolation — Cross-tenant access is rejected fail-closed", async () => {
      await assert.rejects(async () => {
        await service.verifyStepResult({
          tenantId: "cross-tenant-intruder",
          workflowInstanceId: "wfi-sec-01",
          stepId: "step-produce",
          verifierPrincipalId: "agent-auditor",
        });
      }, /not found/i);
    });

    it("Invariant 5: PolicyGateway fail-closed rejection", async () => {
      const rejectingPolicy: PolicyGateway = {
        async evaluate(context: PolicyContext): Promise<PolicyDecision> {
          return {
            allowed: false,
            policyId: "deny-verification-policy",
            reason: "Verification forbidden by compliance rules",
            code: "VERIFICATION_DENIED",
          };
        },
      };

      const gatedService = new WorkflowVerificationService({
        verificationRepo: vRepo,
        instanceRepo: instRepo,
        defRepo,
        policy: rejectingPolicy,
        events,
      });

      await assert.rejects(async () => {
        await gatedService.verifyStepResult({
          tenantId,
          workflowInstanceId: "wfi-sec-01",
          stepId: "step-produce",
          verifierPrincipalId: "agent-auditor",
        });
      }, VerificationPolicyDeniedError);
    });

    it("Invariant 6: Idempotent / Duplicate verification updates state monotonically", async () => {
      const res1 = await service.verifyStepResult({
        tenantId,
        workflowInstanceId: "wfi-sec-01",
        stepId: "step-produce",
        verifierPrincipalId: "agent-auditor",
      });

      assert.ok(res1);
      assert.strictEqual(res1.version, 1);

      // Verify that mutating the verification result increments version monotonically
      const updated = res1.updateVerdict({ verdict: "PASS", reason: "Re-certified" });
      await vRepo.save(updated);
      assert.strictEqual(updated.version, 2);

      const loaded = await vRepo.findById(res1.id, tenantId);
      assert.strictEqual(loaded?.version, 2);
    });
  });

  describe("SqliteVerificationResultRepository Persistence & OCC", () => {
    it("persists, finds, and enforces OCC in SQLite WAL storage", async () => {
      const db = new SqliteDatabase({ dbPath: ":memory:" });
      const repo = new SqliteVerificationResultRepository(db);

      const v1 = VerificationResult.create({
        id: "v-sql-1",
        tenantId,
        workflowId: "wf-1",
        workflowInstanceId: "wfi-1",
        workflowStepId: "step-1",
        verifierPrincipalId: "verifier-1",
        verifierSource: "SYSTEM",
        verdict: "PASS",
        method: "DETERMINISTIC",
        evidence: { ok: true },
      });

      await repo.save(v1);

      const loaded = await repo.findById("v-sql-1", tenantId);
      assert.ok(loaded);
      assert.strictEqual(loaded.id, "v-sql-1");
      assert.strictEqual(loaded.verdict, "PASS");
      assert.strictEqual(loaded.version, 1);

      // Update version
      const v2 = loaded.updateVerdict({ verdict: "FAIL", reason: "Corrupted after verification" });
      await repo.save(v2);

      const reloaded = await repo.findById("v-sql-1", tenantId);
      assert.strictEqual(reloaded?.verdict, "FAIL");
      assert.strictEqual(reloaded?.version, 2);

      // OCC Conflict: trying to save v2 again with outdated version
      await assert.rejects(async () => {
        await repo.save(v2);
      }, VerificationConcurrencyConflictError);
    });
  });
});
