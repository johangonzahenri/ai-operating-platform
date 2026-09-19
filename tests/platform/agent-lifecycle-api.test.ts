import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

test("Prompt 114 — Platform HTTP REST API: Agent Lifecycle, Evaluation & Governance (/api/v1/agents/:id/lifecycle & /evaluations)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-lifecycle-api-test";
  const OTHER_TENANT = "tenant-other-lifecycle";
  const TEST_KEY_SECRET = "secret-lifecycle-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth, Org & Agent Lifecycle Services", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-lc-1",
      principalId: "admin-operator",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-lc-1.${TEST_KEY_SECRET}`;

    // Register worker agent
    const worker = Agent.create({
      id: "agent-forensics-specialist",
      name: "Forensics Specialist",
      model: "stub-model",
      instructions: "Perform digital forensics audits",
      tools: [],
    });
    platform.agents.register(worker);

    // Register org hierarchy
    const org = await platform.organizationService.createOrganization({ id: "org-sec", tenantId: TEST_TENANT, name: "Security Org" });
    const area = await platform.organizationService.createArea({ id: "area-sec", organizationId: org.id, tenantId: TEST_TENANT, name: "SecOps Area" });
    const team = await platform.organizationService.createTeam({ id: "team-sec", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "SecOps Team" });

    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-forensics-specialist", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });

    // Create profile
    await platform.agentProfileService.createProfile({
      agentId: "agent-forensics-specialist",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["SECURITY", "ANALYSIS"],
      capabilities: [
        { id: "log-analysis", name: "Log Analysis", status: "VERIFIED" },
        { id: "memory-dump", name: "Memory Dump Analysis", status: "DECLARED" },
      ],
    });

    service = new PlatformService({
      tasks: platform.tasks,
      taskRepository: platform.taskRepository,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      models: platform.modelRegistry,
      agents: platform.agents,
      agentService: platform.agentService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      operations: platform.operations,
      operationService: platform.operationService,
      eventStore: platform.eventStore,
      db: platform.db,
      diagnostics: platform.diagnostics,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      organizationalCoordinationService: platform.organizationalCoordinationService,
      agentProfileService: platform.agentProfileService,
      agentLifecycleService: platform.agentLifecycleService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      workflowVerificationService: platform.workflowVerificationService,
      humanOversightService: platform.humanOversightService,
      eventStream: platform.eventStream,
    });

    server = createHttpServer(service, {
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": TEST_TENANT,
      },
    });
  });

  await t.test("GET /api/v1/agents/:id/lifecycle returns default lifecycle state", async () => {
    const lc = await client.agentLifecycle.get("agent-forensics-specialist");
    assert.ok(lc);
    assert.equal(lc.agentId, "agent-forensics-specialist");
    assert.equal(lc.tenantId, TEST_TENANT);
    assert.equal(lc.state, "REGISTERED");
    assert.equal(lc.version, 1);
  });

  await t.test("POST /api/v1/agents/:id/evaluations creates formal evaluation and auto-verifies lifecycle", async () => {
    const evaluation = await client.agentEvaluations.create("agent-forensics-specialist", {
      agentId: "agent-forensics-specialist",
      evaluatorPrincipalId: "principal-qa-auditor",
      evaluationType: "CAPABILITY_CHECK",
      criteriaReference: "RULE-CAP-LOG-ANALYSIS-v1",
      verdict: "PASS",
      evidence: { passedTestSuites: 5, accuracy: 0.99 },
    });

    assert.ok(evaluation.id);
    assert.equal(evaluation.agentId, "agent-forensics-specialist");
    assert.equal(evaluation.verdict, "PASS");
    assert.equal(evaluation.evaluatedProfileVersion, 1);

    // Verify lifecycle was auto-transitioned to VERIFIED
    const lc = await client.agentLifecycle.get("agent-forensics-specialist");
    assert.equal(lc.state, "VERIFIED");
    assert.equal(lc.lastEvaluationId, evaluation.id);
  });

  await t.test("GET /api/v1/agents/:id/evaluations and GET .../latest return evaluation history", async () => {
    const evals = await client.agentEvaluations.list("agent-forensics-specialist");
    assert.equal(evals.length, 1);
    assert.ok(evals[0]);
    assert.equal(evals[0].evaluationType, "CAPABILITY_CHECK");

    const latest = await client.agentEvaluations.getLatest("agent-forensics-specialist", "CAPABILITY_CHECK");
    assert.ok(latest);
    assert.equal(latest.verdict, "PASS");
  });

  await t.test("POST /api/v1/agents/:id/lifecycle/activate activates the agent", async () => {
    const lc = await client.agentLifecycle.activate("agent-forensics-specialist", {
      operatorPrincipalId: "admin-operator",
    });

    assert.equal(lc.state, "ACTIVE");
    assert.equal(lc.version, 3);
  });

  await t.test("GET /api/v1/agents/:id/eligibility determines execution eligibility correctly", async () => {
    // 1. General eligibility for active agent
    const generalElig = await client.agentLifecycle.checkEligibility("agent-forensics-specialist");
    assert.equal(generalElig.eligible, true);
    assert.equal(generalElig.code, "ELIGIBLE");

    // 2. Capability verified in profile
    const verifiedCapElig = await client.agentLifecycle.checkEligibility("agent-forensics-specialist", {
      requiredCapability: "log-analysis",
      requireVerifiedCapability: true,
    });
    assert.equal(verifiedCapElig.eligible, true);

    // 3. Capability declared but not verified and no matching evaluation
    const declaredCapElig = await client.agentLifecycle.checkEligibility("agent-forensics-specialist", {
      requiredCapability: "memory-dump",
      requireVerifiedCapability: true,
    });
    assert.equal(declaredCapElig.eligible, false);
    assert.equal(declaredCapElig.code, "CAPABILITY_NOT_QUALIFIED");

    // 4. Missing capability
    const missingCapElig = await client.agentLifecycle.checkEligibility("agent-forensics-specialist", {
      requiredCapability: "quantum-cryptography",
    });
    assert.equal(missingCapElig.eligible, false);
    assert.equal(missingCapElig.code, "CAPABILITY_MISSING");
  });

  await t.test("POST /api/v1/agents/:id/lifecycle/suspend halts agent and blocks execution eligibility", async () => {
    const lc = await client.agentLifecycle.suspend("agent-forensics-specialist", {
      reason: "Suspicious activity detected in sandbox",
      operatorPrincipalId: "admin-operator",
    });

    assert.equal(lc.state, "SUSPENDED");
    assert.equal(lc.suspendedReason, "Suspicious activity detected in sandbox");

    const elig = await client.agentLifecycle.checkEligibility("agent-forensics-specialist");
    assert.equal(elig.eligible, false);
    assert.equal(elig.code, "AGENT_SUSPENDED");
  });

  await t.test("POST /api/v1/agents/:id/lifecycle/revoke invalidates agent permanently", async () => {
    const lc = await client.agentLifecycle.revoke("agent-forensics-specialist", {
      reason: "Security certificate revoked",
      operatorPrincipalId: "admin-operator",
    });

    assert.equal(lc.state, "REVOKED");

    // Attempting to re-activate revoked agent must fail
    await assert.rejects(
      () => client.agentLifecycle.activate("agent-forensics-specialist"),
      (err: any) => err.message.includes("Revoked agents cannot be activated") || err.message.includes("400")
    );
  });

  await t.test("Segregation of Duties: self-governance operations are rejected", async () => {
    // Agent attempting to evaluate itself
    await assert.rejects(
      () =>
        client.agentEvaluations.create("agent-forensics-specialist", {
          agentId: "agent-forensics-specialist",
          evaluatorPrincipalId: "agent-forensics-specialist", // Self-evaluation!
          evaluationType: "PROFILE_CHECK",
          criteriaReference: "SELF",
          verdict: "PASS",
        }),
      (err: any) => /self-governance/i.test(err.message) || err.message.includes("403") || err.status === 403
    );
  });

  await t.test("Workflow Orchestrator blocks execution when assigned agent is revoked/suspended", async () => {
    // 1. Create a workflow definition requiring our forensics agent
    const def = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-sec-investigation",
      organizationId: "org-sec",
      tenantId: TEST_TENANT,
      name: "Security Investigation Workflow",
      teamId: "team-sec",
      steps: [
        {
          stepId: "step-forensics",
          name: "Run Memory Forensics",
          order: 1,
          purpose: "Perform forensics inspection",
          assignedAgentId: "agent-forensics-specialist",
          requiredRole: "SPECIALIST",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(def.id, TEST_TENANT);

    // 2. Starting workflow should fail the step because the agent is REVOKED
    const { instance, executedSteps } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: def.id,
      tenantId: TEST_TENANT,
    });

    assert.equal(instance.status, "FAILED");
    assert.equal(executedSteps.length, 1);
    assert.ok(executedSteps[0]);
    assert.equal(executedSteps[0].success, false);
    assert.equal(executedSteps[0].error?.code, "AGENT_REVOKED");
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
