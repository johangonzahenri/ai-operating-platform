import crypto from "node:crypto";
import { EventPublisher, DomainEvent, EventType } from "../../domain/events/events.js";
import { Principal, PrincipalType, SecurityContext } from "../../domain/security/security.js";
import {
  ApiCredential,
  ApiCredentialProps,
  ApiCredentialStatus,
  ApiCredentialValidationError,
} from "../../domain/security/api-credential.js";
import {
  ApiCredentialRepositoryPort,
  ApiCredentialFilter,
} from "../ports/api-credential-repository-port.js";
import { AuthenticationResult } from "../../domain/security/authentication.js";

export interface CreateCredentialInput {
  readonly principalId: string;
  readonly principalType?: PrincipalType | undefined;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly name: string;
  readonly scopes?: readonly string[] | undefined;
  readonly expiresInMs?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CreateCredentialOutput {
  readonly credential: ApiCredential;
  readonly rawKey: string;
}

export interface RotateCredentialInput {
  readonly credentialId: string;
  readonly tenantId: string;
  readonly gracePeriodMs?: number | undefined;
  readonly newName?: string | undefined;
  readonly newScopes?: readonly string[] | undefined;
  readonly newExpiresInMs?: number | undefined;
  readonly reason?: string | undefined;
}

export interface RotateCredentialOutput {
  readonly oldCredential: ApiCredential;
  readonly newCredential: ApiCredential;
  readonly newRawKey: string;
}

export class CredentialNotFoundError extends Error {
  constructor(credentialId: string) {
    super(`Credential '${credentialId}' was not found`);
    this.name = "CredentialNotFoundError";
  }
}

export class CredentialTenantMismatchError extends Error {
  constructor(credentialId: string, expectedTenant: string, providedTenant: string) {
    super(`Tenant mismatch for credential '${credentialId}': expected '${expectedTenant}', got '${providedTenant}'`);
    this.name = "CredentialTenantMismatchError";
  }
}

export class ApiCredentialService {
  constructor(
    private readonly repository: ApiCredentialRepositoryPort,
    private readonly eventPublisher?: EventPublisher | undefined
  ) {}

