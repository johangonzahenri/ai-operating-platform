export class ApiCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiCredentialError";
  }
}

export class ApiCredentialValidationError extends ApiCredentialError {
  constructor(message: string) {
    super(message);
    this.name = "ApiCredentialValidationError";
  }
}

export class ApiCredentialNotFoundError extends ApiCredentialError {
  constructor(readonly credentialId: string) {
    super(`API credential not found: '${credentialId}'`);
    this.name = "ApiCredentialNotFoundError";
  }
}

export class ApiCredentialRevokedError extends ApiCredentialError {
  constructor(readonly credentialId: string, readonly reason?: string) {
    super(`API credential '${credentialId}' has been revoked${reason ? `: ${reason}` : ""}`);
    this.name = "ApiCredentialRevokedError";
  }
}

export class ApiCredentialExpiredError extends ApiCredentialError {
  constructor(readonly credentialId: string) {
    super(`API credential '${credentialId}' has expired`);
    this.name = "ApiCredentialExpiredError";
  }
}

export class ApiCredentialConcurrencyConflictError extends ApiCredentialError {
  constructor(readonly credentialId: string, readonly expectedVersion: number, readonly actualVersion: number) {
    super(
      `Concurrency conflict on API credential '${credentialId}': expected version ${expectedVersion}, found ${actualVersion}`
    );
    this.name = "ApiCredentialConcurrencyConflictError";
  }
}

export class ApiCredentialTenantMismatchError extends ApiCredentialError {
  constructor(readonly credentialId: string, readonly expectedTenantId: string, readonly actualTenantId: string) {
    super(
      `Tenant mismatch for API credential '${credentialId}': expected '${expectedTenantId}', found '${actualTenantId}'`
    );
    this.name = "ApiCredentialTenantMismatchError";
  }
}
