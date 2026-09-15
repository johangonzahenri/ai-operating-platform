import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PLATFORM_VERSION } from "../../src/platform/version.js";

test("Prompt 72 - Release Candidate v1.1.0 Versioning & Integrity Gate", () => {
  assert.strictEqual(PLATFORM_VERSION, "1.1.0", "PLATFORM_VERSION must be 1.1.0");

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.strictEqual(pkg.version, "1.1.0", "package.json version must be 1.1.0");

  // Check required core documentation assets
  const requiredDocs = [
    "docs/MANUAL_OFICIAL.md",
    "docs/KNOWN_LIMITATIONS.md",
    "docs/PRODUCTION_READINESS.md",
    "docs/PLATFORM_TRUTH_MATRIX.md",
    "docs/PRODUCTION_ARCHITECTURE.md",
    "docs/SCALABILITY.md",
    "docs/ENTERPRISE_GOVERNANCE.md",
    "docs/PORTFOLIO_FREELANCER.md",
    "docs/case-study-tentaciones.md",
    "README.md",
    "CONTRIBUTING.md",
    "DEVELOPMENT.md",
    "SECURITY.md",
    "Dockerfile",
    ".dockerignore",
  ];

  for (const doc of requiredDocs) {
    assert.ok(fs.existsSync(doc), `Required release asset ${doc} must exist`);
  }
});

test("Prompt 72 - False-Claim & Security Purity Audit", () => {
  // Web Console purity
  const appJs = fs.readFileSync(path.join("src", "platform", "web", "app.js"), "utf8");
  const apiClientJs = fs.readFileSync(path.join("src", "platform", "web", "api-client.js"), "utf8");

  assert.ok(!appJs.includes(".innerHTML ="), "app.js must have 0 innerHTML mutations");
  assert.ok(!appJs.includes(".outerHTML ="), "app.js must have 0 outerHTML mutations");
  assert.ok(!appJs.includes("eval("), "app.js must have 0 eval calls");
  assert.ok(!apiClientJs.includes("eval("), "api-client.js must have 0 eval calls");

  // Check that Manual Oficial contains accessible explanations
  const manual = fs.readFileSync(path.join("docs", "MANUAL_OFICIAL.md"), "utf8");
  assert.ok(manual.includes("Visión General Ejecutiva"), "Manual must contain friendly Executive Overview");
  assert.ok(manual.includes("La Regla de Oro de la Arquitectura"), "Manual must clearly explain core invariant");
});
