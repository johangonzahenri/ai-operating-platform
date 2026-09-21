import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WEB_DIR = path.resolve(process.cwd(), "src/platform/web");

test("Phase 79: Enterprise Control Plane UI - Portfolio, Governance, Reconciliation & Evidence Verification Suite", async (t) => {
  const htmlPath = path.join(WEB_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const apiClientPath = path.join(WEB_DIR, "api-client.js");
  const apiClientSrc = fs.readFileSync(apiClientPath, "utf8");
  const appJsPath = path.join(WEB_DIR, "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  // --- I18N Parity & Defaults ---
  await t.test("1. I18N: es-419 default and en locale files contain complete Phase 79 keys", async () => {
    const esModulePath = pathToFileURL(path.join(WEB_DIR, "i18n/locale-es-419.js")).href;
    const enModulePath = pathToFileURL(path.join(WEB_DIR, "i18n/locale-en.js")).href;

    const es = (await import(esModulePath)).default;
    const en = (await import(enModulePath)).default;

    // Check portfolioGovernance
    assert.ok(es.portfolioGovernance, "es-419 must contain portfolioGovernance namespace");
    assert.ok(en.portfolioGovernance, "en must contain portfolioGovernance namespace");
    assert.ok(es.portfolioGovernance.title, "es-419 must have title");
    assert.ok(en.portfolioGovernance.title, "en must have title");
    assert.ok(es.portfolioGovernance.reconcileMandate, "es-419 must have reconcileMandate");
    assert.ok(en.portfolioGovernance.reconcileMandate, "en must have reconcileMandate");

    // Check reconciliation
    assert.ok(es.reconciliation, "es-419 must contain reconciliation namespace");
    assert.ok(en.reconciliation, "en must contain reconciliation namespace");
    assert.ok(es.reconciliation.title, "es-419 must have reconciliation title");
    assert.ok(en.reconciliation.immutableNotice, "es-419 must declare immutability invariant");

    // Check evidenceExport
    assert.ok(es.evidenceExport, "es-419 must contain evidenceExport namespace");
    assert.ok(en.evidenceExport, "en must contain evidenceExport namespace");
    assert.ok(es.evidenceExport.integritySeal, "es-419 must have integritySeal");
    assert.ok(en.evidenceExport.integritySeal, "en must have integritySeal");
    assert.ok(es.evidenceExport.zeroMutationNotice, "es-419 must declare zero mutation notice");

    // Parity Check
    assert.deepEqual(Object.keys(es.portfolioGovernance).sort(), Object.keys(en.portfolioGovernance).sort());
    assert.deepEqual(Object.keys(es.reconciliation).sort(), Object.keys(en.reconciliation).sort());
    assert.deepEqual(Object.keys(es.evidenceExport).sort(), Object.keys(en.evidenceExport).sort());
  });

  // --- Portfolio & Mandates UI ---
  await t.test("2. Portfolio UI: Template contains active selector, context display, and reconciliation panel", () => {
    assert.ok(html.includes('id="tab-portfolios"'), "Must contain tab-portfolios");
    assert.ok(html.includes('id="portfolio-active-select"'), "Must contain portfolio active selector");
    assert.ok(html.includes('id="portfolio-context-display"'), "Must contain portfolio context display");
    assert.ok(html.includes('id="portfolios-list-container"'), "Must contain portfolios list container");
    assert.ok(html.includes('id="mandates-list-container"'), "Must contain mandates list container");
    assert.ok(html.includes('id="portfolio-objectives-container"'), "Must contain objectives container");
    assert.ok(html.includes('id="eval-authority-btn"'), "Must contain cross-enterprise authority evaluator");
  });

  // --- Mandate Reconciliation UI (Phase 77) ---
  await t.test("3. Reconciliation UI: Template contains target mandate reconciliation inputs and trigger types", () => {
    assert.ok(html.includes('id="rec-mandate-id"'), "Must contain mandate id input");
    assert.ok(html.includes('id="rec-trigger-type"'), "Must contain trigger type select");
    assert.ok(html.includes('id="rec-reason"'), "Must contain reconciliation reason input");
    assert.ok(html.includes('id="execute-reconciliation-btn"'), "Must contain reconcile button");
    assert.ok(html.includes('id="reconcile-expired-btn"'), "Must contain reconcile expired button");
    assert.ok(html.includes('id="reconciliation-result-container"'), "Must contain reconciliation result display");
  });

  // --- Evidence Export UI (Phase 78) ---
  await t.test("4. Evidence Export UI: Template contains 9 scopes, date bounds, and download actions", () => {
    assert.ok(html.includes('id="tab-evidence"'), "Must contain tab-evidence section");
    assert.ok(html.includes('id="evidence-scope-select"'), "Must contain evidence scope select");
    for (const scope of ["TENANT", "PORTFOLIO", "ENTERPRISE", "WORKFLOW", "EXECUTION", "MANDATE", "APPROVAL", "RECONCILIATION", "AUDIT_TRAIL"]) {
      assert.ok(html.includes(`<option value="${scope}">${scope}</option>`), `Must include option for ${scope}`);
    }
    assert.ok(html.includes('id="evidence-from-date"'), "Must contain fromDate filter");
    assert.ok(html.includes('id="evidence-to-date"'), "Must contain toDate filter");
    assert.ok(html.includes('id="evidence-limit"'), "Must contain limit filter");
    assert.ok(html.includes('id="evidence-export-btn"'), "Must contain export button");
    assert.ok(html.includes('id="evidence-download-btn"'), "Must contain download button");
    assert.ok(html.includes('id="evidence-manifest-container"'), "Must contain manifest container");
  });

  // --- Web API Client Wrappers ---
  await t.test("5. Web API Client: Exports all required methods for Portfolios, Mandates, Reconciliation and Evidence", () => {
    assert.ok(apiClientSrc.includes("export async function getPortfolios()"), "Must export getPortfolios");
    assert.ok(apiClientSrc.includes("export async function getPortfolioOperatingContext("), "Must export getPortfolioOperatingContext");
    assert.ok(apiClientSrc.includes("export async function getPortfolioMandates("), "Must export getPortfolioMandates");
    assert.ok(apiClientSrc.includes("export async function revokeMandate("), "Must export revokeMandate");
    assert.ok(apiClientSrc.includes("export async function reconcileMandate("), "Must export reconcileMandate");
    assert.ok(apiClientSrc.includes("export async function reconcileExpiredMandates("), "Must export reconcileExpiredMandates");
    assert.ok(apiClientSrc.includes("export async function exportEvidence("), "Must export exportEvidence");
  });

  // --- Security & Hexagonal Boundary ---
  await t.test("6. Security & DOM Hygiene: Zero innerHTML, outerHTML, eval, or document.write in web application", () => {
    const innerMatches = appJs.match(/\.innerHTML\s*=/g);
    const outerMatches = appJs.match(/\.outerHTML\s*=/g);
    const evalMatches = appJs.match(/\beval\s*\(/g);
    const docWriteMatches = appJs.match(/document\.write/g);

    assert.equal(innerMatches, null, "Must contain 0 innerHTML in app.js");
    assert.equal(outerMatches, null, "Must contain 0 outerHTML in app.js");
    assert.equal(evalMatches, null, "Must contain 0 eval in app.js");
    assert.equal(docWriteMatches, null, "Must contain 0 document.write in app.js");
  });

  await t.test("7. Hexagonal Boundary: Web scripts contain 0 imports from internal domain or infrastructure", () => {
    const webFiles = fs.readdirSync(WEB_DIR).filter((f) => f.endsWith(".js"));
    for (const file of webFiles) {
      const content = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      assert.doesNotMatch(content, /from\s+['"].*domain.*['"]/, `${file} must not import from domain`);
      assert.doesNotMatch(content, /from\s+['"].*infrastructure.*['"]/, `${file} must not import from infrastructure`);
      assert.doesNotMatch(content, /from\s+['"].*sqlite.*['"]/, `${file} must not import from sqlite`);
    }
  });
});
