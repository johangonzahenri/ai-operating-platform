/**
 * AI Operating Platform - Portfolio & Multi-Enterprise Domain Errors
 */

export class PortfolioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioError";
  }
}

export class PortfolioValidationError extends PortfolioError {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioValidationError";
  }
}

export class MandateValidationError extends PortfolioError {
  constructor(message: string) {
    super(message);
    this.name = "MandateValidationError";
  }
}

export class PortfolioObjectiveValidationError extends PortfolioError {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioObjectiveValidationError";
  }
}

export class PortfolioObjectiveImmutableError extends PortfolioError {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioObjectiveImmutableError";
  }
}

export class InvalidPortfolioObjectiveTransitionError extends PortfolioError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPortfolioObjectiveTransitionError";
  }
}

export class PortfolioNotFoundError extends Error {
  constructor(readonly portfolioId: string, readonly tenantId?: string) {
    super(`Enterprise Portfolio '${portfolioId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "PortfolioNotFoundError";
  }
}

export class MandateNotFoundError extends Error {
  constructor(readonly mandateId: string, readonly tenantId?: string) {
    super(`Governance Mandate '${mandateId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "MandateNotFoundError";
  }
}

export class MandateRevokedError extends Error {
  constructor(readonly mandateId: string, readonly reason?: string) {
    super(`Governance Mandate '${mandateId}' has been revoked${reason ? `: ${reason}` : ""}`);
    this.name = "MandateRevokedError";
  }
}

export class MandateExpiredError extends Error {
  constructor(readonly mandateId: string, readonly expiredAt: Date) {
    super(`Governance Mandate '${mandateId}' expired at ${expiredAt.toISOString()}`);
    this.name = "MandateExpiredError";
  }
}

export class MandateScopeViolationError extends Error {
  constructor(
    readonly operation: string,
    readonly targetEnterpriseId: string,
    readonly reason: string
  ) {
    super(`Cross-enterprise operation '${operation}' against enterprise '${targetEnterpriseId}' violates mandate scope: ${reason}`);
    this.name = "MandateScopeViolationError";
  }
}

export class CrossEnterpriseAccessDeniedError extends Error {
  constructor(
    readonly principalId: string,
    readonly sourceEnterpriseId: string,
    readonly targetEnterpriseId: string,
    readonly reason: string
  ) {
    super(`Cross-enterprise access denied for principal '${principalId}' from '${sourceEnterpriseId}' to '${targetEnterpriseId}': ${reason}`);
    this.name = "CrossEnterpriseAccessDeniedError";
  }
}

export class PortfolioObjectiveNotFoundError extends Error {
  constructor(readonly objectiveId: string, readonly tenantId?: string) {
    super(`Portfolio Objective '${objectiveId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "PortfolioObjectiveNotFoundError";
  }
}

export class PortfolioConcurrencyConflictError extends Error {
  constructor(readonly id: string, readonly expectedVersion: number, readonly actualVersion: number) {
    super(`Concurrency conflict on portfolio entity '${id}': expected version ${expectedVersion}, but found ${actualVersion}`);
    this.name = "PortfolioConcurrencyConflictError";
  }
}

export class PortfolioTenantMismatchError extends Error {
  constructor(readonly entityId: string, readonly expectedTenant: string, readonly actualTenant: string) {
    super(`Tenant mismatch for portfolio entity '${entityId}': expected '${expectedTenant}', got '${actualTenant}'`);
    this.name = "PortfolioTenantMismatchError";
  }
}
