import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const WEB_DIR = path.resolve(process.cwd(), "src/platform/web");

test("Operational UI Frontend Structure and Template Verification Suite", async (t) => {
  const htmlPath = path.join(WEB_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  await t.test("1. Initial Render: Navigation includes Platform Operations as primary tab", () => {
    assert.ok(html.includes('data-tab="platform-operations"'), "Must contain data-tab for platform-operations");
    assert.ok(html.includes('class="nav-item active" data-tab="platform-operations"'), "Platform Operations must be the active navigation item");
    assert.ok(html.includes('Platform Operations'), "Must display Platform Operations label");
  });

  await t.test("2. Initial Render: Platform Operations view section is defined and active", () => {
    assert.ok(html.includes('id="tab-platform-operations"'), "Must contain tab-platform-operations section");
    assert.ok(html.includes('class="tab-view active"'), "Platform Operations must be the active tab-view");
  });

  await t.test("3. System Status: All required health metric cards exist", () => {
    assert.ok(html.includes('id="health-overall-status"'), "Must contain health-overall-status element");
    assert.ok(html.includes('id="health-sqlite-status"'), "Must contain health-sqlite-status element");
    assert.ok(html.includes('id="health-sqlite-mode"'), "Must contain health-sqlite-mode element");
    assert.ok(html.includes('id="health-eventstore-status"'), "Must contain health-eventstore-status element");
    assert.ok(html.includes('id="health-persisted-count"'), "Must contain health-persisted-count element");
    assert.ok(html.includes('id="health-queryable-count"'), "Must contain health-queryable-count element");
    assert.ok(html.includes('id="health-last-event-time"'), "Must contain health-last-event-time element");
    assert.ok(html.includes('id="health-platform-version"'), "Must contain health-platform-version element");
  });

  await t.test("4. Durable Events: Mandatory UI states (loading, empty, error, populated) exist", () => {
    assert.ok(html.includes('id="events-loading"'), "Must contain events-loading state container");
    assert.ok(html.includes('id="events-empty"'), "Must contain events-empty state container");
    assert.ok(html.includes('id="events-error"'), "Must contain events-error state container");
    assert.ok(html.includes('id="events-table-wrapper"'), "Must contain events-table-wrapper element");
    assert.ok(html.includes('id="events-tbody"'), "Must contain events-tbody table body element");
    assert.ok(html.includes('id="retry-events-btn"'), "Must contain retry-events-btn in error state");
    assert.ok(html.includes('id="refresh-events-btn"'), "Must contain refresh-events-btn");
  });

  await t.test("5. Durable Events: Filter controls exist", () => {
    assert.ok(html.includes('id="filter-event-type"'), "Must contain filter-event-type input");
    assert.ok(html.includes('id="filter-aggregate-type"'), "Must contain filter-aggregate-type select");
    assert.ok(html.includes('id="filter-trace-id"'), "Must contain filter-trace-id input");
    assert.ok(html.includes('id="filter-limit"'), "Must contain filter-limit select");
    assert.ok(html.includes('id="apply-events-filter-btn"'), "Must contain apply-events-filter-btn");
    assert.ok(html.includes('id="reset-events-filter-btn"'), "Must contain reset-events-filter-btn");
  });

  await t.test("6. Event Detail Modal: Dialog and all detail fields exist", () => {
    assert.ok(html.includes('id="event-detail-modal"'), "Must contain event-detail-modal backdrop/dialog");
    assert.ok(html.includes('id="close-event-modal-btn"'), "Must contain close-event-modal-btn");
    assert.ok(html.includes('id="modal-event-id"'), "Must contain modal-event-id");
    assert.ok(html.includes('id="modal-event-seq"'), "Must contain modal-event-seq");
    assert.ok(html.includes('id="modal-event-type"'), "Must contain modal-event-type");
    assert.ok(html.includes('id="modal-event-aggregate"'), "Must contain modal-event-aggregate");
    assert.ok(html.includes('id="modal-event-occurred"'), "Must contain modal-event-occurred");
    assert.ok(html.includes('id="modal-event-version"'), "Must contain modal-event-version");
    assert.ok(html.includes('id="modal-event-trace"'), "Must contain modal-event-trace");
    assert.ok(html.includes('id="modal-event-corr"'), "Must contain modal-event-corr");
    assert.ok(html.includes('id="modal-event-cause"'), "Must contain modal-event-cause");
    assert.ok(html.includes('id="modal-event-payload"'), "Must contain modal-event-payload pre element");
    assert.ok(html.includes('id="copy-payload-btn"'), "Must contain copy-payload-btn");
  });

  await t.test("7. Audit Log: Mandatory UI states (loading, empty, error, populated) exist", () => {
    assert.ok(html.includes('id="audit-loading"'), "Must contain audit-loading state container");
    assert.ok(html.includes('id="audit-empty"'), "Must contain audit-empty state container");
    assert.ok(html.includes('id="audit-error"'), "Must contain audit-error state container");
    assert.ok(html.includes('id="audit-table-wrapper"'), "Must contain audit-table-wrapper element");
    assert.ok(html.includes('id="audit-ops-tbody"'), "Must contain audit-ops-tbody table body element");
    assert.ok(html.includes('id="retry-audit-btn"'), "Must contain retry-audit-btn");
    assert.ok(html.includes('id="refresh-audit-btn"'), "Must contain refresh-audit-btn");
  });

  await t.test("8. Accessibility & Security: Semantic tags, modal ARIA roles, zero inline event handlers", () => {
    assert.ok(html.includes('role="dialog"'), "Modal must have role=dialog");
    assert.ok(html.includes('aria-modal="true"'), "Modal must have aria-modal=true");
    assert.ok(html.includes('aria-label='), "Modal close must have aria-label");
    // Ensure no dangerous inline onclick handlers in HTML
    assert.equal(html.includes('onclick='), false, "Must not contain inline onclick attributes");
    assert.equal(html.includes('onerror='), false, "Must not contain inline onerror attributes");
  });
});

test("Operational UI ApiClient Functions Suite", async (t) => {
  const apiClientPath = path.join(WEB_DIR, "api-client.js");
  const apiClientSrc = fs.readFileSync(apiClientPath, "utf8");

  await t.test("1. api-client exports all required operational methods", () => {
    assert.ok(apiClientSrc.includes("export async function getHealth"), "Must export getHealth");
    assert.ok(apiClientSrc.includes("export async function getEvents"), "Must export getEvents");
    assert.ok(apiClientSrc.includes("export async function getEvent"), "Must export getEvent");
    assert.ok(apiClientSrc.includes("export async function getAuditLogs"), "Must export getAuditLogs");
  });

  await t.test("2. api-client getEvents serializes query parameters correctly", () => {
    assert.ok(apiClientSrc.includes('params.set("limit",'), "Must serialize limit param");
    assert.ok(apiClientSrc.includes('params.set("afterSequence",'), "Must serialize afterSequence param");
    assert.ok(apiClientSrc.includes('params.set("beforeSequence",'), "Must serialize beforeSequence param");
    assert.ok(apiClientSrc.includes('params.set("eventType",'), "Must serialize eventType param");
    assert.ok(apiClientSrc.includes('params.set("aggregateType",'), "Must serialize aggregateType param");
    assert.ok(apiClientSrc.includes('params.set("traceId",'), "Must serialize traceId param");
  });

  await t.test("3. api-client getEvent encodes URI parameter securely", () => {
    assert.ok(apiClientSrc.includes("encodeURIComponent(id)"), "Must encode event ID in getEvent");
  });
});

test("Operational UI App Controller Logic & XSS Prevention Suite", async (t) => {
  const appJsPath = path.join(WEB_DIR, "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  await t.test("1. app.js defines setupPlatformOperations and handles default tab", () => {
    assert.ok(appJs.includes("setupPlatformOperations()"), "Must define setupPlatformOperations");
    assert.ok(appJs.includes('"platform-operations"'), "Must handle platform-operations tab");
    assert.ok(appJs.includes("this.loadPlatformOperationsData()"), "Must load platform operations data");
  });

  await t.test("2. app.js loads and renders System Status, Durable Events, and Audit Log", () => {
    assert.ok(appJs.includes("loadSystemStatus()"), "Must define loadSystemStatus");
    assert.ok(appJs.includes("loadDurableEvents()"), "Must define loadDurableEvents");
    assert.ok(appJs.includes("renderEventsTable("), "Must define renderEventsTable");
    assert.ok(appJs.includes("showEventDetail("), "Must define showEventDetail");
    assert.ok(appJs.includes("loadAuditLogOps()"), "Must define loadAuditLogOps");
  });

  await t.test("3. app.js handles all mandatory states for Events (loading, empty, error)", () => {
    assert.ok(appJs.includes("events-loading"), "Must manipulate events-loading");
    assert.ok(appJs.includes("events-empty"), "Must manipulate events-empty");
    assert.ok(appJs.includes("events-error"), "Must manipulate events-error");
    assert.ok(appJs.includes("events-table-wrapper"), "Must manipulate events-table-wrapper");
  });

  await t.test("4. app.js handles all mandatory states for Audit Log (loading, empty, error)", () => {
    assert.ok(appJs.includes("audit-loading"), "Must manipulate audit-loading");
    assert.ok(appJs.includes("audit-empty"), "Must manipulate audit-empty");
    assert.ok(appJs.includes("audit-error"), "Must manipulate audit-error");
    assert.ok(appJs.includes("audit-table-wrapper"), "Must manipulate audit-table-wrapper");
  });

  await t.test("5. XSS Prevention: Zero innerHTML across platform operations rendering", () => {
    assert.equal(appJs.includes("events-tbody.innerHTML"), false, "Must not set innerHTML on events-tbody");
    assert.equal(appJs.includes("audit-ops-tbody.innerHTML"), false, "Must not set innerHTML on audit-ops-tbody");
    assert.equal(appJs.includes("modal-event-payload.innerHTML"), false, "Must not set innerHTML on modal-event-payload");
    assert.ok(appJs.includes("document.createElement("), "Must use document.createElement for DOM nodes");
    assert.ok(appJs.includes(".textContent ="), "Must use textContent for string values");
  });
});
