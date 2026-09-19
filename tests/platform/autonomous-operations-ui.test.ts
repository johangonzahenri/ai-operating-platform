import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const WEB_DIR = path.resolve(process.cwd(), "src/platform/web");

test("Autonomous Operations Control Plane UI - Template & DOM Structure Verification Suite", async (t) => {
  const htmlPath = path.join(WEB_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  await t.test("1. Autonomous Operations Tab: Section exists with proper IDs and attributes", () => {
    assert.ok(html.includes('id="tab-operations"'), "Must contain tab-operations section");
    assert.ok(html.includes("Autonomous Operations &amp; Continuous Governance"), "Must display heading");
    assert.ok(html.includes("Trigger &ne; Decision &ne; Plan &ne; Execution"), "Must display invariant principle");
  });

  await t.test("2. Daemon Controls & Metrics: All metric cards and action buttons exist", () => {
    assert.ok(html.includes('id="autonomous-runtime-status-badge"'), "Must contain runtime status badge");
    assert.ok(html.includes('id="autonomous-runtime-state-display"'), "Must contain runtime state display");
    assert.ok(html.includes('id="autonomous-active-leases-count"'), "Must contain active leases count");
    assert.ok(html.includes('id="autonomous-triggers-count-metric"'), "Must contain triggers count metric");
    assert.ok(html.includes('id="autonomous-cycles-count-metric"'), "Must contain cycles count metric");
    assert.ok(html.includes('id="autonomous-trips-count"'), "Must contain circuit breaker trips count");
    assert.ok(html.includes('id="autonomous-start-btn"'), "Must contain start daemon button");
    assert.ok(html.includes('id="autonomous-pause-btn"'), "Must contain pause daemon button");
    assert.ok(html.includes('id="autonomous-resume-btn"'), "Must contain resume daemon button");
    assert.ok(html.includes('id="autonomous-stop-btn"'), "Must contain stop daemon button");
    assert.ok(html.includes('id="autonomous-reset-halt-btn"'), "Must contain reset safety halt button");
    assert.ok(html.includes('id="autonomous-refresh-btn"'), "Must contain refresh state button");
  });

  await t.test("3. Autonomous Triggers: Create panel and triggers table exist", () => {
    assert.ok(html.includes('id="autonomous-triggers-table"'), "Must contain triggers data table");
    assert.ok(html.includes('id="autonomous-triggers-tbody"'), "Must contain triggers tbody");
    assert.ok(html.includes('id="autonomous-triggers-count-badge"'), "Must contain triggers count badge");
    assert.ok(html.includes('id="open-create-trigger-btn"'), "Must contain open create trigger button");
    assert.ok(html.includes('id="close-create-trigger-btn"'), "Must contain close create trigger button");
    assert.ok(html.includes('id="create-trigger-panel"'), "Must contain create trigger panel");
    assert.ok(html.includes('id="create-trigger-form"'), "Must contain create trigger form");
    assert.ok(html.includes('id="trigger-id-input"'), "Must contain trigger id input");
    assert.ok(html.includes('id="trigger-name-input"'), "Must contain trigger name input");
    assert.ok(html.includes('id="trigger-type-select"'), "Must contain trigger type select");
    assert.ok(html.includes('id="trigger-target-input"'), "Must contain trigger target input");
    assert.ok(html.includes('id="trigger-config-input"'), "Must contain trigger config input");
  });

  await t.test("4. Autonomous Cycles & Closed-Loop Operations: Table and elements exist", () => {
    assert.ok(html.includes('id="autonomous-cycles-tbody"'), "Must contain cycles tbody");
    assert.ok(html.includes('id="autonomous-cycles-count-badge"'), "Must contain cycles count badge");
  });

  await t.test("5. Safety Operations Hub: Safety halts table and badge exist", () => {
    assert.ok(html.includes('id="autonomous-safety-badge"'), "Must contain safety badge");
    assert.ok(html.includes('id="autonomous-safety-tbody"'), "Must contain safety tbody");
  });

  await t.test("6. Detail Modal: Cycle inspection modal and chain container exist", () => {
    assert.ok(html.includes('id="autonomous-detail-modal"'), "Must contain autonomous detail modal");
    assert.ok(html.includes('id="close-autonomous-modal-btn"'), "Must contain close modal button");
    assert.ok(html.includes('id="modal-cycle-id"'), "Must contain modal cycle id");
    assert.ok(html.includes('id="modal-cycle-status"'), "Must contain modal cycle status");
    assert.ok(html.includes('id="modal-cycle-trigger"'), "Must contain modal cycle trigger");
    assert.ok(html.includes('id="modal-autonomous-chain-container"'), "Must contain modal 6-stage chain container");
    assert.ok(html.includes('id="modal-cycle-payload"'), "Must contain modal cycle payload pre");
  });
});

test("Autonomous Operations Control Plane UI - ApiClient & Controller Logic Suite", async (t) => {
  const apiClientPath = path.join(WEB_DIR, "api-client.js");
  const apiClientSrc = fs.readFileSync(apiClientPath, "utf8");
  const appJsPath = path.join(WEB_DIR, "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  await t.test("1. api-client exports all required autonomous operations methods", () => {
    assert.ok(apiClientSrc.includes("export async function getAutonomousRuntimeState"), "Must export getAutonomousRuntimeState");
    assert.ok(apiClientSrc.includes("export async function startAutonomousRuntime"), "Must export startAutonomousRuntime");
    assert.ok(apiClientSrc.includes("export async function stopAutonomousRuntime"), "Must export stopAutonomousRuntime");
    assert.ok(apiClientSrc.includes("export async function pauseAutonomousRuntime"), "Must export pauseAutonomousRuntime");
    assert.ok(apiClientSrc.includes("export async function resumeAutonomousRuntime"), "Must export resumeAutonomousRuntime");
    assert.ok(apiClientSrc.includes("export async function listAutonomousTriggers"), "Must export listAutonomousTriggers");
    assert.ok(apiClientSrc.includes("export async function createAutonomousTrigger"), "Must export createAutonomousTrigger");
    assert.ok(apiClientSrc.includes("export async function enableAutonomousTrigger"), "Must export enableAutonomousTrigger");
    assert.ok(apiClientSrc.includes("export async function disableAutonomousTrigger"), "Must export disableAutonomousTrigger");
    assert.ok(apiClientSrc.includes("export async function fireAutonomousTrigger"), "Must export fireAutonomousTrigger");
  });

  await t.test("2. app.js defines autonomous operations lifecycle handlers", () => {
    assert.ok(appJs.includes("loadAutonomousOperationsData()"), "Must define loadAutonomousOperationsData");
    assert.ok(appJs.includes("renderAutonomousRuntime("), "Must define renderAutonomousRuntime");
    assert.ok(appJs.includes("renderAutonomousTriggers("), "Must define renderAutonomousTriggers");
    assert.ok(appJs.includes("renderAutonomousCycles("), "Must define renderAutonomousCycles");
    assert.ok(appJs.includes("renderAutonomousSafety("), "Must define renderAutonomousSafety");
    assert.ok(appJs.includes("showAutonomousDetail("), "Must define showAutonomousDetail");
  });

  await t.test("3. Security & DOM hygiene: Zero innerHTML assignments in app.js", () => {
    const matches = appJs.match(/\.innerHTML\s*=/g);
    assert.equal(matches, null, "Must contain 0 innerHTML assignments in app.js");
  });
});

