/**
 * AI Operating Platform - AI Solutions Factory Solution Blueprint
 * 
 * Declarative specification of what and how components are composed
 * within an AI Solution, without duplicating runtime entities.
 * 
 * Blueprint != Execution
 * Template != Deployment
 */

export interface BlueprintWorkflowRequirement {
  readonly workflowDefinitionId: string;
  readonly requiredVersion?: number;
  readonly role?: string;
  readonly optional?: boolean;
}

export interface BlueprintAgentRequirement {
  readonly agentId: string;
  readonly requiredProfileVersion?: number;
  readonly requiredRole?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly optional?: boolean;
}

export interface BlueprintCapabilityRequirement {
  readonly capabilityId: string;
  readonly minLevel?: number;
  readonly description?: string;
  readonly optional?: boolean;
}

export interface BlueprintPolicyRequirement {
  readonly policyId: string;
  readonly ruleName?: string;
  readonly enforcementLevel?: "STRICT" | "WARNING";
}

export interface BlueprintVerificationRequirement {
  readonly stepIdOrRule: string;
  readonly requiredVerdict: "PASS";
  readonly verifierType?: string;
}

export interface BlueprintApprovalRequirement {
  readonly actionOrStep: string;
  readonly requiredRole: string;
  readonly minApprovals?: number;
}

export interface BlueprintAdapterRequirement {
  readonly adapterId: string;
  readonly type: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface BlueprintObservabilityRequirement {
  readonly metricsEnabled: boolean;
  readonly traceLevel?: "NONE" | "BASIC" | "DETAILED" | "DEBUG";
  readonly exportAuditLogs?: boolean;
}

export interface SolutionBlueprintProps {
  readonly workflows?: readonly BlueprintWorkflowRequirement[];
  readonly requiredAgents?: readonly BlueprintAgentRequirement[];
  readonly requiredCapabilities?: readonly BlueprintCapabilityRequirement[];
  readonly requiredPolicies?: readonly BlueprintPolicyRequirement[];
  readonly verificationRequirements?: readonly BlueprintVerificationRequirement[];
  readonly approvalRequirements?: readonly BlueprintApprovalRequirement[];
  readonly externalAdapters?: readonly BlueprintAdapterRequirement[];
  readonly observabilityRequirements?: BlueprintObservabilityRequirement;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class SolutionBlueprint {
  readonly workflows: readonly BlueprintWorkflowRequirement[];
  readonly requiredAgents: readonly BlueprintAgentRequirement[];
  readonly requiredCapabilities: readonly BlueprintCapabilityRequirement[];
  readonly requiredPolicies: readonly BlueprintPolicyRequirement[];
  readonly verificationRequirements: readonly BlueprintVerificationRequirement[];
  readonly approvalRequirements: readonly BlueprintApprovalRequirement[];
  readonly externalAdapters: readonly BlueprintAdapterRequirement[];
  readonly observabilityRequirements: BlueprintObservabilityRequirement;
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(props: SolutionBlueprintProps = {}) {
    this.workflows = Object.freeze(props.workflows ? [...props.workflows] : []);
    this.requiredAgents = Object.freeze(props.requiredAgents ? [...props.requiredAgents] : []);
    this.requiredCapabilities = Object.freeze(
      props.requiredCapabilities ? [...props.requiredCapabilities] : []
    );
    this.requiredPolicies = Object.freeze(
      props.requiredPolicies ? [...props.requiredPolicies] : []
    );
    this.verificationRequirements = Object.freeze(
      props.verificationRequirements ? [...props.verificationRequirements] : []
    );
    this.approvalRequirements = Object.freeze(
      props.approvalRequirements ? [...props.approvalRequirements] : []
    );
    this.externalAdapters = Object.freeze(
      props.externalAdapters ? [...props.externalAdapters] : []
    );
    this.observabilityRequirements = Object.freeze(
      props.observabilityRequirements ?? { metricsEnabled: true, traceLevel: "DETAILED", exportAuditLogs: true }
    );
    this.metadata = Object.freeze(props.metadata ? { ...props.metadata } : {});
    Object.freeze(this);
  }

  public toJSON(): Record<string, unknown> {
    return {
      workflows: this.workflows,
      requiredAgents: this.requiredAgents,
      requiredCapabilities: this.requiredCapabilities,
      requiredPolicies: this.requiredPolicies,
      verificationRequirements: this.verificationRequirements,
      approvalRequirements: this.approvalRequirements,
      externalAdapters: this.externalAdapters,
      observabilityRequirements: this.observabilityRequirements,
      metadata: this.metadata,
    };
  }

  public static fromJSON(json: unknown): SolutionBlueprint {
    if (!json || typeof json !== "object") {
      return new SolutionBlueprint();
    }
    const data = json as Record<string, unknown>;
    return new SolutionBlueprint({
      workflows: data.workflows as any,
      requiredAgents: data.requiredAgents as any,
      requiredCapabilities: data.requiredCapabilities as any,
      requiredPolicies: data.requiredPolicies as any,
      verificationRequirements: data.verificationRequirements as any,
      approvalRequirements: data.approvalRequirements as any,
      externalAdapters: data.externalAdapters as any,
      observabilityRequirements: data.observabilityRequirements as any,
      metadata: data.metadata as any,
    });
  }
}

export interface SolutionBlueprintValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly validatedAt: Date;
  readonly checkedComponents: {
    readonly workflowsCount: number;
    readonly agentsCount: number;
    readonly capabilitiesCount: number;
    readonly policiesCount: number;
    readonly verificationsCount: number;
    readonly approvalsCount: number;
  };
}
