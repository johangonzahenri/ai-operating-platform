/**
 * Phase 66 Unit Tests: AI Solutions Factory & Blueprint Governance
 * 
 * Invariant & Adversarial Test Suite for:
 * 1. AISolution Aggregate Root & Lifecycle FSM
 * 2. SolutionBlueprint Composition & Immutability
 * 3. Deterministic Blueprint Validation
 * 4. Publish Gate & Reproducibility
 * 5. Agent Governance Integration (Active/Suspended/Revoked/Unqualified)
 * 6. Multi-Tenant Isolation
 * 7. OCC Concurrency Control
 * 8. SQLite WAL Persistence
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AISolution,
  SolutionLifecycleState,
} from "../../src/domain/solution/ai-solution.js";
import {
  SolutionBlueprint,
  SolutionBlueprintProps,
} from "../../src/domain/solution/solution-blueprint.js";
import { SolutionInstance } from "../../src/domain/solution/solution-instance.js";
import {
  SolutionValidationError,
  SolutionNotFoundError,
  SolutionVersionNotFoundError,
  InvalidSolutionLifecycleTransitionError,
  SolutionNotValidatedError,
  SolutionPublishedImmutableError,
  SolutionConcurrencyConflictError,
  SolutionTenantMismatchError,
} from "../../src/domain/solution/solution-errors.js";
import { SolutionBlueprintValidator } from "../../src/application/solution/solution-blueprint-validator.js";
import { SolutionFactoryService } from "../../src/application/solution/solution-factory-service.js";
import {
  InMemoryAISolutionRepository,
  InMemoryAISolutionInstanceRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-solution-repository.js";
import {
  SqliteAISolutionRepository,
  SqliteAISolutionInstanceRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-solution-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { InMemoryWorkflowDefinitionRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import { InMemoryAgentProfileRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { AgentLifecycleService } from "../../src/application/agent/agent-lifecycle-service.js";
import {
  InMemoryAgentLifecycleRepository,
  InMemoryAgentEvaluationRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-agent-evaluation-repository.js";
import { AgentLifecycle } from "../../src/domain/agent/agent-lifecycle.js";

describe("Phase 66: AI Solutions Factory & Blueprint Governance Unit Tests", () => {
  const tenantId = "tenant-enterprise-01";
  const otherTenantId = "tenant-competitor-99";
  const ownerPrincipalId = "principal-lead-architect";

  describe("AISolution Aggregate Root & Lifecycle FSM", () => {
    it("creates a valid AI Solution in DRAFT status at version 1", () => {
      const solution = AISolution.create({
        id: "solution-commerce-core",
        tenantId,
        name: "Tentaciones AI Commerce",
        description: "Unified AI-driven digital commerce solution",
        ownerPrincipalId,
        blueprint: {
          workflows: [{ workflowDefinitionId: "wf-order-fulfillment" }],
          requiredAgents: [{ agentId: "agent-recommender" }],
          requiredCapabilities: [{ capabilityId: "product.discovery" }],
        },
      });

      assert.equal(solution.id, "solution-commerce-core");
      assert.equal(solution.tenantId, tenantId);
      assert.equal(solution.version, 1);
      assert.equal(solution.lifecycleState, "DRAFT");
      assert.equal(solution.blueprint.workflows.length, 1);
      assert.equal(solution.concurrencyVersion, 1);
    });

    it("rejects creation with empty or missing mandatory fields", () => {
      assert.throws(
        () =>
          AISolution.create({
            id: "",
            tenantId,
            name: "Test",
            description: "Test",
            ownerPrincipalId,
          }),
        SolutionValidationError
      );

      assert.throws(
        () =>
          AISolution.create({
            id: "sol-1",
            tenantId: "",
            name: "Test",
            description: "Test",
            ownerPrincipalId,
          }),
        SolutionValidationError
      );

      assert.throws(
        () =>
          AISolution.create({
            id: "sol-1",
            tenantId,
            name: "",
            description: "Test",
            ownerPrincipalId,
          }),
        SolutionValidationError
      );
    });

    it("transitions lifecycle through DRAFT -> VALIDATING -> VALIDATED -> PUBLISHED", () => {
      let solution = AISolution.create({
        id: "solution-support-mesh",
        tenantId,
        name: "Customer Support Mesh",
        description: "Omnichannel customer resolution solution",
        ownerPrincipalId,
      });

      assert.equal(solution.lifecycleState, "DRAFT");

      // DRAFT -> VALIDATING
      solution = solution.startValidation(ownerPrincipalId);
      assert.equal(solution.lifecycleState, "VALIDATING");

      // VALIDATING -> VALIDATED
      const report = {
        valid: true,
        errors: [],
        warnings: [],
        validatedAt: new Date(),
        checkedComponents: {
          workflowsCount: 0,
          agentsCount: 0,
          capabilitiesCount: 0,
          policiesCount: 0,
          verificationsCount: 0,
          approvalsCount: 0,
        },
      };
      solution = solution.markValidated(report, ownerPrincipalId);
      assert.equal(solution.lifecycleState, "VALIDATED");
      assert.ok(solution.lastValidationReport?.valid);

      // VALIDATED -> PUBLISHED
      solution = solution.publish(ownerPrincipalId);
      assert.equal(solution.lifecycleState, "PUBLISHED");
      assert.ok(solution.publishedAt instanceof Date);
    });

    it("enforces Publish Gate: cannot publish without validation or in DRAFT state", () => {
      const solution = AISolution.create({
        id: "solution-unvalidated",
        tenantId,
        name: "Unvalidated Solution",
        description: "Draft solution",
        ownerPrincipalId,
      });

      assert.throws(
        () => solution.publish(ownerPrincipalId),
        SolutionNotValidatedError
      );
    });

    it("enforces Immutability of Published Solutions: cannot edit in-place", () => {
      let solution = AISolution.create({
        id: "solution-immutable-test",
        tenantId,
        name: "Immutable Solution",
        description: "Frozen solution",
        ownerPrincipalId,
      });

      solution = solution.startValidation(ownerPrincipalId);
      solution = solution.markValidated(
        {
          valid: true,
          errors: [],
          warnings: [],
          validatedAt: new Date(),
          checkedComponents: {
            workflowsCount: 0,
            agentsCount: 0,
            capabilitiesCount: 0,
            policiesCount: 0,
            verificationsCount: 0,
            approvalsCount: 0,
          },
        },
        ownerPrincipalId
      );
      solution = solution.publish(ownerPrincipalId);

      assert.throws(
        () => solution.updateDraft({ name: "Hacked Update" }, ownerPrincipalId),
        SolutionPublishedImmutableError
      );
    });

    it("supports version branching: creates new DRAFT version from published solution", () => {
      let solution = AISolution.create({
        id: "solution-versioning-test",
        tenantId,
        name: "Tentaciones Platform",
        description: "Version 1",
        ownerPrincipalId,
        blueprint: {
          requiredCapabilities: [{ capabilityId: "product.discovery" }],
        },
      });

      solution = solution.startValidation(ownerPrincipalId);
      solution = solution.markValidated(
        {
          valid: true,
          errors: [],
          warnings: [],
          validatedAt: new Date(),
          checkedComponents: {
            workflowsCount: 0,
            agentsCount: 0,
            capabilitiesCount: 1,
            policiesCount: 0,
            verificationsCount: 0,
            approvalsCount: 0,
          },
        },
        ownerPrincipalId
      );
      solution = solution.publish(ownerPrincipalId);

      // Branch to version 2
      const version2Draft = solution.createNewDraftVersion(2, ownerPrincipalId);
      assert.equal(version2Draft.id, solution.id);
      assert.equal(version2Draft.version, 2);
      assert.equal(version2Draft.lifecycleState, "DRAFT");
      assert.equal(version2Draft.concurrencyVersion, 1);
    });

    it("enforces Optimistic Concurrency Control (OCC)", () => {
      const solution = AISolution.create({
        id: "solution-occ-test",
        tenantId,
        name: "OCC Solution",
        description: "Initial",
        ownerPrincipalId,
      });

      // Update with matching version passes
      const updated = solution.updateDraft({ name: "Updated" }, ownerPrincipalId, 1);
      assert.equal(updated.concurrencyVersion, 2);

      // Update with stale version throws conflict
      assert.throws(
        () => solution.updateDraft({ name: "Stale" }, ownerPrincipalId, 99),
        SolutionConcurrencyConflictError
      );
    });

    it("supports archiving and deprecating solutions", () => {
      const solution = AISolution.create({
        id: "solution-lifecycle-terminals",
        tenantId,
        name: "Terminal Solution",
        description: "Testing terminals",
        ownerPrincipalId,
      });

      const archived = solution.archive(ownerPrincipalId, "End of lifecycle");
      assert.equal(archived.lifecycleState, "ARCHIVED");

      const deprecated = solution.deprecate(ownerPrincipalId, "Superseded by v2");
      assert.equal(deprecated.lifecycleState, "DEPRECATED");
    });
  });

  describe("Deterministic Blueprint Validation & Governance Integration", () => {
    let workflowRepo: InMemoryWorkflowDefinitionRepository;
    let agentProfileRepo: InMemoryAgentProfileRepository;
    let agentLifecycleRepo: InMemoryAgentLifecycleRepository;
    let agentEvalRepo: InMemoryAgentEvaluationRepository;
    let agentLifecycleService: AgentLifecycleService;
    let validator: SolutionBlueprintValidator;

    beforeEach(async () => {
      workflowRepo = new InMemoryWorkflowDefinitionRepository();
      agentProfileRepo = new InMemoryAgentProfileRepository();
      agentLifecycleRepo = new InMemoryAgentLifecycleRepository();
      agentEvalRepo = new InMemoryAgentEvaluationRepository();

      agentLifecycleService = new AgentLifecycleService({
        lifecycleRepository: agentLifecycleRepo,
        evaluationRepository: agentEvalRepo,
        profileRepository: agentProfileRepo,
      });

      validator = new SolutionBlueprintValidator({
        workflowRepo,
        agentProfileRepo,
        agentLifecycleService,
      });

      // Setup active workflow
      const wfDef = WorkflowDefinition.create({
        id: "wf-recommendations",
        tenantId,
        organizationId: "org-01",
        name: "Product Recommendation Flow",
        description: "Recommends products",
        steps: [
          {
            stepId: "step-fetch",
            name: "Fetch Catalog",
            purpose: "Fetches product catalog items",
            order: 1,
            dependsOn: [],
          },
        ],
      });
      const activeWf = wfDef.activate();
      await workflowRepo.save(activeWf);

      // Setup active agent profile with verified capability
      const profile = AgentProfile.create({
        agentId: "agent-smart-recommender",
        tenantId,
        organizationId: "org-01",
        teamId: "team-01",
        role: "SPECIALIST",
        responsibilities: ["ANALYSIS"],
      });
      const withCap = profile.addCapability({ id: "product.discovery", name: "AI Product Discovery" }).verifyCapability("product.discovery", "verifier-01");
      await agentProfileRepo.save(withCap);

      // Setup agent lifecycle state: ACTIVE
      const lifecycle = AgentLifecycle.create({
        agentId: "agent-smart-recommender",
        tenantId,
        profileVersion: withCap.version,
      });
      const evalPending = lifecycle.startEvaluation("evaluator-01");
      const verified = evalPending.markVerified("eval-001", "evaluator-01");
      const activeAgent = verified.activate(ownerPrincipalId);
      await agentLifecycleRepo.save(activeAgent);
    });

    it("validates a fully compliant blueprint with 0 errors", async () => {
      const blueprint = new SolutionBlueprint({
        workflows: [{ workflowDefinitionId: "wf-recommendations", requiredVersion: 1 }],
        requiredAgents: [
          {
            agentId: "agent-smart-recommender",
            requiredRole: "SPECIALIST",
            requiredCapabilities: ["product.discovery"],
          },
        ],
        requiredCapabilities: [{ capabilityId: "product.discovery" }],
        requiredPolicies: [{ policyId: "policy-standard-tier" }],
        verificationRequirements: [{ stepIdOrRule: "rule-catalog-pass", requiredVerdict: "PASS" }],
        approvalRequirements: [{ actionOrStep: "step-order-finalize", requiredRole: "MANAGER" }],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, true);
      assert.equal(report.errors.length, 0);
      assert.equal(report.checkedComponents.workflowsCount, 1);
      assert.equal(report.checkedComponents.agentsCount, 1);
      assert.equal(report.checkedComponents.capabilitiesCount, 1);
    });

    it("rejects blueprint referencing a non-existent workflow", async () => {
      const blueprint = new SolutionBlueprint({
        workflows: [{ workflowDefinitionId: "wf-non-existent" }],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("wf-non-existent")));
    });

    it("rejects blueprint referencing a workflow in DRAFT status", async () => {
      const draftWf = WorkflowDefinition.create({
        id: "wf-draft-only",
        tenantId,
        organizationId: "org-01",
        name: "Draft Flow",
        description: "Not active",
        steps: [{ stepId: "step-1", name: "S1", purpose: "Test draft step", order: 1, dependsOn: [] }],
      });
      await workflowRepo.save(draftWf);

      const blueprint = new SolutionBlueprint({
        workflows: [{ workflowDefinitionId: "wf-draft-only" }],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("must be 'ACTIVE'")));
    });

    it("rejects blueprint referencing an inactive / suspended agent", async () => {
      // Suspend the agent
      const current = await agentLifecycleRepo.findByAgentId("agent-smart-recommender", tenantId);
      const suspended = current!.suspend("Compliance audit in progress", ownerPrincipalId);
      await agentLifecycleRepo.save(suspended);

      const blueprint = new SolutionBlueprint({
        requiredAgents: [{ agentId: "agent-smart-recommender" }],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("not eligible") || e.includes("SUSPENDED")));
    });

    it("rejects blueprint referencing an agent missing required verified capabilities", async () => {
      const blueprint = new SolutionBlueprint({
        requiredAgents: [
          {
            agentId: "agent-smart-recommender",
            requiredCapabilities: ["ar.fitting_room"], // Not possessed
          },
        ],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("does not possess required capability")));
    });

    it("enforces Multi-Tenant Isolation: rejects cross-tenant workflow or agent reference", async () => {
      // Create foreign tenant workflow
      const foreignWf = WorkflowDefinition.create({
        id: "wf-foreign-secret",
        tenantId: otherTenantId,
        organizationId: "org-foreign",
        name: "Foreign Flow",
        description: "Foreign",
        steps: [{ stepId: "s1", name: "S1", purpose: "Foreign step", order: 1, dependsOn: [] }],
      }).activate();
      await workflowRepo.save(foreignWf);

      const blueprint = new SolutionBlueprint({
        workflows: [{ workflowDefinitionId: "wf-foreign-secret" }],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("was not found in tenant")));
    });

    it("rejects invalid verification requirement where verdict is not PASS", async () => {
      const blueprint = new SolutionBlueprint({
        verificationRequirements: [
          { stepIdOrRule: "step-check", requiredVerdict: "FAIL" as any },
        ],
      });

      const report = await validator.validate(blueprint, tenantId);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes("requiredVerdict='PASS'")));
    });
  });

  describe("SolutionFactoryService & Solution Instances", () => {
    let service: SolutionFactoryService;
    let solutionRepo: InMemoryAISolutionRepository;
    let instanceRepo: InMemoryAISolutionInstanceRepository;
    let workflowRepo: InMemoryWorkflowDefinitionRepository;
    let agentProfileRepo: InMemoryAgentProfileRepository;

    beforeEach(async () => {
      solutionRepo = new InMemoryAISolutionRepository();
      instanceRepo = new InMemoryAISolutionInstanceRepository();
      workflowRepo = new InMemoryWorkflowDefinitionRepository();
      agentProfileRepo = new InMemoryAgentProfileRepository();

      const validator = new SolutionBlueprintValidator({
        workflowRepo,
        agentProfileRepo,
      });

      service = new SolutionFactoryService({
        solutionRepo,
        instanceRepo,
        validator,
      });

      // Active workflow
      const wf = WorkflowDefinition.create({
        id: "wf-tentaciones-checkout",
        tenantId,
        organizationId: "org-01",
        name: "Checkout",
        description: "Checkout workflow",
        steps: [{ stepId: "s1", name: "S1", purpose: "Checkout step", order: 1, dependsOn: [] }],
      }).activate();
      await workflowRepo.save(wf);
    });

    it("orchestrates full lifecycle: create -> compose -> validate -> publish -> instantiate", async () => {
      // 1. Create
      const created = await service.createSolution({
        id: "tentaciones-ai-commerce",
        tenantId,
        name: "Tentaciones AI Commerce Solution",
        description: "Full e-commerce AI suite",
        ownerPrincipalId,
        blueprint: {
          workflows: [{ workflowDefinitionId: "wf-tentaciones-checkout" }],
          requiredCapabilities: [{ capabilityId: "product.discovery" }],
        },
      });
      assert.equal(created.lifecycleState, "DRAFT");

      // 2. Validate
      const { solution: validated, report } = await service.validateSolution({
        id: "tentaciones-ai-commerce",
        tenantId,
        principalId: ownerPrincipalId,
      });
      assert.equal(validated.lifecycleState, "VALIDATED");
      assert.equal(report.valid, true);

      // 3. Publish
      const published = await service.publishSolution({
        id: "tentaciones-ai-commerce",
        tenantId,
        principalId: ownerPrincipalId,
      });
      assert.equal(published.lifecycleState, "PUBLISHED");

      // 4. Instantiate
      const instance = await service.instantiateSolution({
        solutionId: "tentaciones-ai-commerce",
        solutionVersion: 1,
        tenantId,
        name: "Production Store Instance",
        config: { environment: "production", currency: "CLP" },
        operatorPrincipalId: "operator-store-admin",
      });
      assert.equal(instance.solutionId, "tentaciones-ai-commerce");
      assert.equal(instance.solutionVersion, 1);
      assert.equal(instance.status, "INITIALIZED");

      const retrievedInstance = await service.getInstance(instance.id, tenantId);
      assert.ok(retrievedInstance);
      assert.equal(retrievedInstance?.name, "Production Store Instance");
    });

    it("rejects instantiating an un-published solution", async () => {
      await service.createSolution({
        id: "draft-solution-cannot-instantiate",
        tenantId,
        name: "Draft Solution",
        description: "Draft",
        ownerPrincipalId,
      });

      await assert.rejects(
        () =>
          service.instantiateSolution({
            solutionId: "draft-solution-cannot-instantiate",
            tenantId,
            operatorPrincipalId: ownerPrincipalId,
          }),
        SolutionValidationError
      );
    });
  });

  describe("SqliteAISolutionRepository & Persistence", () => {
    let db: SqliteDatabase;
    let repo: SqliteAISolutionRepository;
    let instanceRepo: SqliteAISolutionInstanceRepository;

    beforeEach(() => {
      db = new SqliteDatabase({ dbPath: ":memory:" });
      repo = new SqliteAISolutionRepository(db);
      instanceRepo = new SqliteAISolutionInstanceRepository(db);
    });

    it("persists, finds, and lists AI Solutions across multiple versions in SQLite WAL storage", async () => {
      const solutionV1 = AISolution.create({
        id: "sqlite-solution-test",
        tenantId,
        name: "SQLite Solution v1",
        description: "Testing SQLite WAL persistence",
        ownerPrincipalId,
        blueprint: {
          requiredCapabilities: [{ capabilityId: "product.discovery" }],
        },
      });

      await repo.save(solutionV1);

      const found = await repo.findById("sqlite-solution-test", tenantId);
      assert.ok(found);
      assert.equal(found?.id, "sqlite-solution-test");
      assert.equal(found?.version, 1);
      assert.equal(found?.blueprint.requiredCapabilities.length, 1);

      // Validate & Publish
      const validated = solutionV1
        .startValidation(ownerPrincipalId)
        .markValidated(
          {
            valid: true,
            errors: [],
            warnings: [],
            validatedAt: new Date(),
            checkedComponents: {
              workflowsCount: 0,
              agentsCount: 0,
              capabilitiesCount: 1,
              policiesCount: 0,
              verificationsCount: 0,
              approvalsCount: 0,
            },
          },
          ownerPrincipalId
        );
      const published = validated.publish(ownerPrincipalId);
      await repo.save(published);

      // Create v2
      const draftV2 = published.createNewDraftVersion(2, ownerPrincipalId);
      await repo.save(draftV2);

      const versions = await repo.listVersions("sqlite-solution-test", tenantId);
      assert.equal(versions.length, 2);
      assert.equal(versions[0]?.version, 1);
      assert.equal(versions[1]?.version, 2);

      // Multi-tenant check: other tenant cannot find
      const foreign = await repo.findById("sqlite-solution-test", otherTenantId);
      assert.equal(foreign, undefined);
    });

    it("persists and queries Solution Instances in SQLite storage", async () => {
      const instance = SolutionInstance.create({
        id: "inst-sqlite-001",
        solutionId: "sol-commerce",
        solutionVersion: 1,
        tenantId,
        name: "Chile Regional Store",
        config: { region: "CL", currency: "CLP" },
        operatorPrincipalId: "operator-01",
      });

      await instanceRepo.save(instance);

      const found = await instanceRepo.findById("inst-sqlite-001", tenantId);
      assert.ok(found);
      assert.equal(found?.name, "Chile Regional Store");
      assert.equal(found?.config.currency, "CLP");

      const list = await instanceRepo.listBySolution("sol-commerce", tenantId);
      assert.equal(list.length, 1);
    });
  });
});
