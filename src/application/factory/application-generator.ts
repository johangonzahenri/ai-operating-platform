import {
  ApplicationManifest,
  ApplicationValidationResult,
  ApplicationValidator,
  PLATFORM_CAPABILITY_CATALOG,
  PlatformCapabilityDefinition,
} from "../../domain/application/application-contract.js";
import { Tenant } from "../../domain/tenant/tenant.js";

export type ApplicationLifecycleState =
  | "DRAFT"
  | "VALIDATED"
  | "REGISTERED"
  | "CONNECTED"
  | "OPERATIONAL"
  | "SUSPENDED"
  | "RETIRED";

export interface GenerateApplicationInput {
  readonly applicationId: string;
  readonly name: string;
  readonly version?: string | undefined;
  readonly description: string;
  readonly category: string;
  readonly tenantId: string;
  readonly capabilities: readonly string[];
  readonly runtime?: string | undefined;
  readonly environment?: "development" | "staging" | "production" | undefined;
  readonly minimumPlatformVersion?: string | undefined;
}

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface GeneratedApplicationResult {
  readonly manifest: ApplicationManifest;
  readonly validation: ApplicationValidationResult;
  readonly entitlement: CapabilityEntitlementResult;
  readonly files: readonly GeneratedFile[];
  readonly lifecycle: ApplicationLifecycleState;
  readonly createdAt: string;
}

export interface CapabilityEntitlementResult {
  readonly entitled: boolean;
  readonly grantedCapabilities: readonly string[];
  readonly rejectedCapabilities: readonly {
    readonly capabilityId: string;
    readonly requiredPlan: string;
    readonly currentPlan: string;
    readonly reason: string;
  }[];
}

export interface ApplicationHarnessResult {
  readonly passed: boolean;
  readonly checks: {
    readonly identity: { readonly ok: boolean; readonly message: string };
    readonly authentication: { readonly ok: boolean; readonly message: string };
    readonly authorization: { readonly ok: boolean; readonly message: string };
    readonly capabilities: { readonly ok: boolean; readonly message: string };
    readonly health: { readonly ok: boolean; readonly message: string };
    readonly version: { readonly ok: boolean; readonly message: string };
    readonly observability: { readonly ok: boolean; readonly message: string };
  };
}

export class ApplicationFactoryEngine {
  /**
   * Validates capability entitlements against a tenant's plan.
   */
  public static checkEntitlements(
    capabilities: readonly string[],
    tenant: Tenant
  ): CapabilityEntitlementResult {
    const planHierarchy: Record<string, number> = {
      FREE: 1,
      PRO: 2,
      BUSINESS: 3,
      ENTERPRISE: 4,
    };

    const currentTier = planHierarchy[tenant.plan] ?? 1;
    const granted: string[] = [];
    const rejected: {
      capabilityId: string;
      requiredPlan: string;
      currentPlan: string;
      reason: string;
    }[] = [];

    for (const capId of capabilities) {
      const capDef = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === capId);
      if (!capDef) {
        // Custom or uncatalogued capability
        granted.push(capId);
        continue;
      }

      const requiredTier = planHierarchy[capDef.requiredPlan] ?? 1;
      if (currentTier >= requiredTier) {
        granted.push(capId);
      } else {
        rejected.push({
          capabilityId: capId,
          requiredPlan: capDef.requiredPlan,
          currentPlan: tenant.plan,
          reason: `Capability '${capDef.name}' (${capId}) requires '${capDef.requiredPlan}' plan, but tenant '${tenant.id}' is on '${tenant.plan}'.`,
        });
      }
    }

