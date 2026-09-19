import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  AgentLifecycle,
  AgentLifecycleState,
} from "../../src/domain/agent/agent-lifecycle.js";
import {
  AgentEvaluation,
  EvaluationType,
  EvaluationVerdict,
} from "../../src/domain/agent/agent-evaluation.js";
import {
  AgentLifecycleError,
  AgentLifecycleValidationError,
  AgentLifecycleNotFoundError,
  AgentEvaluationNotFoundError,
  InvalidLifecycleTransitionError,
  AgentSuspendedError,
  AgentRevokedError,
  AgentDeprecatedError,
  SelfGovernanceError,
  AgentLifecycleConcurrencyConflictError,
  AgentEvaluationConcurrencyConflictError,
  AgentLifecycleTenantMismatchError,
} from "../../src/domain/agent/agent-lifecycle-errors.js";
import {
  InMemoryAgentLifecycleRepository,
  InMemoryAgentEvaluationRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-agent-evaluation-repository.js";
import {
  SqliteAgentLifecycleRepository,
  SqliteAgentEvaluationRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-agent-evaluation-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { InMemoryAgentProfileRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { AgentLifecycleService } from "../../src/application/agent/agent-lifecycle-service.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { DomainEvent } from "../../src/domain/events/events.js";

describe("Phase 65: Agent Lifecycle, Evaluation & Governance Unit Tests", () => {
  const tenantId = "tenant-enterprise-1";
  const agentId = "agent-analyst-007";
  const operatorPrincipalId = "user-operator-1";
  const evaluatorPrincipalId = "user-evaluator-1";

  describe("AgentLifecycle Domain Aggregate & State Transitions", () => {
    it("creates a valid lifecycle in REGISTERED state", () => {
      const lc = AgentLifecycle.create({
        agentId,
        tenantId,
        profileVersion: 1,
      });

      assert.equal(lc.agentId, agentId);
      assert.equal(lc.tenantId, tenantId);
      assert.equal(lc.state, "REGISTERED");
      assert.equal(lc.profileVersion, 1);
      assert.equal(lc.version, 1);
      assert.equal(lc.isEligibleForExecution(), false);
      assert.equal(lc.isEligibleForDiscovery(), false);
    });

    it("transitions REGISTERED -> EVALUATION_PENDING -> VERIFIED -> ACTIVE", () => {
      let lc = AgentLifecycle.create({ agentId, tenantId, profileVersion: 1 });

      lc = lc.startEvaluation(operatorPrincipalId);
      assert.equal(lc.state, "EVALUATION_PENDING");
      assert.equal(lc.version, 2);

      lc = lc.markVerified("eval-123", evaluatorPrincipalId);
      assert.equal(lc.state, "VERIFIED");
      assert.equal(lc.lastEvaluationId, "eval-123");
      assert.equal(lc.version, 3);
      assert.equal(lc.isEligibleForDiscovery(), true);
      assert.equal(lc.isEligibleForExecution(), false);

      lc = lc.activate(operatorPrincipalId);
      assert.equal(lc.state, "ACTIVE");
      assert.equal(lc.version, 4);
      assert.equal(lc.isEligibleForExecution(), true);
      assert.equal(lc.isEligibleForDiscovery(), true);
    });

    it("suspends, revokes, and deprecates with reason and audit", () => {
      let lc = AgentLifecycle.create({ agentId, tenantId, state: "ACTIVE", profileVersion: 1, version: 1 });

      // Suspend
      lc = lc.suspend("Security review pending", operatorPrincipalId);
      assert.equal(lc.state, "SUSPENDED");
      assert.equal(lc.suspendedReason, "Security review pending");
      assert.equal(lc.suspendedBy, operatorPrincipalId);
      assert.equal(lc.isEligibleForExecution(), false);

      // Re-activate
      lc = lc.activate(operatorPrincipalId);
      assert.equal(lc.state, "ACTIVE");
      assert.equal(lc.suspendedReason, undefined);

      // Deprecate
      lc = lc.deprecate("Migrated to v2 model", operatorPrincipalId);
      assert.equal(lc.state, "DEPRECATED");
      assert.equal(lc.deprecatedReason, "Migrated to v2 model");

      // Revoke from deprecated
      lc = lc.revoke("Credential compromised", operatorPrincipalId);
      assert.equal(lc.state, "REVOKED");
      assert.equal(lc.revokedReason, "Credential compromised");
    });

    it("rejects invalid state transitions (e.g. activating a revoked agent)", () => {
      const revoked = AgentLifecycle.create({
        agentId,
        tenantId,
        state: "REVOKED",
        revokedReason: "Terminated",
        version: 1,
      });

      assert.throws(
        () => revoked.activate(operatorPrincipalId),
        (err: any) => err instanceof InvalidLifecycleTransitionError
      );

      assert.throws(
        () => revoked.startEvaluation(operatorPrincipalId),
        (err: any) => err instanceof InvalidLifecycleTransitionError
      );

      assert.throws(
        () => revoked.suspend("some reason", operatorPrincipalId),
        (err: any) => err instanceof InvalidLifecycleTransitionError
      );
    });

    it("rejects self-governance operations (agent mutating itself)", () => {
      const lc = AgentLifecycle.create({ agentId, tenantId, state: "ACTIVE" });

      assert.throws(
        () => lc.suspend("self suspend", agentId),
        (err: any) => err instanceof SelfGovernanceError
      );

      assert.throws(
        () => lc.activate(agentId),
        (err: any) => err instanceof SelfGovernanceError
      );

      assert.throws(
        () => lc.revoke("self revoke", agentId),
        (err: any) => err instanceof SelfGovernanceError
      );
    });

    it("enforces OCC version matching on transitions", () => {
      const lc = AgentLifecycle.create({ agentId, tenantId, state: "ACTIVE", version: 5 });

      assert.throws(
        () => lc.suspend("conflict reason", operatorPrincipalId, 4),
        (err: any) => err instanceof AgentLifecycleConcurrencyConflictError
      );

      const updated = lc.suspend("valid reason", operatorPrincipalId, 5);
      assert.equal(updated.version, 6);
    });
  });

  describe("AgentEvaluation Aggregate Root & Qualification Semantics", () => {
    it("creates an evaluation in PENDING verdict", () => {
      const evalItem = AgentEvaluation.create({
        id: "eval-001",
        tenantId,
        agentId,
        evaluatedProfileVersion: 2,
        evaluatorPrincipalId,
        evaluationType: "CAPABILITY_CHECK",
        criteriaReference: "RULE-CAP-SQL-ANALYSIS-v1",
        evidence: { testScore: 100 },
      });

      assert.equal(evalItem.id, "eval-001");
      assert.equal(evalItem.verdict, "PENDING");
      assert.equal(evalItem.evaluatedProfileVersion, 2);
      assert.equal(evalItem.qualifiesProfile(2), false); // Not PASS yet
    });

    it("completes evaluation with PASS and qualifies specific profile version", () => {
      const evalItem = AgentEvaluation.create({
        id: "eval-002",
        tenantId,
        agentId,
        evaluatedProfileVersion: 2,
        evaluatorPrincipalId,
        evaluationType: "CAPABILITY_CHECK",
        criteriaReference: "RULE-CAP-SQL-ANALYSIS-v1",
      });

      const completed = evalItem.complete("PASS", { passedTests: 15 });
      assert.equal(completed.verdict, "PASS");
      assert.equal(completed.qualifiesProfile(2), true);

      // Invariant: Profile version mismatch does NOT qualify
      assert.equal(completed.qualifiesProfile(3), false);
      assert.equal(completed.qualifiesProfile(1), false);
    });

    it("handles expiration semantics correctly", () => {
      const past = new Date(Date.now() - 60000);
      const evalItem = AgentEvaluation.create({
        id: "eval-003",
        tenantId,
        agentId,
        evaluatedProfileVersion: 1,
        evaluatorPrincipalId,
        evaluationType: "POLICY_CHECK",
        criteriaReference: "RULE-SEC-01",
        verdict: "PASS",
        evaluatedAt: new Date(Date.now() - 120000),
        expiresAt: past,
      });

      assert.equal(evalItem.isExpired(), true);
      assert.equal(evalItem.qualifiesProfile(1), false);

      const expired = evalItem.expire();
      assert.equal(expired.verdict, "EXPIRED");
    });

    it("rejects self-evaluation (agent cannot evaluate itself)", () => {
      assert.throws(
        () =>
          AgentEvaluation.create({
            id: "eval-004",
            tenantId,
            agentId,
            evaluatedProfileVersion: 1,
            evaluatorPrincipalId: agentId, // Self!
            evaluationType: "PROFILE_CHECK",
            criteriaReference: "SELF-CHECK",
          }),
        (err: any) => err instanceof SelfGovernanceError
      );
    });
  });

  describe("AgentLifecycleService Governance & Eligibility Checks", () => {
    let lifecycleRepo: InMemoryAgentLifecycleRepository;
    let evalRepo: InMemoryAgentEvaluationRepository;
    let profileRepo: InMemoryAgentProfileRepository;
    let eventPublisher: InMemoryEventPublisher;
    let service: AgentLifecycleService;
    let publishedEvents: DomainEvent[];

    beforeEach(async () => {
      lifecycleRepo = new InMemoryAgentLifecycleRepository();
      evalRepo = new InMemoryAgentEvaluationRepository();
      profileRepo = new InMemoryAgentProfileRepository();
      publishedEvents = [];
      eventPublisher = new InMemoryEventPublisher();
      eventPublisher.subscribe((e) => publishedEvents.push(e));

      service = new AgentLifecycleService({
        lifecycleRepository: lifecycleRepo,
        evaluationRepository: evalRepo,
        profileRepository: profileRepo,
        events: eventPublisher,
      });

      // Seed profile and initial lifecycle
      const profile = AgentProfile.create({
        agentId,
        tenantId,
        organizationId: "org-1",
        teamId: "team-1",
        capabilities: [
          { id: "data-analysis", name: "Data Analysis", status: "DECLARED" },
          { id: "code-review", name: "Code Review", status: "VERIFIED" },
        ],
      });
      await profileRepo.save(profile);
      await lifecycleRepo.save(AgentLifecycle.create({ agentId, tenantId, state: "REGISTERED", profileVersion: 1 }));
    });

    it("evaluates agent, completes evaluation, and transitions lifecycle to VERIFIED on PASS", async () => {
      const evaluation = await service.evaluateAgent({
        id: "eval-svc-1",
        tenantId,
        agentId,
        evaluatorPrincipalId,
        evaluationType: "CAPABILITY_CHECK",
        criteriaReference: "CRIT-DATA-01",
        verdict: "PASS",
        evidence: { passed: true },
      });

      assert.equal(evaluation.verdict, "PASS");
      const lc = await service.getLifecycle(agentId, tenantId);
      assert.equal(lc.state, "VERIFIED");
      assert.equal(lc.lastEvaluationId, "eval-svc-1");

      // Verify domain events published
      assert.ok(publishedEvents.some((e) => e.type === "agent.evaluation.requested"));
      assert.ok(publishedEvents.some((e) => e.type === "agent.evaluation.completed"));
    });

    it("activates, suspends, and checks eligibility correctly", async () => {
      // 1. Initially VERIFIED / not active
      let eligibility = await service.checkEligibility({ agentId, tenantId });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.code, "LIFECYCLE_NOT_ACTIVE");

      // 2. Activate agent
      await service.activateAgent({ agentId, tenantId, operatorPrincipalId });
      eligibility = await service.checkEligibility({ agentId, tenantId });
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.code, "ELIGIBLE");

      // 3. Check declared vs verified capability eligibility
      const capDeclaredElig = await service.checkEligibility({
        agentId,
        tenantId,
        requiredCapability: "data-analysis",
        requireVerifiedCapability: true,
      });
      assert.equal(capDeclaredElig.eligible, false);
      assert.equal(capDeclaredElig.code, "CAPABILITY_NOT_QUALIFIED");

      const capVerifiedElig = await service.checkEligibility({
        agentId,
        tenantId,
        requiredCapability: "code-review",
        requireVerifiedCapability: true,
      });
      assert.equal(capVerifiedElig.eligible, true);

      // 4. Suspend agent
      await service.suspendAgent({ agentId, tenantId, operatorPrincipalId, reason: "Audit in progress" });
      const suspendedElig = await service.checkEligibility({ agentId, tenantId });
      assert.equal(suspendedElig.eligible, false);
      assert.equal(suspendedElig.code, "AGENT_SUSPENDED");

      // 5. Revoke agent
      await service.revokeAgent({ agentId, tenantId, operatorPrincipalId, reason: "Decommissioned" });
      const revokedElig = await service.checkEligibility({ agentId, tenantId });
      assert.equal(revokedElig.eligible, false);
      assert.equal(revokedElig.code, "AGENT_REVOKED");
    });

    it("rejects cross-tenant access and operations fail-closed", async () => {
      await assert.rejects(
        () => service.getLifecycle(agentId, "other-tenant"),
        (err: any) => err instanceof AgentLifecycleTenantMismatchError || err instanceof AgentLifecycleNotFoundError
      );

      await assert.rejects(
        () =>
          service.evaluateAgent({
            tenantId: "other-tenant",
            agentId,
            evaluatorPrincipalId,
            evaluationType: "PROFILE_CHECK",
            criteriaReference: "CROSS-TENANT",
          }),
        (err: any) => err instanceof AgentLifecycleTenantMismatchError || err instanceof AgentLifecycleValidationError
      );
    });

    it("sweeps expired evaluations correctly", async () => {
      const now = new Date();
      await service.evaluateAgent({
        id: "eval-expiring",
        tenantId,
        agentId,
        evaluatorPrincipalId,
        evaluationType: "PROFILE_CHECK",
        criteriaReference: "EXPIRE-TEST",
        verdict: "PASS",
        evaluatedAt: new Date(now.getTime() - 2000),
        expiresAt: new Date(now.getTime() - 1000),
      });

      const swept = await service.expireEvaluations(tenantId, now);
      assert.equal(swept, 1);

      const latest = await service.getLatestEvaluation(agentId, "PROFILE_CHECK", tenantId);
      assert.equal(latest?.verdict, "EXPIRED");
    });
  });

  describe("SqliteAgentLifecycleRepository & SqliteAgentEvaluationRepository (Durable Persistence & WAL)", () => {
    let tmpDir: string;
    let dbManager: SqliteDatabase;
    let sqliteLifecycleRepo: SqliteAgentLifecycleRepository;
    let sqliteEvalRepo: SqliteAgentEvaluationRepository;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aop-agent-eval-test-"));
      const dbPath = path.join(tmpDir, "platform.db");
      dbManager = new SqliteDatabase({ dbPath });
      sqliteLifecycleRepo = new SqliteAgentLifecycleRepository(dbManager);
      sqliteEvalRepo = new SqliteAgentEvaluationRepository(dbManager);
    });

    it("persists lifecycle, reads back, updates with OCC, and prevents conflicts", async () => {
      const lc = AgentLifecycle.create({
        agentId,
        tenantId,
        state: "REGISTERED",
        profileVersion: 1,
      });

      await sqliteLifecycleRepo.save(lc);
      const retrieved = await sqliteLifecycleRepo.findByAgentId(agentId, tenantId);
      assert.ok(retrieved);
      assert.equal(retrieved.agentId, agentId);
      assert.equal(retrieved.state, "REGISTERED");
      assert.equal(retrieved.version, 1);

      // Update
      const activated = retrieved.activate(operatorPrincipalId);
      await sqliteLifecycleRepo.save(activated);

      const updatedRetrieved = await sqliteLifecycleRepo.findByAgentId(agentId, tenantId);
      assert.ok(updatedRetrieved);
      assert.equal(updatedRetrieved.state, "ACTIVE");
      assert.equal(updatedRetrieved.version, 2);

      // OCC Conflict: trying to save with stale version
      await assert.rejects(
        () => sqliteLifecycleRepo.save(retrieved), // version 1 against current 2
        (err: any) => err instanceof AgentLifecycleConcurrencyConflictError
      );
    });

    it("persists evaluation, queries latest, queries expiring, and deletes", async () => {
      const now = new Date();
      const evaluation = AgentEvaluation.create({
        id: "eval-sqlite-1",
        tenantId,
        agentId,
        evaluatedProfileVersion: 1,
        evaluatorPrincipalId,
        evaluationType: "REGRESSION_CHECK",
        criteriaReference: "REG-01",
        verdict: "PASS",
        evidence: { passed: 42 },
        expiresAt: new Date(now.getTime() + 100000),
      });

      await sqliteEvalRepo.save(evaluation);

      const found = await sqliteEvalRepo.findById("eval-sqlite-1", tenantId);
      assert.ok(found);
      assert.equal(found.id, "eval-sqlite-1");
      assert.equal(found.evaluationType, "REGRESSION_CHECK");
      assert.equal(found.verdict, "PASS");

      const latest = await sqliteEvalRepo.findLatestByAgentAndType(agentId, "REGRESSION_CHECK", tenantId);
      assert.ok(latest);
      assert.equal(latest.id, "eval-sqlite-1");

      const expiring = await sqliteEvalRepo.findExpiringBefore(new Date(now.getTime() + 200000), tenantId);
      assert.equal(expiring.length, 1);

      const deleted = await sqliteEvalRepo.delete("eval-sqlite-1", tenantId);
      assert.equal(deleted, true);

      const notFound = await sqliteEvalRepo.findById("eval-sqlite-1", tenantId);
      assert.equal(notFound, null);
    });
  });
});