  /**
   * Generates a cryptographically secure API key and persists the hashed credential.
   * The raw API key is returned ONCE and must be provided directly to the caller.
   */
  async createCredential(input: CreateCredentialInput): Promise<CreateCredentialOutput> {
    if (!input.principalId || input.principalId.trim() === "") {
      throw new ApiCredentialValidationError("principalId is required to create a credential");
    }
    if (!input.tenantId || input.tenantId.trim() === "") {
      throw new ApiCredentialValidationError("tenantId is required to create a credential");
    }
    if (!input.applicationId || input.applicationId.trim() === "") {
      throw new ApiCredentialValidationError("applicationId is required to create a credential");
    }
    if (!input.name || input.name.trim() === "") {
      throw new ApiCredentialValidationError("name is required to create a credential");
    }

    const credentialId = `cred_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const secretEntropy = crypto.randomBytes(32).toString("hex");
    const rawKey = `aop_live_${credentialId}_${secretEntropy}`;
    const keyPrefix = `aop_live_${credentialId.slice(0, 8)}`;
    const keyHash = ApiCredential.hashSecret(rawKey);

    const now = new Date();
    const expiresAt = typeof input.expiresInMs === "number" && input.expiresInMs > 0
      ? new Date(now.getTime() + input.expiresInMs)
      : undefined;

    const credential = ApiCredential.create({
      id: credentialId,
      principalId: input.principalId.trim(),
      principalType: input.principalType ?? "SERVICE",
      tenantId: input.tenantId.trim(),
      applicationId: input.applicationId.trim(),
      name: input.name.trim(),
      keyPrefix,
      keyHash,
      status: "ACTIVE",
      scopes: input.scopes ?? ["tasks.read", "tasks.create", "executions.read", "events.read"],
      createdAt: now,
      expiresAt,
      metadata: input.metadata,
    });

    await this.repository.save(credential);

    this.publishEvent("auth.credential.created", credential.id, credential.tenantId, {
      credentialId: credential.id,
      principalId: credential.principalId,
      principalType: credential.principalType,
      tenantId: credential.tenantId,
      applicationId: credential.applicationId,
      keyPrefix: credential.keyPrefix,
      scopes: credential.scopes,
      expiresAt: credential.expiresAt?.toISOString(),
    });

    return { credential, rawKey };
  }

  /**
   * Verifies a raw API key against stored credentials.
   * Performs timing-safe comparison, checks lifecycle status and expiration,
   * updates lastUsedAt and publishes authentication events.
   */
  async verifyCredential(
    rawKey: string,
    contextMetadata?: Readonly<Record<string, unknown>>
  ): Promise<AuthenticationResult & { credential?: ApiCredential }> {
    const now = new Date();
    if (!rawKey || typeof rawKey !== "string" || rawKey.trim() === "") {
      return {
        authenticated: false,
        code: "EMPTY_CREDENTIAL",
        reason: "API key credential cannot be empty",
        evaluatedAt: now,
      };
    }

    const trimmedKey = rawKey.trim();
    let credentialId: string | null = null;

    // Standard platform format: aop_live_<credentialId>_<secret>
    if (trimmedKey.startsWith("aop_live_")) {
      const rest = trimmedKey.slice("aop_live_".length);
      const lastUnderscore = rest.lastIndexOf("_");
      if (lastUnderscore > 0) {
        credentialId = rest.slice(0, lastUnderscore);
      }
    } else if (trimmedKey.includes(".")) {
      const parts = trimmedKey.split(".");
      credentialId = parts[0] ?? null;
    } else if (trimmedKey.includes(":")) {
      const parts = trimmedKey.split(":");
      credentialId = parts[0] ?? null;
    } else if (trimmedKey.startsWith("ak_")) {
      const rest = trimmedKey.slice("ak_".length);
      const lastUnderscore = rest.lastIndexOf("_");
      if (lastUnderscore > 0) {
        credentialId = rest.slice(0, lastUnderscore);
      } else {
        const parts = trimmedKey.split("_");
        if (parts.length >= 3) {
          credentialId = parts[1] ?? null;
        }
      }
    }

    let credential: ApiCredential | null = null;
    if (credentialId) {
      credential = await this.repository.findById(credentialId);
    }

    // Fallback search by hash if ID could not be extracted directly
    if (!credential) {
      const computedHash = ApiCredential.hashSecret(trimmedKey);
      credential = await this.repository.findByKeyHash(computedHash);
    }

    if (!credential) {
      this.publishEvent("auth.authentication.failed", "unknown", "unknown", {
        code: "KEY_NOT_FOUND",
        reason: "API key not found",
        requestId: contextMetadata?.requestId,
      });
      return {
        authenticated: false,
        code: "KEY_NOT_FOUND",
        reason: "API key not found",
        evaluatedAt: now,
      };
    }

    // Check revocation
    if (credential.isRevoked()) {
      this.publishEvent("auth.authentication.failed", credential.id, credential.tenantId, {
        credentialId: credential.id,
        principalId: credential.principalId,
        tenantId: credential.tenantId,
        code: "KEY_REVOKED",
        reason: "API key has been revoked",
        requestId: contextMetadata?.requestId,
      });
      return {
        authenticated: false,
        code: "KEY_REVOKED",
        reason: "API key has been revoked",
        evaluatedAt: now,
        credential,
      };
    }

    // Check expiration
    if (credential.isExpired(now)) {
      this.publishEvent("auth.authentication.failed", credential.id, credential.tenantId, {
        credentialId: credential.id,
        principalId: credential.principalId,
        tenantId: credential.tenantId,
        code: "KEY_EXPIRED",
        reason: "API key has expired",
        requestId: contextMetadata?.requestId,
      });
      return {
        authenticated: false,
        code: "KEY_EXPIRED",
        reason: "API key has expired",
        evaluatedAt: now,
        credential,
      };
    }

    // Verify secret with timing-safe check
    if (!credential.verifySecret(trimmedKey)) {
      this.publishEvent("auth.authentication.failed", credential.id, credential.tenantId, {
        credentialId: credential.id,
        principalId: credential.principalId,
        tenantId: credential.tenantId,
        code: "INVALID_SECRET",
        reason: "Invalid API key secret",
        requestId: contextMetadata?.requestId,
      });
      return {
        authenticated: false,
        code: "INVALID_SECRET",
        reason: "Invalid API key secret",
        evaluatedAt: now,
        credential,
      };
    }

    // Record usage
    const updatedCredential = credential.recordUsage(now);
    try {
      await this.repository.save(updatedCredential);
    } catch {
      // Best-effort usage tracking: persistence failure should not block execution
    }

    const principal = updatedCredential.toPrincipal();
    const correlationId = typeof contextMetadata?.correlationId === "string" && contextMetadata.correlationId.trim() !== ""
      ? contextMetadata.correlationId.trim()
      : crypto.randomUUID();

    const securityContext = SecurityContext.create({
      principal,
      authenticated: true,
      correlationId,
      requestId: typeof contextMetadata?.requestId === "string" ? contextMetadata.requestId : undefined,
      tenantId: principal.tenantId,
      metadata: {
        ...contextMetadata,
        credentialId: updatedCredential.id,
        applicationId: updatedCredential.applicationId,
        keyPrefix: updatedCredential.keyPrefix,
      },
    });

    this.publishEvent("auth.credential.used", updatedCredential.id, updatedCredential.tenantId, {
      credentialId: updatedCredential.id,
      principalId: updatedCredential.principalId,
      principalType: updatedCredential.principalType,
      tenantId: updatedCredential.tenantId,
      applicationId: updatedCredential.applicationId,
      requestId: contextMetadata?.requestId,
    });

    return {
      authenticated: true,
      principal,
      context: securityContext,
      credential: updatedCredential,
      evaluatedAt: now,
    };
  }

  /**
   * Revokes an existing credential immediately.
   */
  async revokeCredential(
    credentialId: string,
    tenantId: string,
    reason?: string
  ): Promise<ApiCredential> {
    const credential = await this.repository.findById(credentialId);
    if (!credential) {
      throw new CredentialNotFoundError(credentialId);
    }
    if (credential.tenantId !== tenantId) {
      throw new CredentialTenantMismatchError(credentialId, credential.tenantId, tenantId);
    }

    const revoked = credential.revoke(reason);
    await this.repository.save(revoked);

    this.publishEvent("auth.credential.revoked", revoked.id, revoked.tenantId, {
      credentialId: revoked.id,
      principalId: revoked.principalId,
      tenantId: revoked.tenantId,
      reason,
      revokedAt: revoked.revokedAt?.toISOString(),
    });

    return revoked;
  }

  /**
   * Rotates a credential: creates a new active credential and schedules/revokes the old one.
   */
  async rotateCredential(input: RotateCredentialInput): Promise<RotateCredentialOutput> {
    const oldCredential = await this.repository.findById(input.credentialId);
    if (!oldCredential) {
      throw new CredentialNotFoundError(input.credentialId);
    }
    if (oldCredential.tenantId !== input.tenantId) {
      throw new CredentialTenantMismatchError(input.credentialId, oldCredential.tenantId, input.tenantId);
    }

    const now = new Date();
    // Handle old credential: grace period or immediate revocation
    let updatedOldCredential: ApiCredential;
    if (typeof input.gracePeriodMs === "number" && input.gracePeriodMs > 0) {
      const graceExpiresAt = new Date(now.getTime() + input.gracePeriodMs);
      updatedOldCredential = ApiCredential.rehydrate({
        id: oldCredential.id,
        principalId: oldCredential.principalId,
        principalType: oldCredential.principalType,
        tenantId: oldCredential.tenantId,
        applicationId: oldCredential.applicationId,
        name: oldCredential.name,
        keyPrefix: oldCredential.keyPrefix,
        keyHash: oldCredential.keyHash,
        status: oldCredential.status,
        scopes: oldCredential.scopes,
        createdAt: oldCredential.createdAt,
        expiresAt: graceExpiresAt,
        metadata: {
          ...oldCredential.metadata,
          rotatedToGracePeriod: true,
          rotationReason: input.reason,
        },
        version: oldCredential.version + 1,
      });
    } else {
      updatedOldCredential = oldCredential.revoke(input.reason ?? "Rotated to new credential");
    }

    await this.repository.save(updatedOldCredential);

    // Create new credential
    const newCredentialId = `cred_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const newSecretEntropy = crypto.randomBytes(32).toString("hex");
    const newRawKey = `aop_live_${newCredentialId}_${newSecretEntropy}`;
    const newKeyPrefix = `aop_live_${newCredentialId.slice(0, 8)}`;
    const newKeyHash = ApiCredential.hashSecret(newRawKey);

    const newExpiresAt = typeof input.newExpiresInMs === "number" && input.newExpiresInMs > 0
      ? new Date(now.getTime() + input.newExpiresInMs)
      : oldCredential.expiresAt;

    const newCredential = ApiCredential.create({
      id: newCredentialId,
      principalId: oldCredential.principalId,
      principalType: oldCredential.principalType,
      tenantId: oldCredential.tenantId,
      applicationId: oldCredential.applicationId,
      name: input.newName?.trim() || oldCredential.name,
      keyPrefix: newKeyPrefix,
      keyHash: newKeyHash,
      status: "ACTIVE",
      scopes: input.newScopes ?? oldCredential.scopes,
      createdAt: now,
      expiresAt: newExpiresAt,
      metadata: {
        ...oldCredential.metadata,
        rotatedFromCredentialId: oldCredential.id,
      },
    });

    await this.repository.save(newCredential);

    this.publishEvent("auth.credential.rotated", newCredential.id, newCredential.tenantId, {
      oldCredentialId: oldCredential.id,
      newCredentialId: newCredential.id,
      principalId: newCredential.principalId,
      tenantId: newCredential.tenantId,
      applicationId: newCredential.applicationId,
      keyPrefix: newCredential.keyPrefix,
      gracePeriodMs: input.gracePeriodMs,
    });

    return {
      oldCredential: updatedOldCredential,
      newCredential,
      newRawKey,
    };
  }

