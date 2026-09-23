import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseCliArgs,
  runCreateAopAppCli,
} from "../../src/platform-client/create-aop-app.js";

test("CLI Parser: parses init command with all flags correctly", () => {
  const parsed = parseCliArgs([
    "init",
    "my-test-app",
    "--name",
    "My Test App",
    "--description",
    "A test application for AOP",
    "--category",
    "Commerce",
    "--tenant",
    "tenant-enterprise-01",
    "--plan",
    "ENTERPRISE",
    "--template",
    "commerce-ai-app",
    "--capabilities",
    "product.discovery,ar.fitting_room,cart.assistance",
    "--runtime",
    "node",
    "--environment",
    "production",
    "--min-platform-version",
    "1.4.0",
    "--output",
    "./custom-output",
    "--dry-run",
    "--force",
    "--json",
  ]);

  assert.equal(parsed.command, "init");
  assert.equal(parsed.targetAppId, "my-test-app");
  assert.equal(parsed.options.name, "My Test App");
  assert.equal(parsed.options.description, "A test application for AOP");
  assert.equal(parsed.options.category, "Commerce");
  assert.equal(parsed.options.tenantId, "tenant-enterprise-01");
  assert.equal(parsed.options.tenantPlan, "ENTERPRISE");
  assert.equal(parsed.options.template, "commerce-ai-app");
  assert.deepEqual(parsed.options.capabilities, [
    "product.discovery",
    "ar.fitting_room",
    "cart.assistance",
  ]);
  assert.equal(parsed.options.runtime, "node");
  assert.equal(parsed.options.environment, "production");
  assert.equal(parsed.options.minPlatformVersion, "1.4.0");
  assert.equal(parsed.options.outputDir, "./custom-output");
  assert.equal(parsed.options.dryRun, true);
  assert.equal(parsed.options.force, true);
  assert.equal(parsed.options.json, true);
});

test("CLI Parser: parses help and fallback subcommands", () => {
  assert.equal(parseCliArgs(["help"]).command, "help");
  assert.equal(parseCliArgs(["--help"]).command, "help");
  assert.equal(parseCliArgs(["-h"]).command, "help");
  assert.equal(parseCliArgs([]).command, "help");
  assert.equal(parseCliArgs(["templates"]).command, "templates");
  assert.equal(parseCliArgs(["capabilities"]).command, "capabilities");
  assert.equal(parseCliArgs(["validate", "./app.json"]).command, "validate");
  assert.equal(parseCliArgs(["doctor", "./app.json"]).command, "doctor");
});

test("CLI Runner: templates command returns available blueprints", async () => {
  let logs = "";
  const code = await runCreateAopAppCli(["templates"], {
    stdout: (msg) => {
      logs += msg + "\n";
    },
    stderr: () => {},
  });

  assert.equal(code, 0);
  assert.ok(logs.includes("commerce-ai-app"));
  assert.ok(logs.includes("generic-ai-app"));
  assert.ok(logs.includes("support-ai-app"));
  assert.ok(logs.includes("automation-ai-app"));
});

