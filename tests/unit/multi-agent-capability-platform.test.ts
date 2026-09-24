import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_AGENT_TAXONOMY, VALID_AGENT_TAXONOMY_TYPES } from "../../src/domain/agent/agent-taxonomy.js";
import { WebToolGateway } from "../../src/application/tools/web-tool-gateway.js";
import { WebDomainAccessDeniedError, WebRateLimitExceededError } from "../../src/domain/tools/web-tools.js";
import { ExternalAgentGateway } from "../../src/application/agent/external-agent-gateway.js";
import { CodexCliAgentProvider, OpenHandsAgentProvider, AiderAgentProvider } from "../../src/infrastructure/agent-providers/external-agent-adapters.js";
import { AgentEvaluationHarness, BenchmarkScenario } from "../../src/application/agent/agent-evaluation-harness.js";
import { AgentLifecycleService } from "../../src/application/agent/agent-lifecycle-service.js";
import { InMemoryAgentLifecycleRepository, InMemoryAgentEvaluationRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-evaluation-repository.js";
import { InMemoryAgentProfileRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { EventPublisher } from "../../src/domain/events/events.js";
import { ToolExecutionContext } from "../../src/domain/tools/tool-registry.js";

describe("Phase 141: Multi-Agent Web AI & Capability Platform", () => {
  const publishedEvents: any[] = [];
  const events: EventPublisher = {
    publish: (e: any) => {
      publishedEvents.push(e);
    },
  };

  describe("Agent Taxonomy & Governance Model", () => {
    it("defines all canonical agent taxonomy types with structured defaults", () => {
      assert.equal(VALID_AGENT_TAXONOMY_TYPES.length, 8);
      assert.equal(CANONICAL_AGENT_TAXONOMY.WEB_AGENT.taxonomyType, "WEB_AGENT");
      assert.equal(CANONICAL_AGENT_TAXONOMY.WEB_AGENT.policyDefaults.requireEvidenceProvenance, true);
      assert.equal(CANONICAL_AGENT_TAXONOMY.CODE_AGENT.policyDefaults.requireHumanApprovalForDestructive, true);
      assert.ok(CANONICAL_AGENT_TAXONOMY.VERIFICATION_AGENT.primaryResponsibilities.includes("VERIFICATION"));
    });
  });

  describe("Web AI & Governed WebToolGateway", () => {
    it("enforces allowedDomains whitelist and rejects unauthorized domains", async () => {
      const gateway = new WebToolGateway({
        policy: { allowedDomains: ["autoparts-trusted.com", "catalog.oem.org"] },
        events,
      });

      // Allowed domain
      assert.equal(gateway.validateDomainAccess("https://catalog.oem.org/parts/123"), "catalog.oem.org");

      // Blocked / non-whitelisted domain
      assert.throws(
        () => gateway.validateDomainAccess("https://malicious-tracker.com/exploit"),
        (err: any) => err instanceof WebDomainAccessDeniedError
      );
    });

    it("enforces blockedDomains blacklists fail-closed", () => {
      const gateway = new WebToolGateway({
        policy: { blockedDomains: ["spam-aggregator.com"] },
        events,
      });

      assert.throws(
        () => gateway.validateDomainAccess("https://sub.spam-aggregator.com/feed"),
        (err: any) => err instanceof WebDomainAccessDeniedError
      );
    });

    it("enforces rate limits per domain", () => {
      const gateway = new WebToolGateway({
        policy: { maxRequestsPerMinute: 2 },
        events,
      });

      gateway.validateDomainAccess("https://example.com/page1");
      gateway.validateDomainAccess("https://example.com/page2");
      assert.throws(
        () => gateway.validateDomainAccess("https://example.com/page3"),
        (err: any) => err instanceof WebRateLimitExceededError
      );
    });

    it("executes search and extraction with structured evidence claims", async () => {
      const gateway = new WebToolGateway({ events });
      const context: ToolExecutionContext = {
        traceId: "trace-web-01",
        executionId: "exec-01",
        taskId: "task-01",
        principalId: "user-1",
        agentId: "web-agent-01",
        toolId: "web.extract",
        riskLevel: "LOW",
      };

      const searchTool = gateway.createWebSearchTool();
      const searchRes = await searchTool.execute({ query: "alternator civic 2018" }, context);
      assert.ok(searchRes.output.results);

      const extractTool = gateway.createWebExtractTool();
      const extractRes = await extractTool.execute({ url: "https://oem-catalog.auto-parts.org/specs" }, context);
      assert.ok(extractRes.output.evidenceClaims);
      assert.ok(Array.isArray(extractRes.output.evidenceClaims));
      const claims = extractRes.output.evidenceClaims as any[];
      assert.equal(claims[0].verifiedDeterministically, true);
    });
  });

  describe("External Agent Providers & Gateway", () => {
    it("registers and delegates to external agent adapters (Codex, OpenHands, Aider) in sandbox", async () => {
      const gateway = new ExternalAgentGateway({ events });
      const codex = new CodexCliAgentProvider();
      const openhands = new OpenHandsAgentProvider();
      const aider = new AiderAgentProvider();

      gateway.registerProvider(codex);
      gateway.registerProvider(openhands);
      gateway.registerProvider(aider);

      const providers = gateway.listProviders();
      assert.equal(providers.length, 3);
      const providerIds = providers.map((p) => p.providerId);
      assert.ok(providerIds.includes("openai-codex-cli"));
      assert.ok(providerIds.includes("openhands-adapter"));
      assert.ok(providerIds.includes("aider-adapter"));

      // Invoke Codex adapter
      const codexRes = await gateway.invokeExternalAgent({
        providerId: "openai-codex-cli",
        agentId: "engineering-agent",
        traceId: "trace-ext-01",
        taskId: "task-code-01",
        input: { prompt: "Create parser for OEM codes" },
      });

      assert.equal(codexRes.status, "COMPLETED");
      assert.ok(String(codexRes.output.patch).includes("Generated patch"));

      // Invoke OpenHands adapter
      const ohRes = await gateway.invokeExternalAgent({
        providerId: "openhands-adapter",
        agentId: "workspace-agent",
        traceId: "trace-ext-02",
        taskId: "task-oh-01",
        input: { objective: "Audit project tree" },
      });

      assert.equal(ohRes.status, "COMPLETED");
      assert.equal(ohRes.output.workspaceStatus, "CLEAN");

      // Invoke Aider adapter
      const aiderRes = await gateway.invokeExternalAgent({
        providerId: "aider-adapter",
        agentId: "pair-agent",
        traceId: "trace-ext-03",
        taskId: "task-aider-01",
        input: { instruction: "Refactor domain boundary" },
      });

      assert.equal(aiderRes.status, "COMPLETED");
      assert.equal(aiderRes.output.allTestsPassed, true);
    });

    it("rejects unknown external providers fail-closed", async () => {
      const gateway = new ExternalAgentGateway({ events });
      await assert.rejects(
        async () => {
          await gateway.invokeExternalAgent({
            providerId: "non-existent-provider",
            agentId: "any-agent",
            traceId: "trace-err",
            taskId: "task-err",
            input: {},
          });
        },
        (err: any) => err.message.includes("External agent provider not found")
      );
    });
  });

  describe("Deterministic Agent Evaluation Harness", () => {
    it("evaluates agent scenarios reproducibly and binds passing results to agent lifecycle", async () => {
      const lifecycleRepo = new InMemoryAgentLifecycleRepository();
      const evalRepo = new InMemoryAgentEvaluationRepository();
      const profileRepo = new InMemoryAgentProfileRepository();

      const profile = AgentProfile.create({
        agentId: "researcher-01",
        tenantId: "tenant-corp",
        organizationId: "org-1",
        teamId: "team-ai",
        role: "SPECIALIST",
        capabilities: [{ id: "market_analysis", name: "Market Analysis", status: "VERIFIED" }],
      });
      await profileRepo.save(profile);

      const lifecycleService = new AgentLifecycleService({
        lifecycleRepository: lifecycleRepo,
        evaluationRepository: evalRepo,
        profileRepository: profileRepo,
        events,
      });

      const harness = new AgentEvaluationHarness(lifecycleService, profileRepo);

      const scenarios: BenchmarkScenario[] = [
        {
          id: "sc-01",
          name: "Structured Research Extraction",
          evaluationType: "REGRESSION_CHECK",
          targetTaxonomy: "RESEARCH_AGENT",
          requiredCapabilities: ["market_analysis"],
          inputPayload: { query: "OEM spark plugs" },
          expectedSchemaKeys: ["results", "evidence"],
          maxAllowedLatencyMs: 1000,
          criteriaReference: "AOP-EVAL-01",
        },
      ];

      const report = await harness.evaluateAgentComprehensive(
        "researcher-01",
        "tenant-corp",
        "evaluator-system",
        scenarios,
        async (_input) => {
          return {
            results: [{ item: "Spark Plug Bosch FR7DC+" }],
            evidence: { verified: true },
          };
        }
      );

      assert.equal(report.overallVerdict, "PASS");
      assert.equal(report.passedScenarios, 1);
      assert.equal(report.totalScenarios, 1);
      assert.ok(report.generatedEvaluationId);

      const evals = await evalRepo.findByAgentId("researcher-01", "tenant-corp");
      assert.equal(evals.length, 1);
      assert.equal(evals[0].verdict, "PASS");
    });
  });
});
