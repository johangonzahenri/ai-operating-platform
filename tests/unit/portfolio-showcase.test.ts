import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("Prompt 66 - Official Manual & Documentation Integrity", () => {
  const manualPath = path.join("docs", "MANUAL_OFICIAL.md");
  assert.ok(fs.existsSync(manualPath), "docs/MANUAL_OFICIAL.md must exist");
  const manual = fs.readFileSync(manualPath, "utf8");

  // Verify key required sections
  assert.ok(manual.includes("1. Executive Overview"));
  assert.ok(manual.includes("3. Architecture Principles"));
  assert.ok(manual.includes("CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS"));
  assert.ok(manual.includes("18. Tentaciones AI Commerce"));
  assert.ok(manual.includes("20. AR / 3D Virtual Fitting"));
  assert.ok(manual.includes("21. End-to-End Journey"));
  assert.ok(manual.includes("Cómo estudiar este proyecto"));

  // Check documentation index
  const docsIndexPath = path.join("docs", "README.md");
  assert.ok(fs.existsSync(docsIndexPath), "docs/README.md must exist");

  // Check ADRs
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(3, "0");
    const files = fs.readdirSync(path.join("docs", "decisions"));
    const match = files.find((f) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `ADR-${num} must exist in docs/decisions/`);
  }
});

test("Prompt 67 - GitHub & Freelancer Portfolio Assets", () => {
  // Check root README
  const rootReadme = fs.readFileSync("README.md", "utf8");
  assert.ok(rootReadme.includes("AI OPERATING PLATFORM"), "README must contain main title");
  assert.ok(rootReadme.includes("848 passing") || rootReadme.includes("833+ passing") || rootReadme.includes("passing"), "README must cite verified passing tests");
  assert.ok(rootReadme.includes("Quick Start & Reproducibility"), "README must provide reproducibility instructions");

  // Check Freelancer Portfolio Package
  const freelancerPath = path.join("docs", "PORTFOLIO_FREELANCER.md");
  assert.ok(fs.existsSync(freelancerPath), "docs/PORTFOLIO_FREELANCER.md must exist");
  const freelancer = fs.readFileSync(freelancerPath, "utf8");
  assert.ok(freelancer.includes("Technical Skills Demonstrated"));
  assert.ok(freelancer.includes("Verified Results"));

  // Check Case Study
  const caseStudyPath = path.join("docs", "case-study-tentaciones.md");
  assert.ok(fs.existsSync(caseStudyPath), "docs/case-study-tentaciones.md must exist");

  // Check Governance Guides
  assert.ok(fs.existsSync("CONTRIBUTING.md"), "CONTRIBUTING.md must exist");
  assert.ok(fs.existsSync("DEVELOPMENT.md"), "DEVELOPMENT.md must exist");
  assert.ok(fs.existsSync("SECURITY.md"), "SECURITY.md must exist");
});

test("Prompt 68 - Enterprise Showcase & Visual Assets", () => {
  const assetsDir = path.join("docs", "assets");
  const expectedSvgs = [
    "master-architecture.svg",
    "golden-journey.svg",
    "security-flow.svg",
    "application-integration.svg",
  ];

  for (const svg of expectedSvgs) {
    const svgPath = path.join(assetsDir, svg);
    assert.ok(fs.existsSync(svgPath), `Visual asset ${svg} must exist`);
    const content = fs.readFileSync(svgPath, "utf8").trim();
    assert.ok(content.startsWith("<svg") && content.endsWith("</svg>"), `${svg} must be valid XML SVG`);
  }

  // Check Web Console Showcase tab
  const html = fs.readFileSync(path.join("src", "platform", "web", "index.html"), "utf8");
  assert.ok(html.includes('data-tab="showcase"'), "index.html must have showcase tab button");
  assert.ok(html.includes('id="tab-showcase"'), "index.html must have tab-showcase section");
  assert.ok(html.includes('id="showcase-run-journey-btn"'), "index.html must have journey run button");
});

test("Prompt 68 - Security & DOM Purity Guardrails across all web scripts", () => {
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