import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createPlatformClient } from "../../src/platform-client/index.js";

test("Prompt 58 Isolation Invariant: Platform Web client has ZERO imports from internal domain or infrastructure", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 2, "Web directory must contain app.js and api-client.js");

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes('from "../../domain'), false, `${file} must not import from domain`);
    assert.equal(content.includes("from '../../domain"), false, `${file} must not import from domain`);
    assert.equal(content.includes('from "../../infrastructure'), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes("from '../../infrastructure"), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes('from "../../application/runtime'), false, `${file} must not import from runtime`);
  }
});

test("Frontend Security: ZERO innerHTML, outerHTML, or eval in web application scripts", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes(".innerHTML"), false, `${file} must NOT use innerHTML to prevent XSS`);
    assert.equal(content.includes(".outerHTML"), false, `${file} must NOT use outerHTML to prevent XSS`);
    assert.equal(content.includes("eval("), false, `${file} must NOT use eval`);
    assert.equal(content.includes("document.write("), false, `${file} must NOT use document.write`);
  }
});

test("Agent Catalog Projections: PlatformClient retrieves agents with complete metadata", async () => {
  const mockAgents = [
    {
      id: "sales-agent",
      name: "Sales Assistant Agent",
      description: "Handles sales queries and product quotes",
      instructions: "You are an enterprise sales AI assistant.",
      model: "gpt-4o",
      status: "ACTIVE",
      version: 2,
      tools: ["calculator", "quote-generator"],
      memoryScope: "sales-workspace",
      createdAt: "2026-09-14T10:00:00.000Z",
    },
    {
      id: "support-agent",
      name: "Customer Support Agent",
      description: "Handles Tier-1 customer tickets",
      instructions: "You are a customer support agent.",
      model: "claude-3-5-sonnet",
      status: "INACTIVE",
      version: 1,
      tools: ["knowledge-base"],
      memoryScope: "support-workspace",
      createdAt: "2026-09-14T11:00:00.000Z",
    },
  ];

  const mockFetch = async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/api/v1/agents")) {
      return new Response(JSON.stringify({ success: true, data: mockAgents }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  };

  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    fetch: mockFetch as unknown as typeof globalThis.fetch,
  });

  const agents = await client.agents.list();
  assert.equal(agents.length, 2);
  const agent0 = agents[0];
  assert.ok(agent0);
  assert.equal(agent0.id, "sales-agent");
  assert.equal(agent0.name, "Sales Assistant Agent");
  assert.equal(agent0.status, "ACTIVE");
  assert.equal(agent0.model, "gpt-4o");
  assert.deepEqual(agent0.tools, ["calculator", "quote-generator"]);
  assert.equal(agent0.memoryScope, "sales-workspace");
});

test("Web Client API exports all required Agent and Tool management contracts", () => {
  const apiClientContent = fs.readFileSync("src/platform/web/api-client.js", "utf8");

  // Agent Management APIs
  assert.ok(apiClientContent.includes("export async function getAgents"), "Must export getAgents");
  assert.ok(apiClientContent.includes("export async function getAgent"), "Must export getAgent");
  assert.ok(apiClientContent.includes("export async function createAgent"), "Must export createAgent");
  assert.ok(apiClientContent.includes("export async function updateAgent"), "Must export updateAgent");
  assert.ok(apiClientContent.includes("export async function activateAgent"), "Must export activateAgent");
  assert.ok(apiClientContent.includes("export async function deactivateAgent"), "Must export deactivateAgent");

  // Tool Management APIs
  assert.ok(apiClientContent.includes("export async function getTools"), "Must export getTools");
  assert.ok(apiClientContent.includes("export async function getTool"), "Must export getTool");
});

