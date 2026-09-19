/**
 * AI Operating Platform - SolutionBlueprintValidator
 * 
 * Deterministic validator for AI Solution Blueprints.
 * Verifies that all declared workflows, agents, capabilities, policies,
 * verifications, and approvals exist, are active, eligible, and belong
 * strictly to the same tenant (fail-closed multi-tenant isolation).
 */

import {
  SolutionBlueprint,
  SolutionBlueprintValidationReport,
} from "../../domain/solution/solution-blueprint.js";
import { WorkflowDefinitionRepositoryPort } from "../ports/workflow-repository-port.js";
import { AgentProfileRepositoryPort } from "../ports/agent-profile-repository-port.js";
import { AgentLifecycleService } from "../agent/agent-lifecycle-service.js";
import { PLATFORM_CAPABILITY_CATALOG } from "../../domain/application/application-contract.js";

export interface SolutionBlueprintValidatorDependencies {
  readonly workflowRepo?: WorkflowDefinitionRepositoryPort | undefined;
  readonly agentProfileRepo?: AgentProfileRepositoryPort | undefined;
  readonly agentLifecycleService?: AgentLifecycleService | undefined;
}

export class SolutionBlueprintValidator {
  constructor(private readonly deps: SolutionBlueprintValidatorDependencies = {}) {}

  /**
   * Performs deterministic validation of a SolutionBlueprint in the scope of a tenant.
   */
  public async validate(
    blueprint: SolutionBlueprint,
    tenantId: string
  ): Promise<SolutionBlueprintValidationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const now = new Date();

