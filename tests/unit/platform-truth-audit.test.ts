import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("Prompt 60 - Truth Audit: No false CONNECTED / LIVE status for external applications in Web Console", () => {
  const appJsPath = path.join("src", "platform", "web", "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  // Verify external applications are NOT statically flagged as CONNECTED
  assert.equal(
    appJs.includes('status: "CONNECTED"'),
    false,
    "External applications must not have static status 'CONNECTED'"
  );

  // Verify Tentaciones AI Commerce is honestly flagged as PLANNED / DESIGNED / NOT_CONNECTED
  assert.ok(appJs.includes('id: "tentaciones-commerce"'), "Must include tentaciones-commerce");
  assert.ok(appJs.includes('runtimeStatus: "NOT_CONNECTED"'), "Tentaciones must have runtimeStatus NOT_CONNECTED");
  assert.ok(appJs.includes('implementationStatus: "DESIGNED"'), "Tentaciones must have implementationStatus DESIGNED");
  assert.ok(appJs.includes('sourceOfTruth: "External Application Contract"'), "Tentaciones source must be External Application Contract");
  assert.ok(appJs.includes('role: "External Consumer"'), "Tentaciones role must be External Consumer");
});

test("Prompt 60 - Truth Audit: Blueprint and Subsystems table reflect honest dual-state taxonomy", () => {
  const htmlPath = path.join("src", "platform", "web", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  // Verify Tier 1 status pill in Blueprint is NOT "1 Connected"
  assert.equal(
    html.includes("1 Connected · 2 Planned"),
    false,
    "Blueprint tier 1 must not display 1 Connected"
  );
  assert.ok(
    html.includes("Planned Integrations") || html.includes("Planned Integration"),
    "Blueprint tier 1 must display Planned Integrations"
  );

  // Verify Subsystem Truth Matrix table headers contain dual-state columns
  assert.ok(html.includes("Platform Subsystem"), "Must contain Platform Subsystem column");
  assert.ok(html.includes("Implementation"), "Must contain Implementation column");
  assert.ok(html.includes("Runtime Status"), "Must contain Runtime Status column");
  assert.ok(html.includes("Source of Truth"), "Must contain Source of Truth column");

  // Verify Tentaciones subsystem entry in table is DESIGNED / PLANNED
  assert.ok(html.includes("DESIGNED"), "Must contain DESIGNED pills");
  assert.ok(html.includes("IMPLEMENTED"), "Must contain IMPLEMENTED pills");
});

test("Prompt 60 - Truth Audit: Source badges and CSS taxonomy exist", () => {
  const cssPath = path.join("src", "platform", "web", "styles.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(css.includes(".source-badge"), "Must define .source-badge in CSS");
  assert.ok(css.includes(".source-badge-api"), "Must define .source-badge-api in CSS");
  assert.ok(css.includes(".source-badge-arch"), "Must define .source-badge-arch in CSS");
  assert.ok(css.includes(".source-badge-ext"), "Must define .source-badge-ext in CSS");
  assert.ok(css.includes(".status-pill-not-connected"), "Must define .status-pill-not-connected in CSS");
  assert.ok(css.includes(".status-pill-implemented"), "Must define .status-pill-implemented in CSS");
  assert.ok(css.includes(".status-pill-designed"), "Must define .status-pill-designed in CSS");
});

test("Prompt 60 - Truth Audit: Simulation explicitly labeled as Orchestration Contract Test", () => {
  const htmlPath = path.join("src", "platform", "web", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.ok(
    html.includes("Orchestration Contract Test (Simulation via Platform API)"),
    "Simulation runner must be explicitly labeled as Orchestration Contract Test"
  );
});

test("Prompt 60 - DOM Security Invariant: Zero unsafe DOM manipulation", () => {
  const webDir = path.join("src", "platform", "web");
  const jsFiles = ["app.js", "api-client.js"];

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes(".innerHTML"), false, `${file} must have 0 .innerHTML usage`);
    assert.equal(content.includes(".outerHTML"), false, `${file} must have 0 .outerHTML usage`);
    assert.equal(content.includes("eval("), false, `${file} must have 0 eval() usage`);
    assert.equal(content.includes("document.write("), false, `${file} must have 0 document.write() usage`);
  }
});

test("Prompt 60 - Architectural Boundary Invariant: CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS", () => {
  const domainDir = path.join("src", "domain");
  const domainFiles = fs.readdirSync(domainDir, { recursive: true }) as string[];

  for (const file of domainFiles) {
    if (typeof file === "string" && file.endsWith(".ts")) {
      const content = fs.readFileSync(path.join(domainDir, file), "utf8");
      assert.equal(content.includes("tentaciones"), false, `Domain file ${file} must never reference application 'tentaciones'`);
      assert.equal(content.includes("platform/web"), false, `Domain file ${file} must never reference web console`);
      assert.equal(content.includes("express"), false, `Domain file ${file} must never reference express`);
    }
  }
});