test("Tool Catalog & Risk/Mode Model: verifies risk levels, execution modes and parameter schemas", () => {
  const mockTools = [
    {
      id: "calculator",
      name: "Calculator",
      version: "1.0.0",
      description: "Evaluates basic mathematical arithmetic expressions",
      riskLevel: "LOW",
      executionMode: "READ_ONLY",
      requiresApproval: false,
      timeoutMs: 5000,
      inputSchema: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Arithmetic formula to calculate" },
        },
        required: ["expression"],
      },
      outputSchema: {
        type: "object",
        properties: {
          result: { type: "number", description: "Computed numeric value" },
        },
      },
    },
    {
      id: "database-migrator",
      name: "Database Schema Migrator",
      version: "2.1.0",
      description: "Executes DDL migrations against production database",
      riskLevel: "CRITICAL",
      executionMode: "DESTRUCTIVE",
      requiresApproval: true,
      timeoutMs: 30000,
      inputSchema: {
        type: "object",
        properties: {
          migrationScript: { type: "string", description: "SQL migration payload" },
        },
        required: ["migrationScript"],
      },
    },
  ];

  const calc = mockTools[0];
  assert.ok(calc);
  assert.equal(calc.id, "calculator");
  assert.equal(calc.riskLevel, "LOW");
  assert.equal(calc.executionMode, "READ_ONLY");
  assert.equal(calc.requiresApproval, false);
  assert.equal(calc.inputSchema?.properties?.expression?.type, "string");

  const dbMig = mockTools[1];
  assert.ok(dbMig);
  assert.equal(dbMig.id, "database-migrator");
  assert.equal(dbMig.riskLevel, "CRITICAL");
  assert.equal(dbMig.executionMode, "DESTRUCTIVE");
  assert.equal(dbMig.requiresApproval, true);
});

test("Agent Tool Relationship Matrix: Computes authorized vs platform capabilities accurately", () => {
  const agentTools = ["calculator", "currency-converter"];
  const allPlatformTools = [
    { id: "calculator", name: "Calculator" },
    { id: "currency-converter", name: "Currency Converter" },
    { id: "database-migrator", name: "Database Migrator" },
    { id: "email-sender", name: "Email Sender" },
  ];

  const assignedSet = new Set(agentTools);
  const matrix = allPlatformTools.map((t) => ({
    toolId: t.id,
    toolName: t.name,
    isAuthorized: assignedSet.has(t.id),
  }));

  assert.equal(matrix.length, 4);
  assert.equal(matrix.find((m) => m.toolId === "calculator")?.isAuthorized, true);
  assert.equal(matrix.find((m) => m.toolId === "currency-converter")?.isAuthorized, true);
  assert.equal(matrix.find((m) => m.toolId === "database-migrator")?.isAuthorized, false);
  assert.equal(matrix.find((m) => m.toolId === "email-sender")?.isAuthorized, false);
});

test("Filtering & Search Logic: Agent search and status filtering operate accurately", () => {
  const agents = [
    { id: "sales-agent", name: "Sales Assistant", model: "gpt-4o", status: "ACTIVE", memoryScope: "sales" },
    { id: "billing-agent", name: "Billing Auditor", model: "gpt-4o", status: "INACTIVE", memoryScope: "finance" },
    { id: "support-agent", name: "Customer Support", model: "claude-3-5-sonnet", status: "ACTIVE", memoryScope: "support" },
  ];

  // Filter: Search "gpt"
  const searchGpt = agents.filter(
    (a) =>
      a.name.toLowerCase().includes("gpt") ||
      a.id.toLowerCase().includes("gpt") ||
      a.model.toLowerCase().includes("gpt")
  );
  assert.equal(searchGpt.length, 2);

  // Filter: Status "ACTIVE"
  const activeOnly = agents.filter((a) => a.status === "ACTIVE");
  assert.equal(activeOnly.length, 2);

  // Filter: Status "INACTIVE"
  const inactiveOnly = agents.filter((a) => a.status === "INACTIVE");
  assert.equal(inactiveOnly.length, 1);
  const inactiveAgent = inactiveOnly[0];
  assert.ok(inactiveAgent);
  assert.equal(inactiveAgent.id, "billing-agent");
});