test("CLI Runner: templates --json output is valid JSON", async () => {
  let logs = "";
  const code = await runCreateAopAppCli(["templates", "--json"], {
    stdout: (msg) => {
      logs += msg + "\n";
    },
    stderr: () => {},
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(logs);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.length >= 4);
  assert.ok(parsed.some((t: any) => t.id === "commerce-ai-app"));
});

test("CLI Runner: capabilities command returns catalog with dependencies", async () => {
  let logs = "";
  const code = await runCreateAopAppCli(["capabilities"], {
    stdout: (msg) => {
      logs += msg + "\n";
    },
    stderr: () => {},
  });

  assert.equal(code, 0);
  assert.ok(logs.includes("product.discovery"));
  assert.ok(logs.includes("ar.fitting_room"));
  assert.ok(logs.includes("Enterprise AI Operating Platform Catalog"));
});

test("CLI Runner: capabilities --json output is valid JSON", async () => {
  let logs = "";
  const code = await runCreateAopAppCli(["capabilities", "--json"], {
    stdout: (msg) => {
      logs += msg + "\n";
    },
    stderr: () => {},
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(logs);
  assert.ok(Array.isArray(parsed.capabilities));
  assert.ok(parsed.capabilities.length >= 8);
  assert.ok(parsed.capabilities.some((c: any) => c.id === "ar.fitting_room"));
});

test("CLI Runner: init --dry-run produces preview without filesystem side-effects", async () => {
  let logs = "";
  const code = await runCreateAopAppCli(
    [
      "init",
      "preview-app",
      "--template",
      "commerce-ai-app",
      "--plan",
      "ENTERPRISE",
      "--dry-run",
    ],
    {
      stdout: (msg) => {
        logs += msg + "\n";
      },
      stderr: () => {},
    }
  );

  assert.equal(code, 0);
  assert.ok(logs.includes("[DRY-RUN]"));
  assert.ok(logs.includes("application.json"));
  assert.ok(logs.includes("src/adapter.ts"));
  assert.ok(!fs.existsSync(path.resolve(process.cwd(), "preview-app")));
});

test("CLI Runner: init fails closed if requested capabilities exceed tenant plan entitlements", async () => {
  let errors = "";
  const code = await runCreateAopAppCli(
    [
      "init",
      "forbidden-app",
      "--plan",
      "FREE",
      "--capabilities",
      "ar.fitting_room,automation.execute",
    ],
    {
      stdout: () => {},
      stderr: (msg) => {
        errors += msg + "\n";
      },
    }
  );

  assert.equal(code, 1);
  assert.ok(errors.includes("Entitlement validation failed"));
  assert.ok(errors.includes("ar.fitting_room"));
});

test("CLI Runner: init scaffolds a full governed satellite application end-to-end", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aop-app-test-"));
  const targetDir = path.join(tmpDir, "my-satellite-app");

  try {
    let logs = "";
    const code = await runCreateAopAppCli(
      [
        "init",
        "my-satellite-app",
        "--name",
        "My Governed Satellite App",
        "--template",
        "commerce-ai-app",
        "--tenant",
        "tenant-corp-01",
        "--plan",
        "ENTERPRISE",
        "--output",
        targetDir,
      ],
      {
        stdout: (msg) => {
          logs += msg + "\n";
        },
        stderr: () => {},
      }
    );

    assert.equal(code, 0);
    assert.ok(logs.includes("Scaffolding completed successfully"));

    // Verify generated files
    const manifestPath = path.join(targetDir, "application.json");
    const adapterPath = path.join(targetDir, "src", "adapter.ts");
    const healthPath = path.join(targetDir, "src", "health.ts");
    const obsPath = path.join(targetDir, "src", "observability.ts");
    const readmePath = path.join(targetDir, "README.md");
    const testPath = path.join(targetDir, "tests", "integration.test.ts");

    assert.ok(fs.existsSync(manifestPath), "application.json exists");
    assert.ok(fs.existsSync(adapterPath), "src/adapter.ts exists");
    assert.ok(fs.existsSync(healthPath), "src/health.ts exists");
    assert.ok(fs.existsSync(obsPath), "src/observability.ts exists");
    assert.ok(fs.existsSync(readmePath), "README.md exists");
    assert.ok(fs.existsSync(testPath), "tests/integration.test.ts exists");

    // Verify SDK package naming
    const adapterContent = fs.readFileSync(adapterPath, "utf-8");
    assert.ok(adapterContent.includes("@ai-platform/client"));
    assert.ok(!adapterContent.includes("@ai-platform/sdk"));

    // Verify manifest validity
    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.equal(manifestRaw.applicationId, "my-satellite-app");
    assert.equal(manifestRaw.name, "My Governed Satellite App");

    // Run validate command on generated app
    let valLogs = "";
    const valCode = await runCreateAopAppCli(["validate", manifestPath], {
      stdout: (msg) => {
        valLogs += msg + "\n";
      },
      stderr: () => {},
    });
    assert.equal(valCode, 0);
    assert.ok(valLogs.includes("Valid:        true"));

    // Run doctor command on generated app
    let docLogs = "";
    const docCode = await runCreateAopAppCli(["doctor", targetDir], {
      stdout: (msg) => {
        docLogs += msg + "\n";
      },
      stderr: () => {},
    });
    assert.equal(docCode, 0);
    assert.ok(docLogs.includes("Harness passed: true"));
    assert.ok(docLogs.includes("Tests passed:   7 / 7"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
