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
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { TeamResourceBudget } from "../../src/domain/organization/team-resource-budget.js";

test("Prompt 111 — Platform HTTP REST API: Workflow Orchestration & Governed Task Assignment (/api/v1/workflows)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-workflow-test";
  const OTHER_TENANT = "tenant-other-wf";
  const TEST_KEY_SECRET = "secret-wf-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth, Org, Team, Agent Profile & Budgets", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-wf-1",
      principalId: "service-admin",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-wf-1.${TEST_KEY_SECRET}`;

    // Register agents
    const agent1 = Agent.create({
      id: "agent-doc-classifier",
      name: "Document Classifier",
      model: "stub-model",
      instructions: "Classify incoming documents",
      tools: [],
    });
    const agent2 = Agent.create({
      id: "agent-doc-extractor",
      name: "Document Extractor",
      model: "stub-model",
      instructions: "Extract structured data from documents",
      tools: [],
    });
    platform.agents.register(agent1);
    platform.agents.register(agent2);

    // Register org hierarchy
    const org = await platform.organizationService.createOrganization({ id: "org-docs", tenantId: TEST_TENANT, name: "Docs Org" });
    const area = await platform.organizationService.createArea({ id: "area-docs", organizationId: org.id, tenantId: TEST_TENANT, name: "Docs Area" });
    const team = await platform.organizationService.createTeam({ id: "team-doc-ops", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "Doc Ops Team" });

    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-doc-classifier", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });
    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-doc-extractor", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });

    // Assign agents and create profiles
    await platform.agentProfileService.createProfile({
      agentId: "agent-doc-classifier",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["doc-classification"],
      capabilities: [{ id: "doc-classify", name: "Doc Classifier", status: "VERIFIED" }],
    });

    await platform.agentProfileService.createProfile({
      agentId: "agent-doc-extractor",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["doc-extraction"],
      capabilities: [{ id: "doc-extract", name: "Doc Extractor", status: "VERIFIED" }],
    });

    // Create Team Budget
    await platform.teamResourceBudgetService.createBudget({
      teamId: team.id,
      tenantId: TEST_TENANT,
      limits: {
        maxExecutions: 50,
        maxModelCalls: 100,
        maxToolCalls: 100,
        maxAutonomousSteps: 100,
        maxDurationMs: 60000,
      },
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
      workflowOrchestratorService: platform.workflowOrchestratorService,
      eventStream: platform.eventStream,
    });

    server = createHttpServer(service, {
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      roleRepository: platform.roleRepository,
      apiKeyRepository: platform.apiKeyRepository,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    client = createPlatformClient({
      baseUrl,
      apiPrefix: "/api/v1",
      apiKey: apiKeyString,
      defaultHeaders: {
        "X-Tenant-Id": TEST_TENANT,
      },
    });
  });

  await t.test("POST /api/v1/workflows: Create Workflow Definition", async () => {
    const created = await client.workflows.createDefinition({
      id: "wf-doc-pipeline",
      organizationId: "org-docs",
      teamId: "team-doc-ops",
      name: "Document Intelligence Pipeline",
      description: "Classifies and extracts invoices",
      steps: [
        {
          stepId: "step-classify",
          name: "Classify Document",
          order: 1,
          purpose: "Identify document type",
          responsibility: "doc-classification",
          requiredCapabilities: ["doc-classify"],
        },
        {
          stepId: "step-extract",
          name: "Extract Metadata",
          order: 2,
          purpose: "Extract fields from document",
          dependsOn: ["step-classify"],
          responsibility: "doc-extraction",
          requiredCapabilities: ["doc-extract"],
        },
      ],
    });

    assert.equal(created.id, "wf-doc-pipeline");
    assert.equal(created.name, "Document Intelligence Pipeline");
    assert.equal(created.status, "DRAFT");
    assert.equal(created.steps.length, 2);
  });

  await t.test("GET /api/v1/workflows: List Workflow Definitions", async () => {
    const defs = await client.workflows.listDefinitions();
    assert.ok(Array.isArray(defs));
    assert.ok(defs.some((d) => d.id === "wf-doc-pipeline"));
  });

  await t.test("GET /api/v1/workflows/:id: Get Workflow Definition", async () => {
    const def = await client.workflows.getDefinition("wf-doc-pipeline");
    assert.equal(def.id, "wf-doc-pipeline");
    assert.equal(def.name, "Document Intelligence Pipeline");
  });

  await t.test("PUT /api/v1/workflows/:id: Update Workflow Definition", async () => {
    const updated = await client.workflows.updateDefinition("wf-doc-pipeline", {
      name: "Updated Document Intelligence Pipeline",
      description: "Updated description",
    });
    assert.equal(updated.name, "Updated Document Intelligence Pipeline");
    assert.equal(updated.version, 2);
  });

  await t.test("POST /api/v1/workflows/:id/activate: Activate Workflow Definition", async () => {
    const activated = await client.workflows.activateDefinition("wf-doc-pipeline");
    assert.equal(activated.status, "ACTIVE");
  });

  await t.test("POST /api/v1/workflows/:id/start: Start Workflow Execution and Auto-Advance", async () => {
    const startResult = await client.workflows.start("wf-doc-pipeline", {
      initiatorId: "ops-user",
      input: { file: "invoice-001.pdf" },
      autoAdvance: true,
    });

    assert.ok(startResult.instance);
    assert.equal(startResult.instance.status, "COMPLETED");
    assert.equal(startResult.executedSteps.length, 2);
    assert.equal(startResult.executedSteps[0]?.assignedAgentId, "agent-doc-classifier");
    assert.equal(startResult.executedSteps[1]?.assignedAgentId, "agent-doc-extractor");
  });

  await t.test("GET /api/v1/workflows/instances: List Instances", async () => {
    const instances = await client.workflows.listInstances();
    assert.ok(Array.isArray(instances));
    assert.ok(instances.length >= 1);
    assert.equal(instances[0]?.workflowDefinitionId, "wf-doc-pipeline");
  });

  await t.test("GET /api/v1/workflows/instances/:instanceId: Get Instance Details", async () => {
    const instances = await client.workflows.listInstances();
    const instId = instances[0]!.id;

    const inst = await client.workflows.getInstance(instId);
    assert.equal(inst.id, instId);
    assert.equal(inst.status, "COMPLETED");
    assert.equal(inst.stepStates["step-classify"]?.status, "COMPLETED");
    assert.equal(inst.stepStates["step-extract"]?.status, "COMPLETED");
  });

  await t.test("POST /api/v1/workflows/:id/archive: Archive Workflow Definition", async () => {
    const archived = await client.workflows.archiveDefinition("wf-doc-pipeline");
    assert.equal(archived.status, "ARCHIVED");
  });

  await t.test("DELETE /api/v1/workflows/:id: Delete Workflow Definition", async () => {
    const res = await client.workflows.deleteDefinition("wf-doc-pipeline");
    assert.equal(res.ok, true);
    assert.equal(res.deleted, true);
  });

  await t.test("Teardown: Close HTTP server", async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
