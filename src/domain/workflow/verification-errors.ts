/**
 * Domain error definitions for workflow result verification.
 */

export class VerificationError extends Error {
  readonly code: string;

  constructor(message: string, code = "VERIFICATION_ERROR") {
    super(message);
    this.name = "VerificationError";
    this.code = code;
  }
}

export class VerificationValidationError extends VerificationError {
  constructor(message: string) {
    super(message, "VERIFICATION_VALIDATION_ERROR");
    this.name = "VerificationValidationError";
  }
}

export class VerificationNotFoundError extends VerificationError {
  readonly verificationId: string;

  constructor(verificationId: string) {
    super(`Verification result '${verificationId}' not found`, "VERIFICATION_NOT_FOUND");
    this.name = "VerificationNotFoundError";
    this.verificationId = verificationId;
  }
}

export class SelfVerificationError extends VerificationError {
  readonly producerId: string;
  readonly verifierId: string;

  constructor(producerId: string, verifierId: string) {
    super(
      `Self-verification rejected: Producer '${producerId}' cannot certify their own result`,
      "SELF_VERIFICATION_REJECTED"
    );
    this.name = "SelfVerificationError";
    this.producerId = producerId;
    this.verifierId = verifierId;
  }
}

export class VerificationConcurrencyConflictError extends VerificationError {
  readonly verificationId: string;
  readonly currentVersion: number;
  readonly expectedVersion: number;

  constructor(verificationId: string, currentVersion: number, expectedVersion: number) {
    super(
      `Verification result OCC conflict on '${verificationId}': current version ${currentVersion}, expected ${expectedVersion}`,
      "VERIFICATION_CONCURRENCY_CONFLICT"
    );
    this.name = "VerificationConcurrencyConflictError";
    this.verificationId = verificationId;
    this.currentVersion = currentVersion;
    this.expectedVersion = expectedVersion;
  }
}

export class VerificationPolicyDeniedError extends VerificationError {
  readonly reason: string;

  constructor(reason: string) {
    super(`Verification policy denied: ${reason}`, "VERIFICATION_POLICY_DENIED");
    this.name = "VerificationPolicyDeniedError";
    this.reason = reason;
  }
}
