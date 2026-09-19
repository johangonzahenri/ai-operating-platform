/**
 * Phase 66 Platform API Tests: AI Solutions Factory & Blueprint Governance
 * 
 * End-to-end HTTP REST & SDK Client verification for:
 * - POST /api/v1/solutions (Create Solution DRAFT v1)
 * - GET /api/v1/solutions (List Solutions with filtering)
 * - GET /api/v1/solutions/:id (Get Solution by ID)
 * - PATCH /api/v1/solutions/:id (Update Solution Draft)
 * - POST /api/v1/solutions/:id/validate (Run Deterministic Validation)
 * - POST /api/v1/solutions/:id/publish (Publish Gate & Publish)
 * - POST /api/v1/solutions/:id/versions (Branch new version)
 * - GET /api/v1/solutions/:id/versions (List all versions)
 * - GET /api/v1/solutions/:id/versions/:version (Get specific version)
 * - GET /api/v1/solutions/:id/blueprint (Get Blueprint)
 * - POST /api/v1/solutions/:id/archive (Archive Solution)
 * - POST /api/v1/solutions/:id/deprecate (Deprecate Solution)
 * - POST /api/v1/solutions/:id/instantiate (Instantiate Solution)
 * - GET /api/v1/solutions/:id/instances (List Solution Instances)
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";

test("Phase 66 — Platform HTTP REST API: AI Solutions Factory & Blueprint Governance (/api/v1/solutions/*)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-solutions-api-test";
  const OTHER_TENANT = "tenant-other-solutions";
  const TEST_KEY_SECRET = "secret-solutions-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth & Solution Factory", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-sol-1",
      principalId: "admin-architect",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-sol-1.${TEST_KEY_SECRET}`;

    // Register active workflow for solution composition
    const wf = WorkflowDefinition.create({
      id: "wf-order-management",
      tenantId: TEST_TENANT,
      organizationId: "org-01",
      name: "Order Management",
      description: "Order processing pipeline",
      steps: [{ stepId: "step-1", name: "Process", purpose: "Process orders", order: 1, dependsOn: [] }],
    }).activate();
    await platform.workflowDefinitionRepository.save(wf);

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      agentProfileService: platform.agentProfileService,
      agentLifecycleService: platform.agentLifecycleService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      workflowVerificationService: platform.workflowVerificationService,
      humanOversightService: platform.humanOversightService,
      solutionFactoryService: platform.solutionFactoryService,
    });

    server = createHttpServer(service, {
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
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

  await t.test("1. POST /api/v1/solutions: creates solution in DRAFT v1", async () => {
    const solution = await client.solutions.create({
      id: "tentaciones-ai-commerce",
      name: "Tentaciones AI Commerce Suite",
      description: "Enterprise e-commerce AI application suite",
      blueprint: {
        workflows: [{ workflowDefinitionId: "wf-order-management", requiredVersion: 1 }],
        requiredCapabilities: [{ capabilityId: "product.discovery" }],
      },
    });

    assert.equal(solution.id, "tentaciones-ai-commerce");
    assert.equal(solution.version, 1);
    assert.equal(solution.lifecycleState, "DRAFT");
    assert.equal(solution.blueprint.workflows.length, 1);
    assert.equal(solution.blueprint.requiredCapabilities.length, 1);
  });

  await t.test("2. GET /api/v1/solutions: lists solutions with tenant scoping", async () => {
    const list = await client.solutions.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "tentaciones-ai-commerce");
  });

  await t.test("3. GET /api/v1/solutions/:id & /blueprint: retrieves solution and structured blueprint", async () => {
    const sol = await client.solutions.get("tentaciones-ai-commerce");
    assert.equal(sol.id, "tentaciones-ai-commerce");
    assert.equal(sol.name, "Tentaciones AI Commerce Suite");

    const bp = await client.solutions.getBlueprint("tentaciones-ai-commerce");
    assert.equal(bp.workflows[0]?.workflowDefinitionId, "wf-order-management");
  });

  await t.test("4. PATCH /api/v1/solutions/:id: updates draft solution", async () => {
    const updated = await client.solutions.update("tentaciones-ai-commerce", {
      description: "Updated description for Tentaciones Suite",
    });

    assert.equal(updated.description, "Updated description for Tentaciones Suite");
    assert.equal(updated.concurrencyVersion, 2);
  });

  await t.test("5. POST /api/v1/solutions/:id/validate: runs deterministic validation report", async () => {
    const res = await client.solutions.validate("tentaciones-ai-commerce");
    assert.equal(res.solution.lifecycleState, "VALIDATED");
    assert.equal(res.report.valid, true);
    assert.equal(res.report.errors.length, 0);
    assert.equal(res.report.checkedComponents.workflowsCount, 1);
  });

  await t.test("6. POST /api/v1/solutions/:id/publish: enforces publish gate and freezes version", async () => {
    const published = await client.solutions.publish("tentaciones-ai-commerce");
    assert.equal(published.lifecycleState, "PUBLISHED");
    assert.ok(published.publishedAt);
  });

  await t.test("7. POST /api/v1/solutions/:id/versions: branches a new DRAFT version from published solution", async () => {
    const v2Draft = await client.solutions.createVersion("tentaciones-ai-commerce", {
      newVersionNumber: 2,
    });

    assert.equal(v2Draft.id, "tentaciones-ai-commerce");
    assert.equal(v2Draft.version, 2);
    assert.equal(v2Draft.lifecycleState, "DRAFT");

    const allVersions = await client.solutions.listVersions("tentaciones-ai-commerce");
    assert.equal(allVersions.length, 2);
    assert.equal(allVersions[0]?.version, 1);
    assert.equal(allVersions[1]?.version, 2);

    const v1 = await client.solutions.getVersion("tentaciones-ai-commerce", 1);
    assert.equal(v1.version, 1);
    assert.equal(v1.lifecycleState, "PUBLISHED");
  });

  await t.test("8. POST /api/v1/solutions/:id/instantiate: instantiates published solution v1", async () => {
    const instance = await client.solutions.instantiate("tentaciones-ai-commerce", {
      solutionVersion: 1,
      name: "Chile Production Storefront",
      config: { storeId: "store-cl-01", locale: "es-CL" },
    });

    assert.equal(instance.solutionId, "tentaciones-ai-commerce");
    assert.equal(instance.solutionVersion, 1);
    assert.equal(instance.status, "INITIALIZED");

    const instances = await client.solutions.listInstances("tentaciones-ai-commerce");
    assert.equal(instances.length, 1);
    assert.equal(instances[0]?.name, "Chile Production Storefront");
  });

  await t.test("9. POST /api/v1/solutions/:id/archive & deprecate: transitions terminal lifecycle states", async () => {
    // Deprecate v1
    const deprecated = await client.solutions.deprecate("tentaciones-ai-commerce", {
      version: 1,
      reason: "Superseded by v2",
    });
    assert.equal(deprecated.lifecycleState, "DEPRECATED");

    // Archive v2
    const archived = await client.solutions.archive("tentaciones-ai-commerce", {
      version: 2,
      reason: "Cancelled project",
    });
    assert.equal(archived.lifecycleState, "ARCHIVED");
  });

  await t.test("10. Multi-Tenant Security: cross-tenant access is rejected fail-closed", async () => {
    // Create client for other tenant
    const foreignKeyRecord = ApiKeyRecord.create({
      id: "key-foreign-1",
      principalId: "foreign-user",
      principalType: "SERVICE",
      keyHash: ApiKeyRecord.hashSecret("foreign-secret-12345"),
      roles: ["system-admin"],
      tenantId: OTHER_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(foreignKeyRecord);

    const foreignClient = createPlatformClient({
      baseUrl,
      apiKey: `key-foreign-1.foreign-secret-12345`,
      defaultHeaders: {
        "x-tenant-id": OTHER_TENANT,
      },
    });

    // Foreign client cannot access tenant-solutions-api-test solution
    await assert.rejects(
      () => foreignClient.solutions.get("tentaciones-ai-commerce"),
      (err: any) => err.status === 404 || err.message.includes("404")
    );

    const foreignList = await foreignClient.solutions.list();
    assert.equal(foreignList.length, 0);
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});
