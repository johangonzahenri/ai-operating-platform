import assert from "node:assert/strict";
import test from "node:test";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { StubPlanner } from "../../src/infrastructure/autonomy/stub-planner.js";
import { PlanningRequest } from "../../src/domain/autonomy/planning-request.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";

test("Architectural Invariant: Planner produces declarative Plan and does NOT execute tools", async () => {
  const planner = new StubPlanner();
  const request = PlanningRequest.create({
    operationId: "op-iso-1",
    objective: "Calculate sum of numbers",
    budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 10000, maxToolCalls: 5 }),
    agentId: "foundation-agent",
    currentStep: 0,
  });

  const plan = await planner.plan(request);

  // Verify plan is a pure data structure
  assert.ok(plan instanceof Plan);
  assert.ok(Array.isArray(plan.steps));
  assert.ok(plan.steps.length > 0);

  // Each step is pure serializable data with no executable code or functions
  for (const step of plan.steps) {
    assert.ok(step instanceof PlanStep);
    assert.equal(typeof step.action, "string");
    assert.equal(typeof step.input, "object");
    // Ensure step has zero functions
    for (const val of Object.values(step.input)) {
      assert.notEqual(typeof val, "function");
    }
  }
});

test("Architectural Invariant: Domain files have ZERO imports from infrastructure", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  function scanDir(dir: string): string[] {
    let files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(scanDir(full));
      } else if (entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
    return files;
  }

  const domainFiles = scanDir("src/domain");
  for (const file of domainFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.equal(
      content.includes("from \"../../infrastructure") || content.includes("from '../infrastructure") || content.includes("from \"../infrastructure"),
      false,
      `Domain file '${file}' violates architectural purity by importing from infrastructure`
    );
  }
});

test("Architectural Invariant: CoreRuntime does NOT import OllamaModelGateway or concrete model adapters", async () => {
  const fs = await import("node:fs");
  const coreRuntimeContent = fs.readFileSync("src/application/runtime/core-runtime.ts", "utf8");
  assert.equal(coreRuntimeContent.includes("OllamaModelGateway"), false);
  assert.equal(coreRuntimeContent.includes("OpenAIModelGateway"), false);
  assert.equal(coreRuntimeContent.includes("AnthropicModelGateway"), false);
});

test("Architectural Invariant: TentacionesPlatformAdapter does NOT import domain, runtime, or infrastructure directly", async () => {
  const fs = await import("node:fs");
  const adapterContent = fs.readFileSync("src/application/platform/tentaciones-platform-adapter.ts", "utf8");
  assert.equal(adapterContent.includes("../../domain/"), false, "Tentaciones cannot import domain directly");
  assert.equal(adapterContent.includes("../../application/runtime/"), false, "Tentaciones cannot import CoreRuntime directly");
  assert.equal(adapterContent.includes("../../infrastructure/"), false, "Tentaciones cannot import infrastructure directly");
});

test("Architectural Invariant: HTTP Router does NOT import CoreRuntime directly", async () => {
  const fs = await import("node:fs");
  const routerContent = fs.readFileSync("src/platform/api/http-router.ts", "utf8");
  assert.equal(routerContent.includes("CoreRuntime"), false, "HTTP Router must not import CoreRuntime directly; must use PlatformService");
});

test("Architectural Invariant: Domain files have ZERO imports from HTTP or Express", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  function scanDir(dir: string): string[] {
    let files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(scanDir(full));
      } else if (entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
    return files;
  }

  const domainFiles = scanDir("src/domain");
  for (const file of domainFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.equal(content.includes("from \"node:http\"") || content.includes("from 'node:http'"), false);
    assert.equal(content.includes("express"), false);
  }
});

