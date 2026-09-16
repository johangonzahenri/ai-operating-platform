import { ExternalApplication } from "../../domain/application/external-application.js";
import { Tenant } from "../../domain/tenant/tenant.js";

export interface ApplicationManifest {
  readonly applicationId: string;
  readonly name: string;
  readonly version: string;
  readonly runtime: string;
  readonly capabilities: readonly string[];
  readonly requiredFeatures: readonly string[];
  readonly tenantRequirements?: {
    readonly minPlan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
    readonly requiredCapabilities?: readonly string[];
  };
  readonly minimumPlatformVersion: string;
  readonly maximumTestedPlatformVersion?: string;
  readonly environment?: "development" | "staging" | "production";
}

export interface ApplicationValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly details: {
    readonly identity: boolean;
    readonly authentication: boolean;
    readonly authorization: boolean;
    readonly capabilities: boolean;
    readonly health: boolean;
    readonly version: boolean;
    readonly observability: boolean;
  };
}

export interface PlatformCapabilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: "COMMERCE" | "AR_3D" | "AUTOMATION" | "CORE" | "INTELLIGENCE";
  readonly description: string;
  readonly riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly requiredPlan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  readonly endpoints: readonly string[];
}

export const PLATFORM_CAPABILITY_CATALOG: readonly PlatformCapabilityDefinition[] = Object.freeze([
  {
    id: "product.discovery",
    name: "AI Product Discovery",
    category: "COMMERCE",
    description: "Semantic search and contextual catalog discovery using LLM intent extraction.",
    riskTier: "LOW",
    requiredPlan: "FREE",
    endpoints: ["POST /api/v1/tasks", "POST /api/v1/orchestrate"],
  },
  {
    id: "product.recommendation",
    name: "Personalized Recommendation",
    category: "COMMERCE",
    description: "Generates tailored item pairings, styles, and compatible accessories based on context.",
    riskTier: "LOW",
    requiredPlan: "FREE",
    endpoints: ["POST /api/v1/tasks", "POST /api/v1/orchestrate"],
  },
  {
    id: "product.compare",
    name: "Product Comparison & Matrix",
    category: "COMMERCE",
    description: "Multivariate technical attribute comparison and tradeoff analysis.",
    riskTier: "LOW",
    requiredPlan: "FREE",
    endpoints: ["POST /api/v1/tasks"],
  },
  {
    id: "cart.assistance",
    name: "Cart & Checkout Assistance",
    category: "COMMERCE",
    description: "Multi-step cart validation, inventory sizing adjustment, and checkout preparation.",
    riskTier: "MEDIUM",
    requiredPlan: "FREE",
    endpoints: ["POST /api/v1/tasks"],
  },
  {
    id: "ar.fitting_room",
    name: "Virtual 3D / AR Fitting Room",
    category: "AR_3D",
    description: "Interactive virtual try-on, dimensional analysis, and 3D asset spatial projection.",
    riskTier: "MEDIUM",
    requiredPlan: "PRO",
    endpoints: ["POST /api/v1/tasks", "GET /api/v1/tools"],
  },
  {
    id: "automation.execute",
    name: "Autonomous Workflow & Webhooks",
    category: "AUTOMATION",
    description: "Trigger durable multi-step workflows, webhooks, and asynchronous background reconciliations.",
    riskTier: "HIGH",
    requiredPlan: "PRO",
    endpoints: ["POST /api/v1/operations", "POST /api/v1/tasks"],
  },
  {
    id: "report.generate",
    name: "Executive & Operational Reporting",
    category: "CORE",
    description: "Aggregated telemetry, usage statistics, and compliance reporting.",
    riskTier: "LOW",
    requiredPlan: "BUSINESS",
    endpoints: ["GET /api/v1/metrics", "GET /api/v1/events"],
  },
  {
    id: "device.print",
    name: "Business Device Printing",
    category: "AUTOMATION",
    description: "Governed dispatch of printable documents, orders, packing slips, and receipts to hardware devices.",
    riskTier: "MEDIUM",
    requiredPlan: "PRO",
    endpoints: ["POST /api/v1/devices/:id/print-jobs", "GET /api/v1/devices/:id/print-jobs"],
  },
  {
    id: "device.manage",
    name: "Business Device Management & Probes",
    category: "CORE",
    description: "Discover, inspect, probe health, and configure operational business hardware devices.",
    riskTier: "LOW",
    requiredPlan: "PRO",
    endpoints: ["GET /api/v1/devices", "GET /api/v1/devices/:id/health", "GET /api/v1/devices/:id/capabilities"],
  },
]);

