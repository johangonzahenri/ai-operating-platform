/**
 * AI Operating Platform - Business & Enterprise Domain Errors
 */

export class BusinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessValidationError";
  }
}

export class EnterpriseNotFoundError extends Error {
  constructor(readonly enterpriseId: string, readonly tenantId?: string) {
    super(`Enterprise '${enterpriseId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "EnterpriseNotFoundError";
  }
}

export class BusinessObjectiveNotFoundError extends Error {
  constructor(readonly objectiveId: string, readonly tenantId?: string) {
    super(`Business Objective '${objectiveId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "BusinessObjectiveNotFoundError";
  }
}

export class BusinessInitiativeNotFoundError extends Error {
  constructor(readonly initiativeId: string, readonly tenantId?: string) {
    super(`Business Initiative '${initiativeId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "BusinessInitiativeNotFoundError";
  }
}

export class BusinessMetricValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessMetricValidationError";
  }
}

export class BusinessMetricNotFoundError extends Error {
  constructor(readonly metricId: string, readonly tenantId?: string) {
    super(`Business Metric '${metricId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "BusinessMetricNotFoundError";
  }
}

export class ExecutiveDecisionNotFoundError extends Error {
  constructor(readonly decisionId: string, readonly tenantId?: string) {
    super(`Executive Decision Record '${decisionId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "ExecutiveDecisionNotFoundError";
  }
}

export class InvalidBusinessLifecycleTransitionError extends Error {
  constructor(readonly fromState: string, readonly toState: string, readonly entityName: string) {
    super(`Invalid ${entityName} lifecycle transition from '${fromState}' to '${toState}'`);
    this.name = "InvalidBusinessLifecycleTransitionError";
  }
}

export class UnauthorizedExecutiveDecisionError extends Error {
  constructor(readonly principalId: string, readonly reason: string) {
    super(`Unauthorized executive decision by principal '${principalId}': ${reason}`);
    this.name = "UnauthorizedExecutiveDecisionError";
  }
}

export class AutonomyRestrictionError extends Error {
  constructor(readonly actionName: string, readonly level: string, readonly reason: string) {
    super(`Action '${actionName}' restricted under Autonomy Level '${level}': ${reason}`);
    this.name = "AutonomyRestrictionError";
  }
}

export class BusinessConcurrencyConflictError extends Error {
  constructor(readonly id: string, readonly expectedVersion: number, readonly actualVersion: number) {
    super(`Concurrency conflict on entity '${id}': expected version ${expectedVersion}, but found ${actualVersion}`);
    this.name = "BusinessConcurrencyConflictError";
  }
}

export class BusinessTenantMismatchError extends Error {
  constructor(readonly entityId: string, readonly expectedTenant: string, readonly actualTenant: string) {
    super(`Tenant mismatch for entity '${entityId}': expected '${expectedTenant}', got '${actualTenant}'`);
    this.name = "BusinessTenantMismatchError";
  }
}