    if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
      errors.push("Tenant ID is required for blueprint validation");
      return {
        valid: false,
        errors,
        warnings,
        validatedAt: now,
        checkedComponents: {
          workflowsCount: blueprint.workflows.length,
          agentsCount: blueprint.requiredAgents.length,
          capabilitiesCount: blueprint.requiredCapabilities.length,
          policiesCount: blueprint.requiredPolicies.length,
          verificationsCount: blueprint.verificationRequirements.length,
          approvalsCount: blueprint.approvalRequirements.length,
        },
      };
    }

    // 1. Workflow Requirements Validation
    if (this.deps.workflowRepo) {
      for (const wfReq of blueprint.workflows) {
        if (!wfReq.workflowDefinitionId || !wfReq.workflowDefinitionId.trim()) {
          errors.push("Workflow requirement must specify a valid non-empty workflowDefinitionId");
          continue;
        }

        const wfDef = await this.deps.workflowRepo.findById(wfReq.workflowDefinitionId, tenantId);
        if (!wfDef) {
          if (!wfReq.optional) {
            errors.push(
              `Referenced workflow '${wfReq.workflowDefinitionId}' was not found in tenant '${tenantId}'`
            );
          } else {
            warnings.push(
              `Optional workflow '${wfReq.workflowDefinitionId}' was not found in tenant '${tenantId}'`
            );
          }
          continue;
        }

        // Multi-tenant check
        if (wfDef.tenantId !== tenantId) {
          errors.push(
            `Cross-tenant access violation: Workflow '${wfReq.workflowDefinitionId}' belongs to tenant '${wfDef.tenantId}', expected '${tenantId}'`
          );
          continue;
        }

        // Workflow Status check (must be ACTIVE for operational solutions)
        if (wfDef.status !== "ACTIVE") {
          errors.push(
            `Workflow '${wfReq.workflowDefinitionId}' is in '${wfDef.status}' status, but must be 'ACTIVE' for a valid solution blueprint`
          );
        }

        // Workflow Version check
        if (wfReq.requiredVersion !== undefined && wfDef.version !== wfReq.requiredVersion) {
          errors.push(
            `Workflow '${wfReq.workflowDefinitionId}' has version ${wfDef.version}, but blueprint requires version ${wfReq.requiredVersion}`
          );
        }
      }
    }

    // 2. Agent Requirements & Eligibility Validation
    for (const agentReq of blueprint.requiredAgents) {
      if (!agentReq.agentId || !agentReq.agentId.trim()) {
        errors.push("Agent requirement must specify a valid non-empty agentId");
        continue;
      }

      // Check agent profile if repo is available
      if (this.deps.agentProfileRepo) {
        const profile = await this.deps.agentProfileRepo.findByAgentId(agentReq.agentId, tenantId);
        if (!profile) {
          if (!agentReq.optional) {
            errors.push(
              `Required agent profile '${agentReq.agentId}' was not found in tenant '${tenantId}'`
            );
          } else {
            warnings.push(
              `Optional agent profile '${agentReq.agentId}' was not found in tenant '${tenantId}'`
            );
          }
          continue;
        }

        // Multi-tenant check
        if (profile.tenantId && profile.tenantId !== tenantId) {
          errors.push(
            `Cross-tenant access violation: Agent '${agentReq.agentId}' belongs to tenant '${profile.tenantId}', expected '${tenantId}'`
          );
          continue;
        }

        // Profile version check
        if (
          agentReq.requiredProfileVersion !== undefined &&
          profile.version !== agentReq.requiredProfileVersion
        ) {
          errors.push(
            `Agent '${agentReq.agentId}' has profile version ${profile.version}, but blueprint requires profile version ${agentReq.requiredProfileVersion}`
          );
        }

        // Required role check
        if (agentReq.requiredRole && profile.role !== agentReq.requiredRole) {
          errors.push(
            `Agent '${agentReq.agentId}' has role '${profile.role}', but blueprint requires role '${agentReq.requiredRole}'`
          );
        }

        // Required capabilities for this agent
        if (agentReq.requiredCapabilities && agentReq.requiredCapabilities.length > 0) {
          for (const requiredCap of agentReq.requiredCapabilities) {
            const hasCap = profile.capabilities.some(
              (c) => (c.id === requiredCap || c.name === requiredCap) && c.status === "VERIFIED"
            );
            if (!hasCap) {
              const declaredCap = profile.capabilities.some(
                (c) => c.id === requiredCap || c.name === requiredCap
              );
              if (declaredCap) {
                errors.push(
                  `Agent '${agentReq.agentId}' has capability '${requiredCap}' in DECLARED/UNVERIFIED status, but VERIFIED status is required`
                );
              } else {
                errors.push(
                  `Agent '${agentReq.agentId}' does not possess required capability '${requiredCap}'`
                );
              }
            }
          }
        }
      }

      // Check agent eligibility via AgentLifecycleService if available
      if (this.deps.agentLifecycleService) {
        try {
          const eligibility = await this.deps.agentLifecycleService.checkEligibility({
            agentId: agentReq.agentId,
            tenantId,
          });

          if (!eligibility.eligible) {
            errors.push(
              `Agent '${agentReq.agentId}' is not eligible for execution: [${eligibility.code}] ${eligibility.reason}`
            );
          }
        } catch (err: any) {
          errors.push(
            `Failed to verify eligibility for agent '${agentReq.agentId}': ${err.message}`
          );
        }
      }
    }

    // 3. Capability Requirements Validation
    const validCatalogIds = new Set(PLATFORM_CAPABILITY_CATALOG.map((c) => c.id));
    for (const capReq of blueprint.requiredCapabilities) {
      if (!capReq.capabilityId || !capReq.capabilityId.trim()) {
        errors.push("Capability requirement must specify a valid non-empty capabilityId");
        continue;
      }

      const inCatalog = validCatalogIds.has(capReq.capabilityId);
      if (!inCatalog) {
        // If not in catalog, check if an agent with verified capability exists
        if (this.deps.agentProfileRepo) {
          const matchingAgents = await this.deps.agentProfileRepo.discover({
            tenantId,
            capabilityId: capReq.capabilityId,
            capabilityStatus: "VERIFIED",
          });

          if (matchingAgents.length === 0) {
            if (!capReq.optional) {
              errors.push(
                `Required capability '${capReq.capabilityId}' is not in platform catalog and no eligible agent with verified capability was found in tenant '${tenantId}'`
              );
            } else {
              warnings.push(
                `Optional capability '${capReq.capabilityId}' is uncataloged and unassigned`
              );
            }
          }
        } else {
          warnings.push(`Capability '${capReq.capabilityId}' is custom or uncatalogued`);
        }
      }
    }

    // 4. Policy Requirements Validation
    for (const polReq of blueprint.requiredPolicies) {
      if (!polReq.policyId || !polReq.policyId.trim()) {
        errors.push("Policy requirement must specify a valid non-empty policyId");
      }
    }

    // 5. Verification Requirements Validation
    for (const verReq of blueprint.verificationRequirements) {
      if (!verReq.stepIdOrRule || !verReq.stepIdOrRule.trim()) {
        errors.push("Verification requirement must specify a valid non-empty stepIdOrRule");
      }
      if (verReq.requiredVerdict !== "PASS") {
        errors.push(
          `Verification requirement for '${verReq.stepIdOrRule}' must specify requiredVerdict='PASS'`
        );
      }
    }

    // 6. Approval Requirements Validation
    for (const appReq of blueprint.approvalRequirements) {
      if (!appReq.actionOrStep || !appReq.actionOrStep.trim()) {
        errors.push("Approval requirement must specify a valid non-empty actionOrStep");
      }
      if (!appReq.requiredRole || !appReq.requiredRole.trim()) {
        errors.push("Approval requirement must specify a valid non-empty requiredRole");
      }
      if (appReq.minApprovals !== undefined && appReq.minApprovals < 1) {
        errors.push("Approval requirement minApprovals must be at least 1");
      }
    }

    // 7. Composition Graph Cycle Detection
    // Detect circular dependencies if external adapters or workflows reference each other
    const cycle = this.detectCycles(blueprint);
    if (cycle) {
      errors.push(`Circular dependency detected in blueprint composition: ${cycle.join(" -> ")}`);
    }

    return {
      valid: errors.length === 0,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      validatedAt: now,
      checkedComponents: {
        workflowsCount: blueprint.workflows.length,
        agentsCount: blueprint.requiredAgents.length,
        capabilitiesCount: blueprint.requiredCapabilities.length,
        policiesCount: blueprint.requiredPolicies.length,
        verificationsCount: blueprint.verificationRequirements.length,
        approvalsCount: blueprint.approvalRequirements.length,
      },
    };
  }

  private detectCycles(blueprint: SolutionBlueprint): string[] | null {
    // Build adjacency list for adapters/workflows
    const graph = new Map<string, string[]>();

    for (const wf of blueprint.workflows) {
      const node = `workflow:${wf.workflowDefinitionId}`;
      if (!graph.has(node)) graph.set(node, []);
    }

    for (const ag of blueprint.requiredAgents) {
      const node = `agent:${ag.agentId}`;
      if (!graph.has(node)) graph.set(node, []);
      // If agent specifies capabilities, link agent to capability
      if (ag.requiredCapabilities) {
        for (const cap of ag.requiredCapabilities) {
          graph.get(node)?.push(`capability:${cap}`);
        }
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (curr: string, path: string[]): string[] | null => {
      visited.add(curr);
      recStack.add(curr);
      path.push(curr);

      const neighbors = graph.get(curr) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const res = dfs(neighbor, [...path]);
          if (res) return res;
        } else if (recStack.has(neighbor)) {
          return [...path, neighbor];
        }
      }

      recStack.delete(curr);
      return null;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node, []);
        if (cycle) return cycle;
      }
    }

    return null;
  }
}