export class ApplicationValidator {
  public static validateManifest(manifest: unknown): ApplicationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details = {
      identity: false,
      authentication: true,
      authorization: true,
      capabilities: false,
      health: true,
      version: false,
      observability: true,
    };

    if (!manifest || typeof manifest !== "object") {
      return {
        valid: false,
        errors: ["Manifest must be a non-null object"],
        warnings: [],
        details,
      };
    }

    const m = manifest as Record<string, unknown>;

    // 1. Identity validation
    if (typeof m.applicationId === "string" && /^[a-z0-9_-]{3,64}$/.test(m.applicationId)) {
      details.identity = true;
    } else {
      errors.push("applicationId is required and must be alphanumeric with dashes/underscores (3-64 chars)");
    }

    if (typeof m.name !== "string" || !m.name.trim()) {
      errors.push("name is required and must be a non-empty string");
    }

    // 2. Version validation
    if (typeof m.version === "string" && /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(m.version)) {
      details.version = true;
    } else {
      errors.push("version is required and must follow SemVer format (e.g., 1.0.0)");
    }

    if (typeof m.minimumPlatformVersion !== "string" || !m.minimumPlatformVersion.trim()) {
      errors.push("minimumPlatformVersion is required (e.g., 1.0.0)");
    }

    // 3. Capabilities validation
    if (Array.isArray(m.capabilities) && m.capabilities.length > 0) {
      const validCatalogIds = new Set(PLATFORM_CAPABILITY_CATALOG.map((c) => c.id));
      const unknownCaps = m.capabilities.filter((c) => typeof c !== "string" || !validCatalogIds.has(c));
      if (unknownCaps.length > 0) {
        warnings.push(`Contains custom or uncataloged capabilities: ${unknownCaps.join(", ")}`);
      }
      details.capabilities = true;
    } else {
      errors.push("capabilities must be a non-empty array of string capabilities");
    }

    // 4. Runtime validation
    if (typeof m.runtime !== "string" || !m.runtime.trim()) {
      errors.push("runtime is required (e.g., node, python, docker, serverless)");
    }

    // 5. Security checks (ensure no leaked secrets in manifest)
    const rawString = JSON.stringify(manifest).toLowerCase();
    const sensitiveWords = ["password", "secret", "private_key", "bearer ", "sk-", "ghp_"];
    for (const word of sensitiveWords) {
      if (rawString.includes(word)) {
        errors.push(`Manifest contains prohibited sensitive credential keyword: '${word}'`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }

  public static isCompatible(
    manifest: ApplicationManifest,
    platformVersion: string
  ): { compatible: boolean; reason?: string } {
    const semverToNum = (v: string) => {
      const base = v.split("-")[0] ?? "0";
      const parts = base.split(".").map(Number);
      const major = parts[0] ?? 0;
      const minor = parts[1] ?? 0;
      const patch = parts[2] ?? 0;
      return major * 10000 + minor * 100 + patch;
    };


    const platNum = semverToNum(platformVersion);
    const minNum = semverToNum(manifest.minimumPlatformVersion);

    if (platNum < minNum) {
      return {
        compatible: false,
        reason: `Platform version ${platformVersion} is lower than application minimum required version ${manifest.minimumPlatformVersion}`,
      };
    }

    if (manifest.maximumTestedPlatformVersion) {
      const maxNum = semverToNum(manifest.maximumTestedPlatformVersion);
      if (platNum > maxNum) {
        return {
          compatible: true,
          reason: `Warning: Platform version ${platformVersion} is higher than maximum tested version ${manifest.maximumTestedPlatformVersion}`,
        };
      }
    }

    return { compatible: true };
  }
}
