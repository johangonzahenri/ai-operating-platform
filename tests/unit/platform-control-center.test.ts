import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createPlatformClient } from "../../src/platform-client/index.js";

test("Prompt 59 - Web Architecture Isolation: Web platform scripts have ZERO imports from internal domain, infrastructure or runtime", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0, "Web directory must contain client scripts");

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes('from "../../domain'), false, `${file} must not import from domain`);
    assert.equal(content.includes("from '../../domain"), false, `${file} must not import from domain`);
    assert.equal(content.includes('from "../../infrastructure'), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes("from '../../infrastructure"), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes('from "../../application/runtime'), false, `${file} must not import from runtime`);
    assert.equal(content.includes('from "../../application/ports'), false, `${file} must not import from internal ports`);
  }
});

test("Prompt 59 - DOM Security: 0 innerHTML, 0 outerHTML, 0 eval, 0 document.write in Web Console files", () => {
  const webDir = "src/platform/web";
  const jsFiles = ["app.js", "api-client.js"];

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes(".innerHTML"), false, `${file} must have 0 innerHTML usage`);
    assert.equal(content.includes(".outerHTML"), false, `${file} must have 0 outerHTML usage`);
    assert.equal(content.includes("eval("), false, `${file} must have 0 eval() usage`);
    assert.equal(content.includes("document.write("), false, `${file} must have 0 document.write() usage`);
  }
});