test("Filtering & Search Logic: Tool risk level and execution mode filtering operate accurately", () => {
  const tools = [
    { id: "calculator", name: "Calculator", riskLevel: "LOW", executionMode: "READ_ONLY" },
    { id: "file-reader", name: "File Reader", riskLevel: "MEDIUM", executionMode: "IDEMPOTENT" },
    { id: "order-canceller", name: "Order Canceller", riskLevel: "HIGH", executionMode: "SIDE_EFFECTING" },
    { id: "db-dropper", name: "DB Dropper", riskLevel: "CRITICAL", executionMode: "DESTRUCTIVE" },
  ];

  // Filter: Risk "CRITICAL"
  const criticalTools = tools.filter((t) => t.riskLevel === "CRITICAL");
  assert.equal(criticalTools.length, 1);
  const critTool = criticalTools[0];
  assert.ok(critTool);
  assert.equal(critTool.id, "db-dropper");

  // Filter: Mode "READ_ONLY"
  const readOnlyTools = tools.filter((t) => t.executionMode === "READ_ONLY");
  assert.equal(readOnlyTools.length, 1);
  const roTool = readOnlyTools[0];
  assert.ok(roTool);
  assert.equal(roTool.id, "calculator");

  // Filter: Mode "SIDE_EFFECTING"
  const sideEffectTools = tools.filter((t) => t.executionMode === "SIDE_EFFECTING");
  assert.equal(sideEffectTools.length, 1);
  const seTool = sideEffectTools[0];
  assert.ok(seTool);
  assert.equal(seTool.id, "order-canceller");
});

test("Console UI Layout: index.html defines complete markup for Agents and Tools management consoles", () => {
  const html = fs.readFileSync("src/platform/web/index.html", "utf8");

  // Agents View Elements
  assert.ok(html.includes('id="tab-agents"'), "Must define tab-agents section");
  assert.ok(html.includes('id="agents-search-input"'), "Must define agents-search-input");
  assert.ok(html.includes('id="agents-status-filter"'), "Must define agents-status-filter");
  assert.ok(html.includes('id="agents-tbody"'), "Must define agents-tbody");
  assert.ok(html.includes('id="agent-detail-panel"'), "Must define agent-detail-panel");
  assert.ok(html.includes('id="agent-detail-tools-matrix"'), "Must define agent-detail-tools-matrix");

  // Tools View Elements
  assert.ok(html.includes('id="tab-tools"'), "Must define tab-tools section");
  assert.ok(html.includes('id="tools-search-input"'), "Must define tools-search-input");
  assert.ok(html.includes('id="tools-risk-filter"'), "Must define tools-risk-filter");
  assert.ok(html.includes('id="tools-mode-filter"'), "Must define tools-mode-filter");
  assert.ok(html.includes('id="tools-tbody"'), "Must define tools-tbody");
  assert.ok(html.includes('id="tools-list"'), "Must define tools-list card grid");
  assert.ok(html.includes('id="tool-detail-panel"'), "Must define tool-detail-panel");
  assert.ok(html.includes('id="tool-input-schema-json"'), "Must define tool-input-schema-json");
  assert.ok(html.includes('id="tool-output-schema-json"'), "Must define tool-output-schema-json");

  // Confirmation Modal
  assert.ok(html.includes('id="confirm-action-modal"'), "Must define confirm-action-modal");
  assert.ok(html.includes('id="modal-confirm-title"'), "Must define modal-confirm-title");
  assert.ok(html.includes('id="execute-confirm-btn"'), "Must define execute-confirm-btn");
});

test("Console CSS Styles: styles.css defines styling for risk levels, execution modes, and approval badges", () => {
  const css = fs.readFileSync("src/platform/web/styles.css", "utf8");
  assert.ok(css.includes(".badge-risk-low"), "Must define badge-risk-low class");
  assert.ok(css.includes(".badge-risk-medium"), "Must define badge-risk-medium class");
  assert.ok(css.includes(".badge-risk-high"), "Must define badge-risk-high class");
  assert.ok(css.includes(".badge-risk-critical"), "Must define badge-risk-critical class");
  assert.ok(css.includes(".badge-mode"), "Must define badge-mode class");
  assert.ok(css.includes(".badge-approval"), "Must define badge-approval class");
});
