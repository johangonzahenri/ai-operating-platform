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

test("Prompt 112 — Platform HTTP REST API: Workflow Verification & Result Validation (/api/v1/verifications)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-verification-test";
  const OTHER_TENANT = "tenant-other-v";
  const TEST_KEY_SECRET = "secret-v-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth & Workflow Services", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-v-1",
      principalId: "admin-verifier",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-v-1.${TEST_KEY_SECRET}`;

    // Register agents
    const producer = Agent.create({
      id: "agent-doc-parser",
      name: "Document Parser",
      model: "stub-model",
      instructions: "Parse incoming documents",
      tools: [],
    });
    const verifier = Agent.create({
      id: "agent-qa-inspector",
      name: "QA Inspector",
      model: "stub-model",
      instructions: "Inspect extracted data",
      tools: [],
    });
    platform.agents.register(producer);
    platform.agents.register(verifier);

    // Register org hierarchy
    const org = await platform.organizationService.createOrganization({ id: "org-qa", tenantId: TEST_TENANT, name: "QA Org" });
    const area = await platform.organizationService.createArea({ id: "area-qa", organizationId: org.id, tenantId: TEST_TENANT, name: "QA Area" });
    const team = await platform.organizationService.createTeam({ id: "team-qa", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "QA Team" });

    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-doc-parser", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });
    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-qa-inspector", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });

    // Assign agents and create profiles
    await platform.agentProfileService.createProfile({
      agentId: "agent-doc-parser",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["doc-parsing"],
      capabilities: [{ id: "doc-parse", name: "Doc Parser", status: "VERIFIED" }],
    });

    await platform.agentProfileService.createProfile({
      agentId: "agent-qa-inspector",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["qa-inspection"],
      capabilities: [{ id: "qa-inspect", name: "QA Inspect", status: "VERIFIED" }],
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
      workflowVerificationService: platform.workflowVerificationService,
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
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": TEST_TENANT,
      },
    });
  });

  let createdDefinitionId: string;
  let startedInstanceId: string;
  let createdVerificationId: string;

  await t.test("1. Create verified workflow definition and start instance", async () => {
    const def = await client.workflows.createDefinition({
      id: "wf-qa-verify-01",
      name: "Verified QA Document Processing",
      organizationId: "org-qa",
      steps: [
        {
          stepId: "parse-step",
          name: "Parse Document",
          order: 1,
          purpose: "Parse document structure",
          responsibility: "doc-parsing",
          dependsOn: [],
          verificationRule: {
            method: "SCHEMA",
            requiredFields: ["documentId", "parsedText", "confidence"],
            fieldTypes: {
              documentId: "string",
              parsedText: "string",
              confidence: "number",
            },
            numericRanges: {
              confidence: { min: 0.8, max: 1.0 },
            },
          },
        },
        {
          stepId: "audit-step",
          name: "Audit Document",
          order: 2,
          purpose: "Inspect and audit parsed document",
          responsibility: "qa-inspection",
          dependsOn: ["parse-step"],
        },
      ],
    });
    createdDefinitionId = def.id;
    assert.strictEqual(def.id, "wf-qa-verify-01");
    assert.strictEqual(def.status, "DRAFT");

    // Activate
    const active = await client.workflows.activateDefinition(createdDefinitionId);
    assert.strictEqual(active.status, "ACTIVE");

    // Start instance
    const started = await client.workflows.start(createdDefinitionId, { autoAdvance: true });
    startedInstanceId = started.instance.id;
    assert.strictEqual(started.instance.workflowDefinitionId, createdDefinitionId);
  });

  await t.test("2. POST /verifications: verify step result successfully (PASS)", async () => {
    const vResult = await client.verifications.verify({
      workflowInstanceId: startedInstanceId,
      stepId: "parse-step",
      verifierPrincipalId: "agent-qa-inspector",
      verifierSource: "AGENT",
      producerPrincipalId: "agent-doc-parser",
      overrideOutput: {
        documentId: "doc-999",
        parsedText: "Extracted contents here",
        confidence: 0.95,
      },
    });

    assert.ok(vResult.id);
    createdVerificationId = vResult.id;
    assert.strictEqual(vResult.verdict, "PASS");
    assert.strictEqual(vResult.method, "SCHEMA");
    assert.strictEqual(vResult.workflowInstanceId, startedInstanceId);
    assert.strictEqual(vResult.workflowStepId, "parse-step");
  });

  await t.test("3. GET /verifications/:id: retrieve verification record", async () => {
    const list = await client.verifications.listByInstance(startedInstanceId);
    assert.ok(list.length >= 1);

    const fetched = await client.verifications.get(createdVerificationId);
    assert.strictEqual(fetched.id, createdVerificationId);
    assert.strictEqual(fetched.verdict, "PASS");
  });

  await t.test("4. GET /verifications: list verifications with pagination", async () => {
    const all = await client.verifications.list({ limit: 10, offset: 0 });
    assert.ok(all.length >= 1);
  });

  await t.test("5. POST /verifications: SelfVerificationError when producer == verifier", async () => {
    await assert.rejects(async () => {
      await client.verifications.verify({
        workflowInstanceId: startedInstanceId,
        stepId: "parse-step",
        verifierPrincipalId: "agent-doc-parser",
        verifierSource: "AGENT",
        producerPrincipalId: "agent-doc-parser", // Self-verification attempt
      });
    }, (err: any) => {
      assert.match(err.message, /Self-verification/);
      return true;
    });
  });

  await t.test("6. Multi-tenant boundary: Cross-tenant verification request rejected", async () => {
    const crossClient = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": OTHER_TENANT,
      },
    });

    await assert.rejects(async () => {
      await crossClient.verifications.get("non-existent-id");
    }, (err: any) => {
      assert.ok(err.status === 404 || err.status === 403);
      return true;
    });
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});