  /**
   * Lists credentials for a given tenant.
   */
  async listCredentials(
    tenantId: string,
    filter?: ApiCredentialFilter
  ): Promise<readonly ApiCredential[]> {
    if (!tenantId || tenantId.trim() === "") {
      throw new ApiCredentialValidationError("tenantId is required to list credentials");
    }
    return this.repository.findByTenantId(tenantId.trim(), filter);
  }

  /**
   * Retrieves a credential by its ID within a tenant boundary.
   */
  async getCredentialById(
    credentialId: string,
    tenantId: string
  ): Promise<ApiCredential | null> {
    const credential = await this.repository.findById(credentialId);
    if (!credential) return null;
    if (credential.tenantId !== tenantId) {
      throw new CredentialTenantMismatchError(credentialId, credential.tenantId, tenantId);
    }
    return credential;
  }

  private publishEvent(
    type: EventType,
    aggregateId: string,
    tenantId: string,
    payload: Record<string, unknown>
  ): void {
    if (!this.eventPublisher) return;
    const event: DomainEvent = {
      id: crypto.randomUUID(),
      type,
      traceId: crypto.randomUUID(),
      aggregateId,
      occurredAt: new Date(),
      payload: {
        ...payload,
        tenantId,
      },
    };
    try {
      this.eventPublisher.publish(event);
    } catch {
      // Event publishing errors should not crash business operations
    }
  }
}