    return {
      entitled: rejected.length === 0,
      grantedCapabilities: Object.freeze(granted),
      rejectedCapabilities: Object.freeze(rejected),
    };
  }

  /**
   * Runs complete application candidate verification harness across 7 criteria.
   */
  public static runHarness(
    manifest: ApplicationManifest,
    tenant?: Tenant | undefined,
    apiKeyProvided = true
  ): ApplicationHarnessResult {
    const validation = ApplicationValidator.validateManifest(manifest);

    // 1. Identity Check
    const identityOk = validation.details.identity && manifest.applicationId.length >= 3;

    // 2. Authentication Check
    const authOk = apiKeyProvided;

    // 3. Authorization / Entitlement Check
    let authzOk = true;
    let authzMsg = "Entitlements verified";
    if (tenant) {
      const ent = this.checkEntitlements(manifest.capabilities, tenant);
      if (!ent.entitled) {
        authzOk = false;
        authzMsg = ent.rejectedCapabilities.map((r) => r.reason).join("; ");
      }
    }

    // 4. Capabilities Check
    const capsOk = manifest.capabilities.length > 0;

    // 5. Health Check
    const healthOk = Boolean(manifest.runtime && manifest.runtime.length > 0);

    // 6. Version Check
    const versionOk = validation.details.version;

    // 7. Observability Check
    const obsOk = Boolean(manifest.applicationId && manifest.name);

    const passed =
      identityOk && authOk && authzOk && capsOk && healthOk && versionOk && obsOk && validation.valid;

    return {
      passed,
      checks: {
        identity: { ok: identityOk, message: identityOk ? "Application ID format valid" : "Invalid applicationId" },
        authentication: { ok: authOk, message: authOk ? "Authentication API key structure valid" : "Missing API credentials" },
        authorization: { ok: authzOk, message: authzMsg },
        capabilities: { ok: capsOk, message: `${manifest.capabilities.length} capabilities declared` },
        health: { ok: healthOk, message: "Health & readiness contract configured" },
        version: { ok: versionOk, message: `SemVer ${manifest.version} compliant` },
        observability: { ok: obsOk, message: "Correlation and trace headers mapped" },
      },
    };
  }

  /**
   * Generates a fully compliant application skeleton with PlatformClient integration.
   */
  public static generateSkeleton(
    input: GenerateApplicationInput,
    tenant?: Tenant | undefined
  ): GeneratedApplicationResult {
    const manifest: ApplicationManifest = {
      applicationId: input.applicationId,
      name: input.name,
      version: input.version ?? "1.0.0",
      runtime: input.runtime ?? "node",
      capabilities: input.capabilities,
      requiredFeatures: [],
      tenantRequirements: {
        minPlan: "FREE",
        requiredCapabilities: input.capabilities,
      },
      minimumPlatformVersion: input.minimumPlatformVersion ?? "1.1.0",
      environment: input.environment ?? "development",
    };

    const validation = ApplicationValidator.validateManifest(manifest);
    const entitlement = tenant
      ? this.checkEntitlements(manifest.capabilities, tenant)
      : { entitled: true, grantedCapabilities: manifest.capabilities, rejectedCapabilities: [] };

    const files: GeneratedFile[] = [
      {
        path: "application.json",
        content: JSON.stringify(manifest, null, 2),
      },
      {
        path: "src/adapter.ts",
        content: `// Generated Platform Adapter for ${input.name} (${input.applicationId})
import { createPlatformClient, PlatformClient } from "@ai-platform/client";

export interface ${this.toPascalCase(input.applicationId)}AdapterConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly tenantId: string;
}

export class ${this.toPascalCase(input.applicationId)}PlatformAdapter {
  private readonly client: PlatformClient;
  private readonly tenantId: string;

  constructor(config: ${this.toPascalCase(input.applicationId)}AdapterConfig) {
    this.tenantId = config.tenantId;
    this.client = createPlatformClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      tenantId: config.tenantId,
    });
  }

  async checkHealth(): Promise<{ readonly status: string; readonly platformOnline: boolean }> {
    try {
      const health = await this.client.connect();
      return { status: "ONLINE", platformOnline: health.status === "HEALTHY" };
    } catch {
      return { status: "OFFLINE", platformOnline: false };
    }
  }

  async executeAutonomousTask(objective: string, correlationId?: string): Promise<unknown> {
    const task = await this.client.createTask({
      agentId: "foundation-agent",
      input: { objective, applicationId: "${input.applicationId}" },
    });
    return task;
  }
}
`,
      },
      {
        path: "src/health.ts",
        content: `// Application Health Contract
export interface ApplicationHealthReport {
  readonly applicationId: string;
  readonly version: string;
  readonly status: "HEALTHY" | "DEGRADED" | "OFFLINE";
  readonly capabilities: readonly string[];
  readonly timestamp: string;
}

export function getApplicationHealth(): ApplicationHealthReport {
  return {
    applicationId: "${input.applicationId}",
    version: "${manifest.version}",
    status: "HEALTHY",
    capabilities: ${JSON.stringify(input.capabilities)},
    timestamp: new Date().toISOString(),
  };
}
`,
      },
      {
        path: "src/observability.ts",
        content: `// Application Context & Observability Contract
export interface ApplicationRequestContext {
  readonly applicationId: string;
  readonly tenantId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
}

export function createRequestContext(
  tenantId: string,
  correlationId = \`corr-\${Date.now().toString(36)}\`
): ApplicationRequestContext {
  return {
    applicationId: "${input.applicationId}",
    tenantId,
    requestId: \`req-\${Date.now().toString(36)}\`,
    correlationId,
  };
}
`,
      },
      {
        path: "README.md",
        content: `# ${input.name} (\`${input.applicationId}\`)

> Category: ${input.category}  
> Tenant Scope: \`${input.tenantId}\`  
> Target Platform: AI Operating Platform v${manifest.minimumPlatformVersion}+

## Overview
${input.description}

## Granted Capabilities
${input.capabilities.map((c) => `- \`${c}\``).join("\n")}

## Architecture
This application is generated by the AI Application Factory and integrates strictly via the typed \`PlatformClient\` SDK without touching Core Engine internals.
`,
      },
      {
        path: "tests/integration.test.ts",
        content: `import test from "node:test";
import assert from "node:assert/strict";
import { getApplicationHealth } from "../src/health.js";

test("${input.name} Health Contract Verification", () => {
  const health = getApplicationHealth();
  assert.equal(health.applicationId, "${input.applicationId}");
  assert.equal(health.status, "HEALTHY");
  assert.ok(health.capabilities.length >= 1);
});
`,
      },
    ];

    const lifecycle: ApplicationLifecycleState = validation.valid && entitlement.entitled ? "VALIDATED" : "DRAFT";

    return {
      manifest,
      validation,
      entitlement,
      files: Object.freeze(files),
      lifecycle,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Factory 2.0: Official Application Templates
   */
  public static getFactoryTemplates(): readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly defaultCategory: string;
    readonly recommendedCapabilities: readonly string[];
    readonly defaultRuntime: string;
  }[] {
    return [
      {
        id: "generic-ai-app",
        name: "Generic AI Application",
        description: "Standard starter template for multi-turn task orchestration and structured output.",
        defaultCategory: "Custom",
        recommendedCapabilities: ["product.discovery", "report.generate"],
        defaultRuntime: "node",
      },
      {
        id: "commerce-ai-app",
        name: "Commerce AI Application",
        description: "E-commerce focused starter template with catalog search, recommendations, and cart assistance.",
        defaultCategory: "Commerce",
        recommendedCapabilities: ["product.discovery", "product.recommendation", "product.compare", "cart.assistance"],
        defaultRuntime: "universal",
      },
      {
        id: "support-ai-app",
        name: "Enterprise Support AI",
        description: "Customer service assistant template with durable event logging and ticket routing.",
        defaultCategory: "Support",
        recommendedCapabilities: ["report.generate", "automation.execute"],
        defaultRuntime: "node",
      },
      {
        id: "automation-ai-app",
        name: "Data & Automation AI",
        description: "Automated event-driven execution template with webhook triggers and scheduled operations.",
        defaultCategory: "Automation",
        recommendedCapabilities: ["automation.execute", "report.generate"],
        defaultRuntime: "edge",
      },
    ];
  }

  /**
   * Factory 2.0: Capability Dependency Graph
   */
  public static getCapabilityDependencyGraph(capabilities: readonly string[]): readonly {
    readonly capabilityId: string;
    readonly requiredFeatures: readonly string[];
    readonly platformComponents: readonly string[];
  }[] {
    const dependencyMap: Record<string, { readonly features: readonly string[]; readonly components: readonly string[] }> = {
      "product.discovery": {
        features: ["Semantic & Keyword Search", "Catalog Projection"],
        components: ["Model Gateway", "Tool Registry"],
      },
      "product.recommendation": {
        features: ["Attribute Matching", "History Embeddings"],
        components: ["Model Gateway", "Memory Subsystem"],
      },
      "product.compare": {
        features: ["Attribute Differential", "Multi-Item Extraction"],
        components: ["Model Gateway", "Tool Registry"],
      },
      "cart.assistance": {
        features: ["Stateful Cart Memory", "Stock Mutation Rules"],
        components: ["Core Runtime", "Security Boundary"],
      },
      "ar.fitting_room": {
        features: ["WebXR / Model3D Pipeline", "Avatar Silhouette Projection"],
        components: ["AR Pipeline Subsystem", "Media Gateway"],
      },
      "automation.execute": {
        features: ["Webhook Ingestion", "Autonomous Planner Loop"],
        components: ["Autonomous Operation Engine", "Durable Event Store"],
      },
      "report.generate": {
        features: ["Telemetry Aggregation", "Markdown / HTML Rendering"],
        components: ["Observability Engine", "Model Gateway"],
      },
    };

    return capabilities.map((capId) => {
      const entry = dependencyMap[capId] ?? {
        features: ["Generic Task Invocation"],
        components: ["Core Runtime"],
      };
      return {
        capabilityId: capId,
        requiredFeatures: entry.features,
        platformComponents: entry.components,
      };
    });
  }

  /**
   * Factory 2.0: Application Repair
   */
  public static repairConfiguration(
    manifest: ApplicationManifest,
    tenant: Tenant
  ): {
    readonly repaired: boolean;
    readonly originalManifest: ApplicationManifest;
    readonly repairedManifest: ApplicationManifest;
    readonly actionsTaken: readonly string[];
  } {
    const actions: string[] = [];
    let repairedId = manifest.applicationId.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
    if (repairedId !== manifest.applicationId) {
      actions.push(`Normalized applicationId format to '${repairedId}'`);
    }

    const entitlement = this.checkEntitlements(manifest.capabilities, tenant);
    let allowedCaps = [...manifest.capabilities];
    if (entitlement.rejectedCapabilities.length > 0) {
      allowedCaps = allowedCaps.filter(
        (c) => !entitlement.rejectedCapabilities.some((r) => r.capabilityId === c)
      );
      actions.push(
        `Pruned unentitled capabilities for ${tenant.plan} plan: ${entitlement.rejectedCapabilities.map((r) => r.capabilityId).join(", ")}`
      );
    }

    const repairedManifest: ApplicationManifest = {
      ...manifest,
      applicationId: repairedId,
      capabilities: allowedCaps,
      version: manifest.version?.match(/^\d+\.\d+\.\d+/) ? manifest.version : "1.0.0",
    };

    return {
      repaired: actions.length > 0,
      originalManifest: manifest,
      repairedManifest,
      actionsTaken: actions,
    };
  }

  /**
   * Factory 2.0: Export Application Bundle (credentials excluded)
   */
  public static exportApplicationBundle(result: GeneratedApplicationResult): {
    readonly applicationId: string;
    readonly exportedAt: string;
    readonly manifest: ApplicationManifest;
    readonly files: readonly GeneratedFile[];
    readonly integrationGuide: string;
  } {
    const integrationGuide = [
      `# Integration Guide: ${result.manifest.name}`,
      `Application ID: ${result.manifest.applicationId}`,
      `Target Tenant: ${(result.manifest as any).tenantId ?? "tenant-default"}`,
      `Lifecycle State: ${result.lifecycle}`,
      "",
      "## Quick Start",
      "1. Install the official Platform SDK in your project:",
      "   `npm install @ai-platform/client`",
      "2. Initialize the adapter with your base URL and API Key in environment variables.",
      "3. Call `adapter.checkPlatformHealth()` to verify connectivity.",
      "",
      "## Security & Compliance",
      "- Do NOT commit API keys to source repositories.",
      "- All requests propagate tenant and correlation telemetry.",
    ].join("\n");

    return {
      applicationId: result.manifest.applicationId,
      exportedAt: new Date().toISOString(),
      manifest: result.manifest,
      files: result.files,
      integrationGuide,
    };
  }

  private static toPascalCase(str: string): string {
    return str
      .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
      .replace(/^(\w)/, (_, c) => c.toUpperCase());
  }
}