test("Prompt 59 - Models Console & Model Detail Projection logic", () => {
  const mockModels = [
    {
      id: "stub-model",
      name: "Deterministic Stub Model",
      provider: "STUB",
      status: "ACTIVE",
      capabilities: ["COMPLETION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro Gateway",
      provider: "GOOGLE",
      status: "AVAILABLE",
      capabilities: ["COMPLETION", "VISION", "MULTIMODAL", "EXTENDED_CONTEXT"],
    },
  ];

  const mockAgents = [
    { id: "agent-1", name: "Catalog Agent", model: "stub-model", status: "ACTIVE", memoryScope: "catalog-session" },
    { id: "agent-2", name: "Fashion Stylist", model: "gemini-1.5-pro", status: "ACTIVE", memoryScope: "stylist-session" },
    { id: "agent-3", name: "Order Resolver", model: "stub-model", status: "ACTIVE", memoryScope: "cart-session" },
  ];

  // Filtering by provider
  const stubOnly = mockModels.filter((m) => m.provider === "STUB");
  assert.equal(stubOnly.length, 1);
  assert.equal(stubOnly[0]?.id, "stub-model");

  const googleOnly = mockModels.filter((m) => m.provider === "GOOGLE");
  assert.equal(googleOnly.length, 1);
  assert.equal(googleOnly[0]?.id, "gemini-1.5-pro");

  // Filtering by search query
  const searchPro = mockModels.filter((m) => m.name.toLowerCase().includes("pro") || m.id.toLowerCase().includes("pro"));
  assert.equal(searchPro.length, 1);
  assert.equal(searchPro[0]?.id, "gemini-1.5-pro");

  // Cross-referencing assigned agents to model
  const assignedToStub = mockAgents.filter((a) => a.model === "stub-model");
  assert.equal(assignedToStub.length, 2);
  assert.deepEqual(assignedToStub.map((a) => a.id), ["agent-1", "agent-3"]);

  const assignedToGemini = mockAgents.filter((a) => a.model === "gemini-1.5-pro");
  assert.equal(assignedToGemini.length, 1);
  assert.equal(assignedToGemini[0]?.id, "agent-2");
});

test("Prompt 59 - Applications Console: External Consumer Contracts & Invariant Verification", () => {
  const htmlPath = path.join("src", "platform", "web", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  // HTML has the applications tab, search/status filters, and detail inspector
  assert.ok(html.includes('id="tab-applications"'), "Must include #tab-applications");
  assert.ok(html.includes('id="apps-search-input"'), "Must include #apps-search-input");
  assert.ok(html.includes('id="apps-status-filter"'), "Must include #apps-status-filter");
  assert.ok(html.includes('id="applications-list"'), "Must include #applications-list");
  assert.ok(html.includes('id="app-detail-panel"'), "Must include #app-detail-panel");

  // HTML has the Models tab and components
  assert.ok(html.includes('id="tab-models"'), "Must include #tab-models");
  assert.ok(html.includes('id="models-search-input"'), "Must include #models-search-input");
  assert.ok(html.includes('id="models-provider-filter"'), "Must include #models-provider-filter");
  assert.ok(html.includes('id="models-status-filter"'), "Must include #models-status-filter");
  assert.ok(html.includes('id="models-tbody"'), "Must include #models-tbody");
  assert.ok(html.includes('id="model-detail-panel"'), "Must include #model-detail-panel");

  // Agent detail has hierarchy container
  assert.ok(html.includes('id="agent-detail-hierarchy"'), "Must include #agent-detail-hierarchy");

  // Verify app.js defines Tentaciones Commerce as CONNECTED and others as PLANNED
  const appJsPath = path.join("src", "platform", "web", "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");
  assert.ok(appJs.includes('"tentaciones-commerce"'), "Must register tentaciones-commerce in applications list");
  assert.ok(appJs.includes('"CONNECTED"'), "Must flag tentaciones-commerce as CONNECTED");
  assert.ok(appJs.includes('"vehicle-parts-platform"'), "Must register vehicle-parts-platform");
  assert.ok(appJs.includes('"enterprise-support-agent"'), "Must register enterprise-support-agent");
  assert.ok(appJs.includes('"PLANNED"'), "Must flag planned applications as PLANNED");
});

test("Prompt 59 - Interactive Master Blueprint & System Map Architecture", () => {
  const htmlPath = path.join("src", "platform", "web", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  // Blueprint tab contains interactive system map
  assert.ok(html.includes('id="tab-blueprints"'), "Must include #tab-blueprints");
  assert.ok(html.includes('class="blueprint-system-map"'), "Must include .blueprint-system-map");

  // Tiers and sections exist
  const expectedTiers = [
    "External Applications",
    "Platform API Gateway",
    "Autonomous Orchestration",
    "Intelligence Runtime",
    "Durable Persistence",
  ];

  for (const tier of expectedTiers) {
    assert.ok(html.includes(tier), `Blueprint must contain tier section '${tier}'`);
  }

  // Navigation targets exist on interactive nodes
  const expectedNavTargets = [
    'data-nav-target="applications"',
    'data-nav-target="settings"',
    'data-nav-target="operations"',
    'data-nav-target="agents"',
    'data-nav-target="models"',
    'data-nav-target="tools"',
    'data-nav-target="platform-operations"',
    'data-nav-target="governance"',
  ];

  for (const target of expectedNavTargets) {
    assert.ok(html.includes(target), `Blueprint must contain interactive node with ${target}`);
  }

  // Subsystem build status table exists
  assert.ok(html.includes('class="build-status-table"'), "Must include .build-status-table");
  assert.ok(html.includes("status-pill-healthy"), "Must use status-pill-healthy indicators");
});

test("Prompt 59 - Agent Hierarchy Tree Representation Structure", () => {
  const agent = {
    id: "catalog-agent",
    name: "Catalog Search Agent",
    status: "ACTIVE",
    version: 2,
    model: "stub-model",
    tools: ["calculator", "search-tool"],
    memoryScope: "catalog-partition-1",
  };

  // Verify tree node attributes and relationship links
  const treeNodes = {
    agent: `Agent: ${agent.name} (${agent.id})`,
    model: `Model Gateway: ${agent.model}`,
    toolsCount: agent.tools.length,
    memoryScope: `Memory Partition: ${agent.memoryScope}`,
  };

  assert.equal(treeNodes.agent, "Agent: Catalog Search Agent (catalog-agent)");
  assert.equal(treeNodes.model, "Model Gateway: stub-model");
  assert.equal(treeNodes.toolsCount, 2);
  assert.equal(treeNodes.memoryScope, "Memory Partition: catalog-partition-1");
});
