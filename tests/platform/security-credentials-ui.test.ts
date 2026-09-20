import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const WEB_DIR = path.resolve(process.cwd(), "src/platform/web");

test("Security Center & API Credential Governance UI Verification Suite", async (t) => {
  const htmlPath = path.join(WEB_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  const appJsPath = path.join(WEB_DIR, "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  const apiClientPath = path.join(WEB_DIR, "api-client.js");
  const apiClientJs = fs.readFileSync(apiClientPath, "utf8");

  await t.test("1. Security Center Tab: Exists with Zero-Trust badges", () => {
    assert.ok(html.includes('id="tab-security"'), "Must contain tab-security section");
    assert.ok(html.includes("Enterprise API Credential Governance"), "Must display Credential Governance heading");
    assert.ok(html.includes("Default-Deny Active"), "Must display Default-Deny badge");
  });

  await t.test("2. Credential Management Elements: Table, filters, and buttons exist", () => {
    assert.ok(html.includes('id="credentials-count-badge"'), "Must contain count badge");
    assert.ok(html.includes('id="open-create-cred-btn"'), "Must contain open generate key button");
    assert.ok(html.includes('id="refresh-creds-btn"'), "Must contain refresh button");
    assert.ok(html.includes('id="cred-search-input"'), "Must contain search input");
    assert.ok(html.includes('id="cred-status-filter"'), "Must contain status filter");
    assert.ok(html.includes('id="credentials-table"'), "Must contain credentials table");
    assert.ok(html.includes('id="credentials-tbody"'), "Must contain credentials tbody");
  });

  await t.test("3. Secret Revelation Panel: Safe one-time presentation panel exists", () => {
    assert.ok(html.includes('id="raw-key-revealed-panel"'), "Must contain raw key panel");
    assert.ok(html.includes('id="raw-key-display"'), "Must contain raw key input");
    assert.ok(html.includes('id="copy-raw-key-btn"'), "Must contain copy raw key button");
    assert.ok(html.includes('id="close-raw-key-btn"'), "Must contain dismiss button");
  });

  await t.test("4. Generation and Rotation Form Panels exist", () => {
    assert.ok(html.includes('id="create-cred-panel"'), "Must contain create panel");
    assert.ok(html.includes('id="create-cred-form"'), "Must contain create form");
    assert.ok(html.includes('id="cred-name-input"'), "Must contain name input");
    assert.ok(html.includes('id="cred-principal-id-input"'), "Must contain principal id input");
    assert.ok(html.includes('id="cred-principal-type-select"'), "Must contain principal type select");
    assert.ok(html.includes('id="cred-tenant-id-input"'), "Must contain tenant input");
    assert.ok(html.includes('id="cred-app-id-input"'), "Must contain app input");
    assert.ok(html.includes('id="cred-scopes-input"'), "Must contain scopes input");
    assert.ok(html.includes('id="cred-expiry-select"'), "Must contain expiry select");

    assert.ok(html.includes('id="rotate-cred-panel"'), "Must contain rotate panel");
    assert.ok(html.includes('id="rotate-cred-form"'), "Must contain rotate form");
    assert.ok(html.includes('id="rotate-cred-reason-input"'), "Must contain rotate reason input");
    assert.ok(html.includes('id="rotate-cred-grace-select"'), "Must contain grace select");
  });

  await t.test("5. Frontend DOM Hygiene: Strict 0 innerHTML in app.js", () => {
    assert.ok(!appJs.includes(".innerHTML"), "app.js must not contain any innerHTML usage");
    assert.ok(!appJs.includes("outerHTML"), "app.js must not contain any outerHTML usage");
    assert.ok(!appJs.includes("document.write"), "app.js must not contain document.write");
    assert.ok(appJs.includes("setupCredentials()"), "app.js must implement setupCredentials");
    assert.ok(appJs.includes("loadCredentials()"), "app.js must implement loadCredentials");
    assert.ok(appJs.includes("renderCredentials()"), "app.js must implement renderCredentials");
  });

  await t.test("6. API Client: Exposes REST credential endpoints", () => {
    assert.ok(apiClientJs.includes("getCredentials"), "api-client.js must export getCredentials");
    assert.ok(apiClientJs.includes("createCredential"), "api-client.js must export createCredential");
    assert.ok(apiClientJs.includes("rotateCredential"), "api-client.js must export rotateCredential");
    assert.ok(apiClientJs.includes("revokeCredential"), "api-client.js must export revokeCredential");
    assert.ok(apiClientJs.includes("deleteCredential"), "api-client.js must export deleteCredential");
  });
});
