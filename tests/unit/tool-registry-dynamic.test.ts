import assert from "node:assert/strict";
import test from "node:test";
import {
  Tool,
  ToolDefinition,
  ToolDefinitionError,
  ToolNotFoundError,
  ToolVersionNotFoundError,
  ToolInputValidationError,
  ToolOutputValidationError,
} from "../../src/domain/tools/tool-registry.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";

const sampleToolV1: Tool = {
  definition: {
    id: "catalog.search",
    name: "Catalog Search",
    version: "1.0.0",
    description: "Search product catalog with keyword",
    riskLevel: "LOW",
    executionMode: "READ_ONLY",
    permissions: ["catalog:read"],
    timeoutMs: 5000,
    inputSchema: {
      required: ["query"],
      properties: {
        query: "string",
        limit: "number",
      },
    },
    outputSchema: {
      required: ["items"],
      properties: {
        items: "array",
      },
    },
  },
  execute: async (input) => ({
    output: { items: [{ id: "item-1", name: input.query }] },
  }),
};

const sampleToolV2: Tool = {
  definition: {
    id: "catalog.search",
    name: "Catalog Search V2",
    version: "2.0.0",
    description: "Enhanced search with category filter",
    riskLevel: "LOW",
    executionMode: "READ_ONLY",
    permissions: ["catalog:read"],
    timeoutMs: 5000,
    inputSchema: {
      required: ["query", "category"],
      properties: {
        query: "string",
        category: "string",
      },
    },
  },
  execute: async (input) => ({
    output: { items: [{ id: "item-2", category: input.category }] },
  }),
};

test("ToolRegistry: registers multiple versions of the same toolId independently", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);
  registry.register(sampleToolV2);

  assert.equal(registry.list().length, 2);
  assert.deepEqual(registry.listVersions("catalog.search"), ["1.0.0", "2.0.0"]);

  // Explicit version lookups
  const toolV1 = registry.get("catalog.search", "1.0.0");
  assert.equal(toolV1.definition.name, "Catalog Search");

  const toolV2 = registry.get("catalog.search", "2.0.0");
  assert.equal(toolV2.definition.name, "Catalog Search V2");

  // Default lookup returns latest registered
  const defaultTool = registry.get("catalog.search");
  assert.equal(defaultTool.definition.version, "2.0.0");
});

test("ToolRegistry: rejects duplicate registration for same toolId and version", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);

  assert.throws(
    () => registry.register(sampleToolV1),
    ToolDefinitionError
  );
});

test("ToolRegistry: throws ToolVersionNotFoundError when querying non-existent version", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);

  assert.throws(
    () => registry.get("catalog.search", "9.9.9"),
    ToolVersionNotFoundError
  );
});

test("ToolRegistry: unregisters specific version and preserves remaining versions", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);
  registry.register(sampleToolV2);

  assert.equal(registry.unregister("catalog.search", "2.0.0"), true);
  assert.equal(registry.listVersions("catalog.search").length, 1);
  assert.equal(registry.get("catalog.search").definition.version, "1.0.0");

  assert.equal(registry.unregister("catalog.search"), true);
  assert.throws(() => registry.get("catalog.search"), ToolNotFoundError);
});

test("ToolRegistry: discoverSafeDefinitions filters secrets and checks security permissions", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);
  registry.register({
    definition: {
      id: "admin.wipe",
      name: "Admin Wipe",
      version: "1.0.0",
      description: "Destructive maintenance tool",
      riskLevel: "CRITICAL",
      executionMode: "DESTRUCTIVE",
      permissions: ["admin:*"],
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => ({ output: { wiped: true } }),
  });

  // Anonymous / unprivileged discovery
  const anonContext = SecurityContext.anonymous();
  const safeForAnon = registry.discoverSafeDefinitions({ securityContext: anonContext });
  assert.equal(safeForAnon.length, 0);

  // Privileged user with catalog:read
  const userContext = SecurityContext.create({
    principal: Principal.create({ id: "user-1", type: "HUMAN", roles: ["user"], permissions: ["catalog:read"] }),
    authenticated: true,
    correlationId: "trace-disc-1",
    tenantId: "tenant-alpha",
  });
  const safeForUser = registry.discoverSafeDefinitions({ securityContext: userContext });
  assert.equal(safeForUser.length, 1);
  assert.equal(safeForUser[0]?.id, "catalog.search");

  // Admin with wildcard
  const adminContext = SecurityContext.system();
  const safeForAdmin = registry.discoverSafeDefinitions({ securityContext: adminContext });
  assert.equal(safeForAdmin.length, 2);
});

test("ToolRegistry: validates input against schema and rejects additional or malformed properties", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleToolV1);

  // Valid
  assert.equal(registry.validate("catalog.search", { query: "shoes" }, "1.0.0"), true);

  // Missing required
  assert.throws(
    () => registry.validate("catalog.search", {}, "1.0.0"),
    ToolInputValidationError
  );

  // Wrong type
  assert.throws(
    () => registry.validate("catalog.search", { query: 12345 }, "1.0.0"),
    ToolInputValidationError
  );

  // Additional property
  assert.throws(
    () => registry.validate("catalog.search", { query: "shoes", extra: true }, "1.0.0"),
    ToolInputValidationError
  );
});
