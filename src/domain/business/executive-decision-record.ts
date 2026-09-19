/**
 * AI Operating Platform - ExecutiveDecisionRecord Aggregate Root
 * 
 * Formal, immutable record of executive and governance decisions.
 * 
 * Invariant: WHO, WHAT, UNDER WHAT AUTHORITY, UNDER WHICH POLICY.
 * "AI decided" alone is NOT an authority.
 * Decision != Command != Workflow != Execution.
 */

import {
  BusinessValidationError,
  UnauthorizedExecutiveDecisionError,
  BusinessTenantMismatchError,
} from "./business-errors.js";

export type DecisionAuthorityScope =
  | "STRATEGIC_OBJECTIVE"
  | "INITIATIVE_GOVERNANCE"
  | "BUDGET_ADJUSTMENT"
  | "POLICY_EXCEPTION"
  | "SOLUTION_AUTHORIZATION"
  | "HIGH_IMPACT_APPROVAL";

export type ExecutiveDecisionType =
  | "APPROVE"
  | "REJECT"
  | "OVERRIDE"
  | "DELEGATE"
  | "ESCALATE"
  | "SUSPEND";

export type DecisionTargetType =
  | "OBJECTIVE"
  | "INITIATIVE"
  | "SOLUTION"
  | "WORKFLOW"
  | "BUDGET"
  | "POLICY"
  | "HIGH_IMPACT_OPERATION";

export interface ExecutiveDecisionRecordProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly decisionMakerPrincipalId: string;
  readonly authorityScope: DecisionAuthorityScope;
  readonly decisionType: ExecutiveDecisionType;
  readonly targetType: DecisionTargetType;
  readonly targetId: string;
  readonly rationale: string;
  readonly policyContext?: string | undefined;
  readonly resultingAction?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly timestamp: Date;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
}

export interface CreateExecutiveDecisionRecordProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly decisionMakerPrincipalId: string;
  readonly authorityScope: DecisionAuthorityScope;
  readonly decisionType: ExecutiveDecisionType;
  readonly targetType: DecisionTargetType;
  readonly targetId: string;
  readonly rationale: string;
  readonly policyContext?: string | undefined;
  readonly resultingAction?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly timestamp?: Date | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_AUTHORITY_SCOPES: readonly DecisionAuthorityScope[] = [
  "STRATEGIC_OBJECTIVE",
  "INITIATIVE_GOVERNANCE",
  "BUDGET_ADJUSTMENT",
  "POLICY_EXCEPTION",
  "SOLUTION_AUTHORIZATION",
  "HIGH_IMPACT_APPROVAL",
];
const VALID_DECISION_TYPES: readonly ExecutiveDecisionType[] = [
  "APPROVE",
  "REJECT",
  "OVERRIDE",
  "DELEGATE",
  "ESCALATE",
  "SUSPEND",
];
const VALID_TARGET_TYPES: readonly DecisionTargetType[] = [
  "OBJECTIVE",
  "INITIATIVE",
  "SOLUTION",
  "WORKFLOW",
  "BUDGET",
  "POLICY",
  "HIGH_IMPACT_OPERATION",
];

export class ExecutiveDecisionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly decisionMakerPrincipalId: string;
  readonly authorityScope: DecisionAuthorityScope;
  readonly decisionType: ExecutiveDecisionType;
  readonly targetType: DecisionTargetType;
  readonly targetId: string;
  readonly rationale: string;
  readonly policyContext?: string | undefined;
  readonly resultingAction?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly timestamp: Date;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;

  private constructor(props: ExecutiveDecisionRecordProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.decisionMakerPrincipalId = props.decisionMakerPrincipalId;
    this.authorityScope = props.authorityScope;
    this.decisionType = props.decisionType;
    this.targetType = props.targetType;
    this.targetId = props.targetId;
    this.rationale = props.rationale;
    this.policyContext = props.policyContext;
    this.resultingAction = props.resultingAction;
    this.metadata = props.metadata ? Object.freeze({ ...props.metadata }) : undefined;
    this.timestamp = props.timestamp;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    Object.freeze(this);
  }

  static create(props: CreateExecutiveDecisionRecordProps): ExecutiveDecisionRecord {
    if (!props) {
      throw new BusinessValidationError("CreateExecutiveDecisionRecordProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new BusinessValidationError("Decision id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new BusinessValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const enterpriseId = props.enterpriseId?.trim();
    if (!enterpriseId || !ID_REGEX.test(enterpriseId)) {
      throw new BusinessValidationError("Enterprise id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const decisionMaker = props.decisionMakerPrincipalId?.trim();
    if (!decisionMaker) {
      throw new UnauthorizedExecutiveDecisionError(
        "anonymous",
        "Decision maker principal must be explicitly identified"
      );
    }
    if (!VALID_AUTHORITY_SCOPES.includes(props.authorityScope)) {
      throw new BusinessValidationError(`Invalid authority scope: '${props.authorityScope}'`);
    }
    if (!VALID_DECISION_TYPES.includes(props.decisionType)) {
      throw new BusinessValidationError(`Invalid decision type: '${props.decisionType}'`);
    }
    if (!VALID_TARGET_TYPES.includes(props.targetType)) {
      throw new BusinessValidationError(`Invalid target type: '${props.targetType}'`);
    }
    const targetId = props.targetId?.trim();
    if (!targetId) {
      throw new BusinessValidationError("Decision targetId is required");
    }
    const rationale = props.rationale?.trim();
    if (!rationale) {
      throw new BusinessValidationError("Decision rationale is mandatory for enterprise auditability");
    }

    const now = props.timestamp ?? new Date();

    return new ExecutiveDecisionRecord({
      id,
      tenantId,
      enterpriseId,
      decisionMakerPrincipalId: decisionMaker,
      authorityScope: props.authorityScope,
      decisionType: props.decisionType,
      targetType: props.targetType,
      targetId,
      rationale,
      policyContext: props.policyContext?.trim(),
      resultingAction: props.resultingAction?.trim(),
      metadata: props.metadata,
      timestamp: now,
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
    });
  }

  static rehydrate(props: ExecutiveDecisionRecordProps): ExecutiveDecisionRecord {
    if (!props) {
      throw new BusinessValidationError("ExecutiveDecisionRecordProps is required for rehydration");
    }
    return new ExecutiveDecisionRecord(props);
  }

  assertTenant(expectedTenantId: string): void {
    if (this.tenantId !== expectedTenantId) {
      throw new BusinessTenantMismatchError(this.id, expectedTenantId, this.tenantId);
    }
  }
}
