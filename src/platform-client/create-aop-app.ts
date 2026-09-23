#!/usr/bin/env node
/**
 * create-aop-app — AI Operating Platform Application Scaffolding CLI
 * Generates governed, type-safe satellite applications using ApplicationFactoryEngine.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ApplicationFactoryEngine,
  GenerateApplicationInput,
} from "../application/factory/application-generator.js";
import {
  ApplicationValidator,
  PLATFORM_CAPABILITY_CATALOG,
} from "../domain/application/application-contract.js";
import { Tenant } from "../domain/tenant/tenant.js";

export interface CreateAppOptions {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly tenantPlan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE" | undefined;
  readonly template?: string | undefined;
  readonly capabilities?: readonly string[] | undefined;
  readonly runtime?: string | undefined;
  readonly environment?: "development" | "staging" | "production" | undefined;
  readonly minPlatformVersion?: string | undefined;
  readonly outputDir?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly json?: boolean | undefined;
}

export interface CliParsedCommand {
  readonly command: "init" | "templates" | "capabilities" | "validate" | "doctor" | "help";
  readonly targetAppId?: string | undefined;
  readonly options: CreateAppOptions;
}

export interface CliIoStreams {
  readonly stdout?: (msg: string) => void;
  readonly stderr?: (msg: string) => void;
}

export function parseCliArgs(args: string[]): CliParsedCommand {
  const options: {
    name?: string;
    description?: string;
    category?: string;
    tenantId?: string;
    tenantPlan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
    template?: string;
    capabilities?: string[];
    runtime?: string;
    environment?: "development" | "staging" | "production";
    minPlatformVersion?: string;
    outputDir?: string;
    dryRun?: boolean;
    force?: boolean;
    json?: boolean;
  } = {};

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--name" && args[i + 1]) {
      options.name = args[++i];
    } else if (arg === "--description" && args[i + 1]) {
      options.description = args[++i];
    } else if (arg === "--category" && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === "--tenant" && args[i + 1]) {
      options.tenantId = args[++i];
    } else if (arg === "--plan" && args[i + 1]) {
      const plan = args[++i]?.toUpperCase();
      if (plan === "FREE" || plan === "PRO" || plan === "BUSINESS" || plan === "ENTERPRISE") {
        options.tenantPlan = plan;
      }
    } else if (arg === "--template" && args[i + 1]) {
      options.template = args[++i];
    } else if (arg === "--capabilities" && args[i + 1]) {
      options.capabilities = args[++i]?.split(",").map((c) => c.trim()).filter(Boolean);
    } else if (arg === "--runtime" && args[i + 1]) {
      options.runtime = args[++i];
    } else if (arg === "--environment" && args[i + 1]) {
      const env = args[++i]?.toLowerCase();
      if (env === "development" || env === "staging" || env === "production") {
        options.environment = env;
      }
    } else if (arg === "--min-platform-version" && args[i + 1]) {
      options.minPlatformVersion = args[++i];
    } else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const rawCommand = positional[0]?.toLowerCase() ?? "help";
  let command: CliParsedCommand["command"] = "help";

  if (rawCommand === "init") command = "init";
  else if (rawCommand === "templates") command = "templates";
  else if (rawCommand === "capabilities") command = "capabilities";
  else if (rawCommand === "validate") command = "validate";
  else if (rawCommand === "doctor") command = "doctor";

  return {
    command,
    targetAppId: positional[1],
    options,
  };
}

export async function runCreateAopAppCli(
  argv: string[] = process.argv.slice(2),
  io?: CliIoStreams
): Promise<number> {
  const log = io?.stdout ?? ((msg: string) => console.log(msg));
  const err = io?.stderr ?? ((msg: string) => console.error(msg));

  const parsed = parseCliArgs(argv);
  const { command, targetAppId, options } = parsed;

  if (command === "help" || argv.includes("--help") || argv.includes("-h")) {
    printHelp(log);
    return 0;
  }

  if (command === "templates") {
    return handleListTemplates(options.json, log);
  }

  if (command === "capabilities") {
    return handleListCapabilities(options.json, log);
  }

  if (command === "validate") {
    return handleValidateManifest(targetAppId, options, log, err);
  }

  if (command === "doctor") {
    return handleDoctorHarness(targetAppId, options, log, err);
  }

  if (command === "init") {
    return handleInitApplication(targetAppId, options, log, err);
  }

  err(`[create-aop-app] Unknown command: ${command}`);
  printHelp(log);
  return 1;
}

export const runCreateAppCli = runCreateAopAppCli;

function printHelp(log: (msg: string) => void): void {
  log(`
create-aop-app — AI Operating Platform Application Scaffolding CLI

Usage:
  npx create-aop-app <command> [app-id] [options]

Commands:
  init <app-id>              Generate a new satellite application skeleton
  templates                  List available starter templates
  capabilities               List catalogued platform capabilities & dependencies
  validate [manifest-path]   Validate an existing application manifest
  doctor [manifest-path]     Run 7-point compliance and harness checks

Options:
  --template <id>            Starter template (generic-ai-app, commerce-ai-app, support-ai-app, automation-ai-app)
  --name <string>            Human-readable display name
  --description <string>     Application description
  --category <string>        Application category (Commerce, Support, Automation, Custom)
  --tenant <tenantId>        Target tenant ID (default: tenant-default)
  --plan <plan>              Tenant plan tier: FREE, PRO, BUSINESS, ENTERPRISE (default: FREE)
  --capabilities <c1,c2>     Comma-separated list of capabilities to declare
  --output, -o <dir>         Destination directory (default: ./<app-id>)
  --dry-run                  Preview generated files and validation without writing to disk
  --force, -f                Overwrite destination directory if it already exists
  --json                     Output deterministic JSON payload
  --help, -h                 Show this help manual
`);
}

function handleListTemplates(json?: boolean, log: (msg: string) => void = console.log): number {
  const templates = ApplicationFactoryEngine.getFactoryTemplates();
  if (json) {
    log(JSON.stringify(templates, null, 2));
    return 0;
  }

  log("\nAvailable Application Templates:\n");
  for (const t of templates) {
    log(`  * ${t.id} (${t.name})`);
    log(`    Category:     ${t.defaultCategory}`);
    log(`    Runtime:      ${t.defaultRuntime}`);
    log(`    Capabilities: ${t.recommendedCapabilities.join(", ")}`);
    log(`    ${t.description}\n`);
  }
  return 0;
}

function handleListCapabilities(json?: boolean, log: (msg: string) => void = console.log): number {
  const caps = PLATFORM_CAPABILITY_CATALOG;
  const graph = ApplicationFactoryEngine.getCapabilityDependencyGraph(caps.map((c) => c.id));

  if (json) {
    log(JSON.stringify({ capabilities: caps, dependencyGraph: graph }, null, 2));
    return 0;
  }

  log("\nEnterprise AI Operating Platform Catalog & Dependencies:\n");
  for (const c of caps) {
    const dep = graph.find((g) => g.capabilityId === c.id);
    log(`  * [${c.id}] ${c.name} (Min Plan: ${c.requiredPlan})`);
    log(`    Description: ${c.description}`);
    if (dep) {
      log(`    Features:    ${dep.requiredFeatures.join(", ")}`);
      log(`    Components:  ${dep.platformComponents.join(", ")}`);
    }
    log("");
  }
  return 0;
}

function handleValidateManifest(
  targetPath?: string,
  options?: CreateAppOptions,
  log: (msg: string) => void = console.log,
  err: (msg: string) => void = console.error
): number {
  let manifestPath = targetPath ?? "application.json";
  if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isDirectory()) {
    manifestPath = path.join(manifestPath, "application.json");
  }

  if (!fs.existsSync(manifestPath)) {
    if (options?.json) {
      log(JSON.stringify({ valid: false, error: `Manifest file not found: ${manifestPath}` }));
    } else {
      err(`[ERROR] Manifest file not found: ${manifestPath}`);
    }
    return 1;
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const validation = ApplicationValidator.validateManifest(manifest);

    if (options?.json) {
      log(JSON.stringify(validation, null, 2));
      return validation.valid ? 0 : 1;
    }

    if (validation.valid) {
      log(`[PASS] Manifest '${manifest.applicationId}' is valid.`);
      log(`  Valid:        true`);
      log(`  Version:      ${manifest.version}`);
      log(`  Capabilities: ${manifest.capabilities.join(", ")}`);
      return 0;
    } else {
      err(`[FAIL] Manifest validation failed for '${manifest.applicationId}':`);
      for (const e of validation.errors) {
        err(`  - ${e}`);
      }
      return 1;
    }
  } catch (error: any) {
    if (options?.json) {
      log(JSON.stringify({ valid: false, error: error.message }));
    } else {
      err(`[ERROR] Failed to parse manifest JSON: ${error.message}`);
    }
    return 1;
  }
}

function handleDoctorHarness(
  targetPath?: string,
  options?: CreateAppOptions,
  log: (msg: string) => void = console.log,
  err: (msg: string) => void = console.error
): number {
  let manifestPath = targetPath ?? "application.json";
  if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isDirectory()) {
    manifestPath = path.join(manifestPath, "application.json");
  }

  if (!fs.existsSync(manifestPath)) {
    err(`[ERROR] Manifest not found: ${manifestPath}`);
    return 1;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const tenant: Tenant | undefined = options?.tenantId
      ? {
          id: options.tenantId,
          name: options.tenantId,
          slug: options.tenantId,
          plan: options.tenantPlan ?? "FREE",
          status: "ACTIVE",
          concurrencyLimit: 5,
          rateLimitPerMinute: 60,
          tokenBudgetMonthly: 100000,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : undefined;

    const result = ApplicationFactoryEngine.runHarness(manifest, tenant, true);

    if (options?.json) {
      log(JSON.stringify(result, null, 2));
      return result.passed ? 0 : 1;
    }

    const checkList = Object.values(result.checks);
    const passedChecks = checkList.filter((c) => c.ok).length;

    log(`\nApplication Doctor Harness (${manifest.applicationId}):\n`);
    log(`  Harness passed: ${result.passed}`);
    log(`  Tests passed:   ${passedChecks} / ${checkList.length}`);
    log(`  Identity:       ${result.checks.identity.ok ? "[OK]" : "[FAIL]"} ${result.checks.identity.message}`);
    log(`  Authentication: ${result.checks.authentication.ok ? "[OK]" : "[FAIL]"} ${result.checks.authentication.message}`);
    log(`  Authorization:  ${result.checks.authorization.ok ? "[OK]" : "[FAIL]"} ${result.checks.authorization.message}`);
    log(`  Capabilities:   ${result.checks.capabilities.ok ? "[OK]" : "[FAIL]"} ${result.checks.capabilities.message}`);
    log(`  Health Check:   ${result.checks.health.ok ? "[OK]" : "[FAIL]"} ${result.checks.health.message}`);
    log(`  Version Check:  ${result.checks.version.ok ? "[OK]" : "[FAIL]"} ${result.checks.version.message}`);
    log(`  Observability:  ${result.checks.observability.ok ? "[OK]" : "[FAIL]"} ${result.checks.observability.message}`);
    log(`\nResult: ${result.passed ? "ALL CHECKS PASSED (Ready for Registration)" : "CHECKS FAILED"}\n`);

    return result.passed ? 0 : 1;
  } catch (error: any) {
    err(`[ERROR] Harness failed: ${error.message}`);
    return 1;
  }
}

function handleInitApplication(
  appId?: string,
  options: CreateAppOptions = {},
  log: (msg: string) => void = console.log,
  err: (msg: string) => void = console.error
): number {
  if (!appId || appId.trim().length === 0) {
    err("[ERROR] Missing required argument: <app-id>");
    err("Usage: npx create-aop-app init <app-id> [options]");
    return 1;
  }

  const normalizedId = appId.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
  const templateId = options.template ?? "generic-ai-app";
  const templates = ApplicationFactoryEngine.getFactoryTemplates();
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? templates[0]!;

  const capabilities =
    options.capabilities && options.capabilities.length > 0
      ? options.capabilities
      : selectedTemplate.recommendedCapabilities;

  const tenantPlan = options.tenantPlan ?? "FREE";
  const tenantId = options.tenantId ?? "tenant-default";

  const tenant: Tenant = {
    id: tenantId,
    name: tenantId,
    slug: tenantId,
    plan: tenantPlan,
    status: "ACTIVE",
    concurrencyLimit: 5,
    rateLimitPerMinute: 60,
    tokenBudgetMonthly: 100000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const input: GenerateApplicationInput = {
    applicationId: normalizedId,
    name: options.name ?? selectedTemplate.name,
    description: options.description ?? selectedTemplate.description,
    category: options.category ?? selectedTemplate.defaultCategory,
    tenantId,
    capabilities,
    runtime: options.runtime ?? selectedTemplate.defaultRuntime,
    environment: options.environment ?? "development",
    minimumPlatformVersion: options.minPlatformVersion ?? "1.4.0",
  };

  const result = ApplicationFactoryEngine.generateSkeleton(input, tenant);

  if (!result.validation.valid) {
    if (options.json) {
      log(JSON.stringify(result, null, 2));
    } else {
      err(`[FAIL] Generated manifest is invalid:`);
      for (const e of result.validation.errors) {
        err(`  - ${e}`);
      }
    }
    return 1;
  }

  if (!result.entitlement.entitled) {
    if (options.json) {
      log(JSON.stringify(result, null, 2));
    } else {
      err(`[FAIL] Entitlement validation failed for tenant plan ${tenantPlan}:`);
      for (const rej of result.entitlement.rejectedCapabilities) {
        err(`  - Capability '${rej.capabilityId}' rejected: ${rej.reason}`);
      }
    }
    return 1;
  }

  // Dry-run mode
  if (options.dryRun) {
    if (options.json) {
      log(JSON.stringify(result, null, 2));
    } else {
      log(`\n[DRY-RUN] Application Skeleton for '${normalizedId}' (${result.lifecycle}):\n`);
      log(`  Template:     ${templateId}`);
      log(`  Tenant:       ${tenantId} (${tenantPlan})`);
      log(`  Capabilities: ${result.manifest.capabilities.join(", ")}`);
      log(`  Files to generate:`);
      for (const file of result.files) {
        log(`    + ${file.path} (${file.content.length} bytes)`);
      }
      log(`\nDry run completed successfully. Zero files written.\n`);
    }
    return 0;
  }

  // Output directory resolution
  const targetDir = path.resolve(process.cwd(), options.outputDir ?? normalizedId);

  if (fs.existsSync(targetDir) && !options.force) {
    const existing = fs.readdirSync(targetDir);
    if (existing.length > 0) {
      err(`[ERROR] Target directory is not empty: ${targetDir}`);
      err("Use --force to overwrite existing files.");
      return 1;
    }
  }

  // Write files
  for (const file of result.files) {
    const fullPath = path.join(targetDir, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content, "utf8");
  }

  if (options.json) {
    log(
      JSON.stringify(
        {
          success: true,
          applicationId: normalizedId,
          targetDirectory: targetDir,
          generatedFilesCount: result.files.length,
          manifest: result.manifest,
        },
        null,
        2
      )
    );
    return 0;
  }

  log(`\n[SUCCESS] Scaffolding completed successfully for '${normalizedId}' at:`);
  log(`  ${targetDir}\n`);
  log(`Summary:`);
  log(`  * Template:     ${templateId}`);
  log(`  * Plan Tier:    ${tenantPlan}`);
  log(`  * Capabilities: ${result.manifest.capabilities.join(", ")}`);
  log(`  * Files:        ${result.files.length} generated\n`);
  log(`Next Steps:`);
  log(`  1. cd ${options.outputDir ?? normalizedId}`);
  log(`  2. npm install @ai-platform/client`);
  log(`  3. npx create-aop-app doctor application.json`);
  log(`  4. npm test\n`);

  return 0;
}

// Direct invocation via CLI (only when executed directly, not imported in tests)
const isDirectCliExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("create-aop-app.js") || process.argv[1].endsWith("create-aop-app.ts")) &&
  !process.env.NODE_TEST_CONTEXT &&
  !process.argv.some((arg) => arg.includes("test"));

if (isDirectCliExecution) {
  runCreateAopAppCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
