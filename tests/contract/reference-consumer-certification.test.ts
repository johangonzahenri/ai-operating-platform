import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { ReferenceConsumerPlatformAdapter } from "../../examples/reference-consumer/src/adapter.js";
import {
  runReferenceAppCertification,
  formatCertificationReport,
} from "../../examples/reference-consumer/src/certification.js";
import { ApplicationManifest } from "../../src/domain/application/application-contract.js";

import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

test("Reference Consumer: 9-Point Official Certification Contract Suite", async (t) => {
  const platform = createPlatform();
  const apiKeyRecord = ApiKeyRecord.create({
    id: "key-ref-cert",
    principalId: "service-ref-cert",
    principalType: "SERVICE",
    keyHash: ApiKeyRecord.hashSecret("secret-ref-cert"),
    roles: ["service", "operator"],
    tenantId: "tenant-reference-corp",
    metadata: {
      applicationId: "reference-consumer",
    },
  });
  await platform.apiKeyRepository.save(apiKeyRecord);

  const service = new PlatformService({
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
    apiCredentialService: platform.apiCredentialService,
  });

  const server = createHttpServer(service, {
    apiKeyRepository: platform.apiKeyRepository,
    enforceSecurity: false,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const manifestPath = path.resolve(process.cwd(), "examples/reference-consumer/application.json");
  const manifest: ApplicationManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const adapter = new ReferenceConsumerPlatformAdapter({
    baseUrl,
    apiKey: "key-ref-cert.secret-ref-cert",
    tenantId: "tenant-reference-corp",
    applicationId: manifest.applicationId,
  });

  await t.test("Execute Complete 9-Point Certification Evaluation", async () => {
    const report = await runReferenceAppCertification(adapter, manifest);

    assert.equal(report.applicationId, "reference-consumer");
    assert.equal(report.dimensions.identity.verdict, "PASS", "Identity check PASS");
    assert.equal(report.dimensions.authentication.verdict, "PASS", "Authentication check PASS");
    assert.equal(report.dimensions.authorization.verdict, "PASS", "Authorization check PASS");
    assert.equal(report.dimensions.capabilities.verdict, "PASS", "Capabilities check PASS");
    assert.equal(report.dimensions.health.verdict, "PASS", "Health check PASS");
    assert.equal(report.dimensions.version.verdict, "PASS", "Version check PASS");
    assert.equal(report.dimensions.observability.verdict, "PASS", "Observability check PASS");
    assert.equal(report.dimensions.openApi.verdict, "PASS", "OpenAPI check PASS");
    assert.equal(report.dimensions.sse.verdict, "PASS", "SSE check PASS");
    assert.equal(report.overallPassed, true, "Overall certification status is PASS");

    const formatted = formatCertificationReport(report);
    assert.ok(formatted.includes("REFERENCE APPLICATION CERTIFICATION"));
    assert.ok(formatted.includes("Identity       PASS"));
    assert.ok(formatted.includes("Authentication PASS"));
    assert.ok(formatted.includes("Authorization  PASS"));
    assert.ok(formatted.includes("Capabilities   PASS"));
    assert.ok(formatted.includes("Health         PASS"));
    assert.ok(formatted.includes("Version        PASS"));
    assert.ok(formatted.includes("Observability  PASS"));
    assert.ok(formatted.includes("OpenAPI        PASS"));
    assert.ok(formatted.includes("SSE            PASS"));
  });
});
