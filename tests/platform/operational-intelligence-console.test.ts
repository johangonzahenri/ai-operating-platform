import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const WEB_DIR = path.resolve(process.cwd(), "src/platform/web");

test("Operational Intelligence Console uses the real Platform API contract", () => {
  const html = fs.readFileSync(path.join(WEB_DIR, "index.html"), "utf8");
  const client = fs.readFileSync(path.join(WEB_DIR, "api-client.js"), "utf8");
  const app = fs.readFileSync(path.join(WEB_DIR, "app.js"), "utf8");

  for (const id of [
    "ops-task-form", "ops-objective", "ops-execute-btn", "ops-execution-status",
    "ops-task-id", "ops-execution-id", "ops-trace-id", "ops-timeline",
    "ops-model", "ops-tool", "ops-policy", "ops-round", "ops-final-result",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `console must expose ${id}`);
  }
  assert.match(client, /const PLATFORM_BASE_PATH = "\/api\/platform\/v1"/);
  for (const method of [
    "getPlatformHealth", "getPlatformAgents", "createPlatformTask",
    "executePlatformTask", "getPlatformExecution", "getPlatformExecutionEvents",
  ]) {
    assert.match(client, new RegExp(`export async function ${method}`));
  }
  assert.match(app, /pollOperationalExecution/);
  assert.match(app, /maxAttempts = 60/);
  assert.match(app, /textContent/);
  assert.doesNotMatch(app, /innerHTML\s*=/);
});
