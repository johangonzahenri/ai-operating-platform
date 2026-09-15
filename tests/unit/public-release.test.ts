import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLATFORM_VERSION } from "../../src/platform/version.js";

test("Prompt 87 - Public Release: Platform Version is 1.1.0 across single source of truth", () => {
  assert.equal(PLATFORM_VERSION, "1.1.0");
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  assert.equal(pkg.version, "1.1.0");
});

test("Prompt 87 - Public Release: Web Console DOM Security Guardrails (0 innerHTML, 0 eval)", () => {
  const appJs = fs.readFileSync(path.resolve(process.cwd(), "src/platform/web/app.js"), "utf8");
  const apiClientJs = fs.readFileSync(path.resolve(process.cwd(), "src/platform/web/api-client.js"), "utf8");
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), "src/platform/web/index.html"), "utf8");

  assert.ok(!appJs.includes(".innerHTML ="), "app.js must not contain innerHTML assignment");
  assert.ok(!appJs.includes(".outerHTML ="), "app.js must not contain outerHTML assignment");
  assert.ok(!appJs.includes("eval("), "app.js must not contain eval()");
  assert.ok(!appJs.includes("document.write("), "app.js must not contain document.write()");

  assert.ok(!apiClientJs.includes(".innerHTML ="), "api-client.js must not contain innerHTML assignment");
  assert.ok(!apiClientJs.includes("eval("), "api-client.js must not contain eval()");

  assert.ok(indexHtml.includes("AI Operating Platform"), "index.html must render title");
});

test("Prompt 87 - Public Release: Core Documentation and Guides exist and are non-empty", () => {
  const requiredDocs = [
    "docs/PUBLIC_DEMO_GUIDE.md",
    "docs/PORTFOLIO_RELEASE.md",
    "docs/TECHNICAL_OVERVIEW.md",
    "docs/DEMO_SCRIPT.md",
    "docs/PORTFOLIO_FREELANCER.md",
    "docs/case-study-tentaciones.md",
    "docs/PLATFORM_TRUTH_MATRIX.md",
    "README.md",
  ];

  for (const relPath of requiredDocs) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert.ok(fs.existsSync(fullPath), `Documentation file ${relPath} must exist`);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(content.length > 100, `Documentation file ${relPath} must not be empty`);
  }
});
