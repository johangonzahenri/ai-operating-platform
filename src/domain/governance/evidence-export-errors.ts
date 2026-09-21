/**
 * AI Operating Platform - Evidence Export Domain Errors
 */

export class EvidenceExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EvidenceExportError";
  }
}

export class EvidenceExportValidationError extends EvidenceExportError {
  constructor(message: string) {
    super("EVIDENCE_EXPORT_VALIDATION_ERROR", message);
    this.name = "EvidenceExportValidationError";
  }
}

export class EvidenceFilterBoundsExceededError extends EvidenceExportError {
  constructor(message: string) {
    super("EVIDENCE_FILTER_BOUNDS_EXCEEDED", message);
    this.name = "EvidenceFilterBoundsExceededError";
  }
}

export class EvidenceTenantMismatchError extends EvidenceExportError {
  constructor(requestedTenantId: string, authorizedTenantId: string) {
    super(
      "EVIDENCE_TENANT_MISMATCH",
      `Cannot export evidence for tenant '${requestedTenantId}' with security context for tenant '${authorizedTenantId}'`
    );
    this.name = "EvidenceTenantMismatchError";
  }
}

export class EvidenceScopeNotAuthorizedError extends EvidenceExportError {
  constructor(scope: string, reason: string) {
    super(
      "EVIDENCE_SCOPE_NOT_AUTHORIZED",
      `Principal is not authorized to export evidence in scope '${scope}': ${reason}`
    );
    this.name = "EvidenceScopeNotAuthorizedError";
  }
}

export class EvidenceResourceNotFoundError extends EvidenceExportError {
  constructor(resourceType: string, resourceId: string) {
    super(
      "EVIDENCE_RESOURCE_NOT_FOUND",
      `Resource '${resourceType}' with ID '${resourceId}' was not found in the authorized tenant context`
    );
    this.name = "EvidenceResourceNotFoundError";
  }
}
