import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

describe("Phase 80: Operational Control Plane UI & Invariant Tests", () => {
  const htmlPath = path.join(rootDir, "src/platform/web/index.html");
  const appJsPath = path.join(rootDir, "src/platform/web/app.js");
  const apiClientPath = path.join(rootDir, "src/platform/web/api-client.js");
  const pkgJsonPath = path.join(rootDir, "package.json");
  const esLocalePath = path.join(rootDir, "src/platform/web/i18n/locale-es-419.js");
  const enLocalePath = path.join(rootDir, "src/platform/web/i18n/locale-en.js");

  it("1. package.json enforces zero external runtime npm dependencies in Core/Backend and allows only approved platform adapter dependencies", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const allowedPlatformDeps = new Set(["@modelcontextprotocol/server"]);
    const deps = Object.keys(pkg.dependencies || {});
    const unauthorized = deps.filter((d) => !allowedPlatformDeps.has(d));
    assert.equal(unauthorized.length, 0, `Unauthorized runtime dependencies detected: ${unauthorized.join(", ")}`);
  });

  it("2. web source files enforce strict DOM purity (0 innerHTML, 0 outerHTML, 0 eval, 0 document.write)", () => {
    const webDir = path.join(rootDir, "src/platform/web");
    const files = fs.readdirSync(webDir, { recursive: true }) as string[];

    for (const relFile of files) {
      const fullPath = path.join(webDir, relFile);
      if (fs.statSync(fullPath).isFile() && (fullPath.endsWith(".js") || fullPath.endsWith(".html"))) {
        const content = fs.readFileSync(fullPath, "utf8");
        assert.doesNotMatch(content, /\.innerHTML\s*=/, `Forbidden innerHTML in ${relFile}`);
        assert.doesNotMatch(content, /\.outerHTML\s*=/, `Forbidden outerHTML in ${relFile}`);
        assert.doesNotMatch(content, /\beval\s*\(/, `Forbidden eval() in ${relFile}`);
        assert.doesNotMatch(content, /document\.write\s*\(/, `Forbidden document.write in ${relFile}`);
      }
    }
  });

  it("3. index.html contains all required Phase 80 DOM structures and modals", () => {
    const html = fs.readFileSync(htmlPath, "utf8");

    // Nav tabs
    assert.match(html, /data-tab="workflows"/, "Missing Workflows nav tab");
    assert.match(html, /data-tab="approvals"/, "Missing Approvals nav tab");

    // Views
    assert.match(html, /id="tab-workflows"/, "Missing #tab-workflows view");
    assert.match(html, /id="tab-approvals"/, "Missing #tab-approvals view");

    // Workflows and instances tables
    assert.match(html, /id="workflows-tbody"/, "Missing #workflows-tbody");
    assert.match(html, /id="workflow-instances-tbody"/, "Missing #workflow-instances-tbody");
    assert.match(html, /id="workflows-count-badge"/, "Missing #workflows-count-badge");
    assert.match(html, /id="workflow-instances-count-badge"/, "Missing #workflow-instances-count-badge");

    // DAG visualizer card & controls
    assert.match(html, /id="workflow-dag-card"/, "Missing #workflow-dag-card");
    assert.match(html, /id="dag-instance-title"/, "Missing #dag-instance-title");
    assert.match(html, /id="workflow-dag-summary"/, "Missing #workflow-dag-summary");
    assert.match(html, /id="workflow-dag-steps-container"/, "Missing #workflow-dag-steps-container");
    assert.match(html, /id="dag-advance-btn"/, "Missing #dag-advance-btn");
    assert.match(html, /id="dag-pause-btn"/, "Missing #dag-pause-btn");
    assert.match(html, /id="dag-resume-btn"/, "Missing #dag-resume-btn");
    assert.match(html, /id="dag-cancel-btn"/, "Missing #dag-cancel-btn");
    assert.match(html, /id="dag-evidence-btn"/, "Missing #dag-evidence-btn");

    // Approvals table & SoD banner
    assert.match(html, /id="approvals-tbody"/, "Missing #approvals-tbody");
    assert.match(html, /id="approvals-count-badge"/, "Missing #approvals-count-badge");
    assert.match(html, /Segregation of Duties \(SoD\) Invariant:/, "Missing SoD invariant notice");

    // Modals
    assert.match(html, /id="create-workflow-modal"/, "Missing #create-workflow-modal");
    assert.match(html, /id="create-workflow-form"/, "Missing #create-workflow-form");
    assert.match(html, /id="start-instance-modal"/, "Missing #start-instance-modal");
    assert.match(html, /id="start-instance-form"/, "Missing #start-instance-form");
    assert.match(html, /id="approval-detail-modal"/, "Missing #approval-detail-modal");
    assert.match(html, /id="modal-appr-approve-btn"/, "Missing #modal-appr-approve-btn");
    assert.match(html, /id="modal-appr-reject-btn"/, "Missing #modal-appr-reject-btn");
    assert.match(html, /id="modal-appr-escalate-btn"/, "Missing #modal-appr-escalate-btn");
  });

  it("4. i18n locale files maintain 100% key parity for Phase 80 keys", async () => {
    const esModule = await import(pathToFileURL(esLocalePath).href);
    const enModule = await import(pathToFileURL(enLocalePath).href);

    const es = esModule.localeEs419 || esModule.default;
    const en = enModule.localeEn || enModule.default;

    // Check nav keys
    assert.ok(es.navigation?.workflows, "Missing es navigation.workflows");
    assert.ok(en.navigation?.workflows, "Missing en navigation.workflows");
    assert.ok(es.navigation?.approvals, "Missing es navigation.approvals");
    assert.ok(en.navigation?.approvals, "Missing en navigation.approvals");

    // Check operationsControl keys
    assert.ok(es.operationsControl, "Missing es operationsControl section");
    assert.ok(en.operationsControl, "Missing en operationsControl section");

    const checkSymmetry = (objEs: any, objEn: any, pathName = "") => {
      const esKeys = Object.keys(objEs);
      const enKeys = Object.keys(objEn);

      assert.deepEqual(
        esKeys.sort(),
        enKeys.sort(),
        `Mismatched keys at ${pathName}: ES has [${esKeys.join(",")}], EN has [${enKeys.join(",")}]`
      );

      for (const k of esKeys) {
        if (typeof objEs[k] === "object" && objEs[k] !== null) {
          checkSymmetry(objEs[k], objEn[k], `${pathName}.${k}`);
        }
      }
    };

    checkSymmetry(es.operationsControl, en.operationsControl, "operationsControl");
  });

  it("5. api-client.js exports all required operations control functions", () => {
    const clientCode = fs.readFileSync(apiClientPath, "utf8");

    const requiredFunctions = [
      "createWorkflowDefinition",
      "getWorkflowDefinition",
      "updateWorkflowDefinition",
      "activateWorkflowDefinition",
      "archiveWorkflowDefinition",
      "startWorkflow",
      "listWorkflowInstances",
      "getWorkflowInstance",
      "advanceWorkflow",
      "pauseWorkflow",
      "resumeWorkflow",
      "cancelWorkflow",
      "verifyWorkflowStep",
      "listVerifications",
      "getVerification",
      "listVerificationsByInstance",
      "listVerificationsByExecution",
      "requestApproval",
      "listApprovals",
      "getApproval",
      "startApprovalReview",
      "approveApprovalRequest",
      "rejectApprovalRequest",
      "cancelApprovalRequest",
      "escalateApprovalRequest",
      "listApprovalsByInstance",
    ];

    for (const fn of requiredFunctions) {
      assert.match(
        clientCode,
        new RegExp(`export async function ${fn}\\b`),
        `api-client.js must export ${fn}`
      );
    }
  });

  it("6. app.js contains setup and controller methods for workflows and approvals", () => {
    const appCode = fs.readFileSync(appJsPath, "utf8");

    assert.match(appCode, /setupWorkflows\(\)/, "Missing setupWorkflows in app.js");
    assert.match(appCode, /loadWorkflowsData\(\)/, "Missing loadWorkflowsData in app.js");
    assert.match(appCode, /renderWorkflowsTable\(\)/, "Missing renderWorkflowsTable in app.js");
    assert.match(appCode, /renderWorkflowInstancesTable\(\)/, "Missing renderWorkflowInstancesTable in app.js");
    assert.match(appCode, /showInstanceDAG\(/, "Missing showInstanceDAG in app.js");
    assert.match(appCode, /setupApprovals\(\)/, "Missing setupApprovals in app.js");
    assert.match(appCode, /loadApprovalsData\(\)/, "Missing loadApprovalsData in app.js");
    assert.match(appCode, /renderApprovalsTable\(\)/, "Missing renderApprovalsTable in app.js");
    assert.match(appCode, /openApprovalModal\(/, "Missing openApprovalModal in app.js");
  });
});
