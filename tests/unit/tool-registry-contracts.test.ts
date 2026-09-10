import assert from "node:assert/strict";
import test from "node:test";
import {
  Tool,
  ToolDefinition,
  ToolDefinitionError,
  ToolNotFoundError,
  ToolValidationError,
} from "../../src/domain/tools/tool-registry.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";

const sampleTool: Tool = {
  definition: {
    id: "format_json",
    name: "JSON Formatter",
    description: "Formats and cleans JSON input",
    riskLevel: "LOW",
    permissions: ["compute"],
    timeoutMs: 5000,
    inputSchema: {
      required: ["rawJson"],
      properties: {
        rawJson: "string",
      },
    },
  },
  execute: async (input) => ({ output: { formatted: String(input.rawJson).trim() } }),
};

test("InMemoryToolRegistry registers, retrieves, and lists tools", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleTool);

  assert.ok(registry.find("format_json"));
  assert.equal(registry.get("format_json").definition.name, "JSON Formatter");
  assert.equal(registry.list().length, 1);
});

test("InMemoryToolRegistry rejects duplicate tool registration", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleTool);
  assert.throws(() => registry.register(sampleTool), ToolDefinitionError);
});

test("InMemoryToolRegistry unregister removes registered tool", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleTool);
  assert.equal(registry.unregister("format_json"), true);
  assert.equal(registry.find("format_json"), undefined);
  assert.throws(() => registry.get("format_json"), ToolNotFoundError);
});

test("InMemoryToolRegistry validates input schema deterministically", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleTool);

  // Valid input
  assert.equal(registry.validate("format_json", { rawJson: "{\"a\": 1}" }), true);

  // Missing required property
  assert.throws(
    () => registry.validate("format_json", {}),
    ToolValidationError
  );

  // Incorrect type
  assert.throws(
    () => registry.validate("format_json", { rawJson: 12345 }),
    ToolValidationError
  );
});

test("InMemoryToolRegistry validates authorization based on required permissions", () => {
  const registry = new InMemoryToolRegistry();
  registry.register(sampleTool);

  // Granted permissions include "compute"
  assert.equal(registry.authorize("format_json", ["compute", "read"]), true);

  // Granted permissions lack "compute"
  assert.equal(registry.authorize("format_json", ["read"]), false);
});
