import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  ExternalApplication,
  ApplicationValidationError,
  ExternalApplicationValidationError,
} from "../../src/domain/application/external-application.js";
import {
  InMemoryApplicationRegistry,
  DEFAULT_EXTERNAL_APPLICATIONS,
} from "../../src/infrastructure/application/in-memory-application-registry.js";
import {
  ApplicationRequestContext,
} from "../../src/application/security/application-request-context.js";
import { Principal, SecurityContext } from "../../src/domain/security/security.js";
import { createPlatformClient } from "../../src/platform-client/index.js";

test("Prompt 61 - ExternalApplication Domain Entity: Validation and Immutability", () => {
  const app = ExternalApplication.create({
    id: "custom-app",
    name: "Custom Integration App",
    category: "Analytics & Reporting",
    implementationStatus: "IMPLEMENTED",
    runtimeStatus: "HEALTHY",
    sourceOfTruth: "External Application Contract",
    role: "External Consumer",
    integrationTarget: "Platform API (/api/v1/*)",
    integrationType: "Platform API Client (REST / HTTP)",
    endpoints: ["POST /api/v1/tasks", "GET /api/v1/health"],
    allowedCapabilities: ["tasks.create", "tasks.read", "health.check"],
    authenticationMode: "API_KEY",
    description: "Custom external business intelligence application consuming Platform API.",
    tags: ["Analytics", "BI"],
  });

  assert.equal(app.id, "custom-app");
  assert.equal(app.name, "Custom Integration App");
  assert.equal(app.implementationStatus, "IMPLEMENTED");
  assert.equal(app.runtimeStatus, "HEALTHY");
  assert.equal(app.hasCapability("tasks.create"), true);
  assert.equal(app.hasCapability("tasks.cancel"), false);
  assert.equal(app.isAvailable(), true);

  // Status transitions create new immutable instances
  const offlineApp = app.withRuntimeStatus("OFFLINE");
  assert.equal(offlineApp.runtimeStatus, "OFFLINE");
  assert.equal(offlineApp.isAvailable(), false);
  assert.equal(app.runtimeStatus, "HEALTHY");

  // Validation errors
  assert.throws(
    () =>
      ExternalApplication.create({
        id: "",
        name: "Invalid App",
        category: "Test",
        implementationStatus: "PLANNED",
        runtimeStatus: "NOT_CONNECTED",
        sourceOfTruth: "Architectural Specification",
        role: "External Consumer",
        integrationTarget: "Platform API",
        integrationType: "REST",
        endpoints: [],
        allowedCapabilities: [],
        authenticationMode: "API_KEY",
        description: "Test",
      }),
    ApplicationValidationError
  );

  assert.throws(
    () =>
      ExternalApplication.create({
        id: "valid-id",
        name: "Test",
        description: "Test",
        allowedCapabilities: ["tasks.create"],
        // @ts-expect-error Invalid status test
        implementationStatus: "INVALID_STATUS",
      }),
    ExternalApplicationValidationError
  );
});

test("Prompt 61 - InMemoryApplicationRegistry: Seeded applications, lookup and projections", () => {
  const registry = new InMemoryApplicationRegistry();

  const allApps = registry.list();
  assert.ok(allApps.length >= 3, "Registry must contain seeded applications");

  const tentaciones = registry.findById("tentaciones-commerce");
  assert.ok(tentaciones, "Tentaciones must be registered");
  assert.equal(tentaciones.id, "tentaciones-commerce");
  assert.equal(tentaciones.implementationStatus, "IMPLEMENTED");
  assert.equal(tentaciones.runtimeStatus, "HEALTHY");
  assert.equal(tentaciones.role, "External Consumer");
  assert.ok(tentaciones.allowedCapabilities.includes("orchestrate"));
  assert.ok(tentaciones.allowedCapabilities.includes("tasks.create"));

  const tentacionesEntity = registry.findEntityById("tentaciones-commerce");
  assert.ok(tentacionesEntity, "Tentaciones entity must exist");
  assert.equal(tentacionesEntity.hasCapability("orchestrate"), true);
  assert.equal(tentacionesEntity.hasCapability("tasks.create"), true);
  assert.equal(tentacionesEntity.hasCapability("admin.*"), false);

  const vehicleApp = registry.findById("vehicle-parts-platform");
  assert.ok(vehicleApp, "Vehicle parts must be registered");
  assert.equal(vehicleApp.runtimeStatus, "NOT_CONNECTED");

  const nonExistent = registry.findById("unknown-app");
  assert.equal(nonExistent, undefined);
});

