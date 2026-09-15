export type ApplicationTrustLevel =
  | "UNVERIFIED"
  | "VALIDATED"
  | "VERIFIED"
  | "TRUSTED"
  | "SUSPENDED";

export type ApplicationDeploymentReadiness =
  | "Development"
  | "Staging"
  | "Production";

export type EcosystemCategory =
  | "Commerce"
  | "Automotive"
  | "Support"
  | "Automation"
  | "Analytics"
  | "Custom";

export interface ApplicationTrustMetadata {
  readonly owner: string;
  readonly maintainer: string;
  readonly trustLevel: ApplicationTrustLevel;
  readonly verificationStatus: "PENDING" | "PASSED" | "FAILED";
  readonly deploymentReadiness: ApplicationDeploymentReadiness;
  readonly category: EcosystemCategory;
  readonly verifiedAt?: string | undefined;
}

export interface ApplicationCompatibilityCheck {
  readonly isCompatible: boolean;
  readonly status: "Compatible" | "Partially Compatible" | "Incompatible";
  readonly platformVersion: string;
  readonly supportedCapabilities: readonly string[];
  readonly missingCapabilities: readonly string[];
  readonly runtimeSupported: boolean;
}

export class ApplicationTrustEngine {
  public static evaluateTrust(options: {
    readonly hasValidManifest: boolean;
    readonly passesHarness: boolean;
    readonly securityCompliant: boolean;
    readonly isSuspended?: boolean | undefined;
  }): ApplicationTrustLevel {
    if (options.isSuspended) return "SUSPENDED";
    if (options.passesHarness && options.securityCompliant) return "TRUSTED";
    if (options.hasValidManifest && options.passesHarness) return "VERIFIED";
    if (options.hasValidManifest) return "VALIDATED";
    return "UNVERIFIED";
  }

  public static checkCompatibility(
    requestedCapabilities: readonly string[],
    platformCapabilities: readonly string[],
    runtime: string,
    platformVersion = "1.1.0"
  ): ApplicationCompatibilityCheck {
    const supported: string[] = [];
    const missing: string[] = [];

    for (const cap of requestedCapabilities) {
      if (platformCapabilities.includes(cap) || cap.startsWith("custom.")) {
        supported.push(cap);
      } else {
        missing.push(cap);
      }
    }

    const runtimeSupported = ["node", "browser", "edge", "universal"].includes(runtime.toLowerCase());
    const isCompatible = missing.length === 0 && runtimeSupported;
    const status = isCompatible
      ? "Compatible"
      : supported.length > 0
      ? "Partially Compatible"
      : "Incompatible";

    return {
      isCompatible,
      status,
      platformVersion,
      supportedCapabilities: supported,
      missingCapabilities: missing,
      runtimeSupported,
    };
  }
}