test("Autonomous Operations Control Plane UI - Internationalization (i18n) Suite", async (t) => {
  const esPath = path.join(WEB_DIR, "i18n/locale-es-419.js");
  const enPath = path.join(WEB_DIR, "i18n/locale-en.js");

  const es = (await import(`file://${esPath}`)).default;
  const en = (await import(`file://${enPath}`)).default;

  await t.test("1. Spanish (es-419) contains complete autonomousOperations dictionary", () => {
    assert.ok(es.autonomousOperations, "Must contain autonomousOperations namespace");
    assert.ok(es.autonomousOperations.title, "Must contain title");
    assert.ok(es.autonomousOperations.runtime, "Must contain runtime");
    assert.ok(es.autonomousOperations.triggers, "Must contain triggers");
    assert.ok(es.autonomousOperations.startRuntime, "Must contain startRuntime");
    assert.ok(es.autonomousOperations.noSovereign, "Must contain noSovereign principle");
  });

  await t.test("2. English (en) contains complete autonomousOperations dictionary", () => {
    assert.ok(en.autonomousOperations, "Must contain autonomousOperations namespace");
    assert.ok(en.autonomousOperations.title, "Must contain title");
    assert.ok(en.autonomousOperations.runtime, "Must contain runtime");
    assert.ok(en.autonomousOperations.triggers, "Must contain triggers");
    assert.ok(en.autonomousOperations.startRuntime, "Must contain startRuntime");
    assert.ok(en.autonomousOperations.noSovereign, "Must contain noSovereign principle");
  });
});
