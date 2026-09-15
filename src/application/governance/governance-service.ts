import {
  GovernedPolicy,
  GovernedPolicyRule,
  GovernanceAuditEntry,
  ApplicationGovernanceRecord,
  RiskTier,
  HumanOversightLevel,
  ChangeLifecycleState,
} from "../../domain/governance/governance.js";
import { randomUUID } from "node:crypto";

export class EnterpriseGovernanceService {
  private readonly policies = new Map<string, GovernedPolicy>();
  private readonly applications = new Map<string, ApplicationGovernanceRecord>();
  private readonly auditLog: GovernanceAuditEntry[] = [];

  constructor() {
    this.seedDefaultPolicies();
    this.seedDefaultApplications();
  }

  private seedDefaultPolicies() {
    const defaultPolicy: GovernedPolicy = {
      policyId: "gov-sec-policy-001",
      version: 1,
      name: "Enterprise Default-Deny & AI Risk Policy",
      description: "Enforces strict risk-tiered oversight and capability gating for all external applications",
      status: "ACTIVE",
      effectiveAt: "2026-01-01T00:00:00.000Z",
      owner: "SecOps Governance Board",
      rules: [
        {
          ruleId: "rule-discovery",
          resource: "commerce.catalog",
          action: "read",
          riskTier: "LOW",
          oversightLevel: "AUTOMATIC",
        },
        {
          ruleId: "rule-recommendation",
          resource: "commerce.recommendation",
          action: "generate",
          riskTier: "LOW",
          oversightLevel: "AUTOMATIC_AUDIT",
        },
        {
          ruleId: "rule-ar-fitting",
          resource: "ar.fitting",
          action: "execute",
          riskTier: "MEDIUM",
          oversightLevel: "AUTOMATIC_AUDIT",
        },
        {
          ruleId: "rule-cart-mutate",
          resource: "commerce.cart",
          action: "modify",
          riskTier: "MEDIUM",
          oversightLevel: "USER_CONFIRMATION",
        },
        {
          ruleId: "rule-order-place",
          resource: "commerce.order",
          action: "create",
          riskTier: "HIGH",
          oversightLevel: "USER_CONFIRMATION",
        },
        {
          ruleId: "rule-admin-policy",
          resource: "governance.policy",
          action: "modify",
          riskTier: "CRITICAL",
          oversightLevel: "HUMAN_APPROVAL",
        },
      ],
    };
    this.policies.set(defaultPolicy.policyId, defaultPolicy);
  }

  private seedDefaultApplications() {
    const tentaciones: ApplicationGovernanceRecord = {
      applicationId: "tentaciones-ai-commerce",
      name: "Tentaciones AI Commerce",
      owner: "Commerce Engineering",
      environment: "staging",
      riskTier: "MEDIUM",
      status: "ACTIVE",
      approvedCapabilities: [
        "commerce.discovery",
        "commerce.recommendations",
        "commerce.fitting_room",
        "commerce.cart_assistance",
      ],
      contactEmail: "security@tentaciones.shop",
      registeredAt: "2026-09-14T00:00:00.000Z",
      lastReviewedAt: "2026-09-14T00:00:00.000Z",
    };
    this.applications.set(tentaciones.applicationId, tentaciones);

    const vehicleParts: ApplicationGovernanceRecord = {
      applicationId: "vehicle-parts-copilot",
      name: "Vehicle Parts Copilot",
      owner: "Automotive Solutions",
      environment: "development",
      riskTier: "HIGH",
      status: "DRAFT",
      approvedCapabilities: [],
      contactEmail: "parts@enterprise-copilot.internal",
      registeredAt: "2026-09-14T00:00:00.000Z",
      lastReviewedAt: "2026-09-14T00:00:00.000Z",
    };
    this.applications.set(vehicleParts.applicationId, vehicleParts);
  }

  public getPolicies(): readonly GovernedPolicy[] {
    return Array.from(this.policies.values());
  }

  public getApplications(): readonly ApplicationGovernanceRecord[] {
    return Array.from(this.applications.values());
  }

  public getAuditTrail(): readonly GovernanceAuditEntry[] {
    return [...this.auditLog];
  }

  public evaluateOperationGovernance(params: {
    actor: string;
    resource: string;
    action: string;
    targetType: GovernanceAuditEntry["targetType"];
    targetId: string;
  }): { allowed: boolean; riskTier: RiskTier; oversight: HumanOversightLevel; auditId: string } {
    const activePolicies = Array.from(this.policies.values()).filter((p) => p.status === "ACTIVE");
    let matchedRule: GovernedPolicyRule | undefined = undefined;

    for (const policy of activePolicies) {
      matchedRule = policy.rules.find((r) => r.resource === params.resource && r.action === params.action);
      if (matchedRule) break;
    }

    const riskTier: RiskTier = matchedRule?.riskTier ?? "HIGH";
    const oversight: HumanOversightLevel = matchedRule?.oversightLevel ?? "HUMAN_APPROVAL";
    const allowed = matchedRule !== undefined;

    const auditEntry: GovernanceAuditEntry = {
      auditId: randomUUID(),
      timestamp: new Date().toISOString(),
      actor: params.actor,
      targetType: params.targetType,
      targetId: params.targetId,
      action: params.action,
      riskTier,
      oversightEnforced: oversight,
      decision: allowed ? "ALLOWED" : "DENIED",
      rationale: allowed ? `Policy rule match ${matchedRule?.ruleId}` : "Default deny: no matching active policy rule",
    };

    this.auditLog.push(auditEntry);
    return { allowed, riskTier, oversight, auditId: auditEntry.auditId };
  }

  public updateApplicationStatus(
    applicationId: string,
    status: ChangeLifecycleState,
    actor: string
  ): boolean {
    const app = this.applications.get(applicationId);
    if (!app) return false;

    const updated: ApplicationGovernanceRecord = {
      ...app,
      status,
      lastReviewedAt: new Date().toISOString(),
    };
    this.applications.set(applicationId, updated);

    this.auditLog.push({
      auditId: randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      targetType: "APPLICATION",
      targetId: applicationId,
      action: "status_update",
      riskTier: "HIGH",
      oversightEnforced: "HUMAN_APPROVAL",
      decision: "ALLOWED",
      rationale: `Application lifecycle updated from ${app.status} to ${status}`,
    });

    return true;
  }
}
