export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationValidationError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(readonly organizationId: string) {
    super(`Organization not found: '${organizationId}'`);
    this.name = "OrganizationNotFoundError";
  }
}

export class AreaNotFoundError extends Error {
  constructor(readonly areaId: string) {
    super(`Area not found: '${areaId}'`);
    this.name = "AreaNotFoundError";
  }
}

export class TeamNotFoundError extends Error {
  constructor(readonly teamId: string) {
    super(`Team not found: '${teamId}'`);
    this.name = "TeamNotFoundError";
  }
}

export class OrganizationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationConflictError";
  }
}

export class InvalidHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHierarchyError";
  }
}

export class CrossTenantOrganizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossTenantOrganizationError";
  }
}

export class MembershipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipConflictError";
  }
}

export class BudgetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetValidationError";
  }
}

export class BudgetNotFoundError extends Error {
  constructor(readonly teamId: string) {
    super(`Team resource budget not found for team: '${teamId}'`);
    this.name = "BudgetNotFoundError";
  }
}

export class BudgetExhaustedError extends Error {
  constructor(readonly teamId: string, readonly resourceType?: string) {
    super(`Team resource budget exhausted for team '${teamId}'${resourceType ? ` on resource '${resourceType}'` : ""}`);
    this.name = "BudgetExhaustedError";
  }
}

export class BudgetSuspendedError extends Error {
  constructor(readonly teamId: string) {
    super(`Team resource budget is suspended for team: '${teamId}'`);
    this.name = "BudgetSuspendedError";
  }
}

export class BudgetConcurrencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetConcurrencyConflictError";
  }
}