test("Prompt 61 - ApplicationRequestContext: Derivation, Tenant Scoping and Default-Deny Scopes", () => {
  const registry = new InMemoryApplicationRegistry();

  const validPrincipal = Principal.create({
    id: "service-tentaciones-01",
    type: "SERVICE",
    roles: ["service", "application"],
    tenantId: "tenant-tentaciones",
    metadata: {
      applicationId: "tentaciones-commerce",
    },
  });

  const secCtx = SecurityContext.create({
    principal: validPrincipal,
    authenticated: true,
    correlationId: "corr-tentaciones-test",
    requestId: "req-12345",
  });

  // Allowed capability: tasks.create
  const result = ApplicationRequestContext.derive(secCtx, registry, "tasks.create");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.applicationId, "tentaciones-commerce");
    assert.equal(result.context.tenantId, "tenant-tentaciones");
    assert.equal(result.context.principalId, "service-tentaciones-01");
    assert.equal(result.context.hasCapability("tasks.create"), true);
    assert.equal(result.context.hasCapability("unauthorized.action"), false);
  }

  // Allowed capability: orchestrate
  const orchResult = ApplicationRequestContext.derive(secCtx, registry, "orchestrate");
  assert.equal(orchResult.ok, true);

  // Unauthorized capability: fail-closed
  const forbiddenResult = ApplicationRequestContext.derive(secCtx, registry, "system.shutdown");
  assert.equal(forbiddenResult.ok, false);
  if (!forbiddenResult.ok) {
    assert.equal(forbiddenResult.code, "APPLICATION_SCOPE_FORBIDDEN");
  }

  // Unregistered application principal rejection
  const unregisteredPrincipal = Principal.create({
    id: "service-unregistered",
    type: "SERVICE",
    roles: ["service"],
    tenantId: "tenant-unknown",
    metadata: {
      applicationId: "non-registered-app",
    },
  });

  const unregSecCtx = SecurityContext.create({
    principal: unregisteredPrincipal,
    authenticated: true,
    correlationId: "corr-unregistered",
  });

  const unregResult = ApplicationRequestContext.derive(unregSecCtx, registry, "tasks.create");
  assert.equal(unregResult.ok, false);
  if (!unregResult.ok) {
    assert.equal(unregResult.code, "APPLICATION_NOT_REGISTERED");
  }

  // Unauthenticated context rejection
  const anonSecCtx = SecurityContext.anonymous("corr-anon");
  const anonResult = ApplicationRequestContext.derive(anonSecCtx, registry, "tasks.create");
  assert.equal(anonResult.ok, false);
  if (!anonResult.ok) {
    assert.equal(anonResult.code, "SECURITY_UNAUTHENTICATED");
  }
});

test("Prompt 61 - PlatformClient: Applications listing and typed API consumption", async () => {
  const mockApps = DEFAULT_EXTERNAL_APPLICATIONS.map((app) => ({
    id: app.id,
    name: app.name,
    category: app.category,
    role: app.role,
    implementationStatus: app.implementationStatus,
    runtimeStatus: app.runtimeStatus,
    allowedCapabilities: app.allowedCapabilities,
    authenticationMode: app.authenticationMode,
    endpoints: app.endpoints,
    architecture: app.architecture,
    tags: app.tags,
    tenantId: app.tenantId,
    description: app.description,
  }));

  const mockFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/api/v1/applications")) {
      return new Response(JSON.stringify(mockApps), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("/api/v1/applications/tentaciones-commerce")) {
      const app = mockApps.find((a) => a.id === "tentaciones-commerce");
      return new Response(JSON.stringify(app), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.endsWith("/api/v1/orchestrate") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          status: "COMPLETED",
          operations: [
            { operationId: "op-1", kind: "TOOL", status: "COMPLETED", output: { value: 105 } },
            { operationId: "op-2", kind: "MODEL", status: "COMPLETED", output: { text: "Total: $105" } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  };

  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    fetch: mockFetch as unknown as typeof globalThis.fetch,
  });

  // 1. List applications
  const apps = await client.applications.list();
  assert.ok(Array.isArray(apps));
  assert.equal(apps.length, 3);
  const tentaciones = apps.find((a) => a.id === "tentaciones-commerce");
  assert.ok(tentaciones);
  assert.equal(tentaciones.implementationStatus, "IMPLEMENTED");
  assert.equal(tentaciones.runtimeStatus, "HEALTHY");

  // 2. Get specific application
  const app = await client.applications.get("tentaciones-commerce");
  assert.equal(app.id, "tentaciones-commerce");
  assert.equal(app.role, "External Consumer");

  // 3. Orchestrate via client
  const orchResult = await client.orchestrate({
    operations: [
      { kind: "TOOL", id: "op-1", toolId: "calculator", input: { left: 100, right: 5 } },
    ],
  });
  assert.equal(orchResult.status, "COMPLETED");
  assert.equal(orchResult.operations.length, 2);
});

test("Prompt 61 - Architectural Boundary Invariants: Zero coupling from external applications to core domain", () => {
  const domainDir = "src/domain";
  const domainFiles = fs.readdirSync(domainDir, { recursive: true }) as string[];

  for (const file of domainFiles) {
    if (typeof file === "string" && file.endsWith(".ts")) {
      const filePath = path.join(domainDir, file);
      // Skip application domain directory itself
      if (filePath.includes("domain\\application") || filePath.includes("domain/application")) {
        continue;
      }
      const content = fs.readFileSync(filePath, "utf8");
      assert.equal(
        content.includes("tentaciones"),
        false,
        `Domain file ${file} must have zero coupling to external application 'tentaciones'`
      );
    }
  }
});

