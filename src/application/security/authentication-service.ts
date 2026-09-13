import crypto from "node:crypto";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import {
  Principal,
  PrincipalType,
  SecurityContext,
} from "../../domain/security/security.js";
import {
  ApiKeyRecord,
  BearerTokenClaims,
  BearerTokenVerifier,
  AuthenticationRequest,
  AuthenticationResult,
} from "../../domain/security/authentication.js";
import { ApiKeyRepository } from "../../infrastructure/security/in-memory-api-key-repository.js";

export interface AuthenticationProvider {
  supports(credentialType: string): boolean;
  authenticate(
    credential: string,
    metadata?: Readonly<Record<string, unknown>>
  ): Promise<AuthenticationResult>;
}

export class ApiKeyAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  supports(credentialType: string): boolean {
    return credentialType === "API_KEY";
  }

  async authenticate(
    credential: string,
    metadata?: Readonly<Record<string, unknown>>
  ): Promise<AuthenticationResult> {
    const now = new Date();
    if (!credential || typeof credential !== "string" || credential.trim() === "") {
      return {
        authenticated: false,
        code: "EMPTY_CREDENTIAL",
        reason: "API key credential cannot be empty",
        evaluatedAt: now,
      };
    }

    let keyId = "";
    let secret = "";

    const trimmed = credential.trim();
    if (trimmed.includes(".")) {
      const parts = trimmed.split(".");
      keyId = parts[0] ?? "";
      secret = parts.slice(1).join(".");
    } else if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      keyId = parts[0] ?? "";
      secret = parts.slice(1).join(":");
    } else if (trimmed.startsWith("ak_")) {
      const parts = trimmed.split("_");
      if (parts.length >= 3) {
        keyId = parts[1] ?? "";
        secret = parts.slice(2).join("_");
      }
    }

    if (!keyId || !secret) {
      return {
        authenticated: false,
        code: "INVALID_FORMAT",
        reason: "API key format is invalid",
        evaluatedAt: now,
      };
    }

    try {
      const record = await this.apiKeyRepository.findById(keyId);
      if (!record) {
        return {
          authenticated: false,
          code: "KEY_NOT_FOUND",
          reason: "API key not found",
          evaluatedAt: now,
        };
      }

      if (record.status === "REVOKED") {
        return {
          authenticated: false,
          code: "KEY_REVOKED",
          reason: "API key has been revoked",
          evaluatedAt: now,
        };
      }

      if (record.status === "EXPIRED" || record.isExpired(now)) {
        return {
          authenticated: false,
          code: "KEY_EXPIRED",
          reason: "API key has expired",
          evaluatedAt: now,
        };
      }

      if (!record.verifySecret(secret)) {
        return {
          authenticated: false,
          code: "INVALID_SECRET",
          reason: "Invalid API key secret",
          evaluatedAt: now,
        };
      }

      const principal = record.toPrincipal();

      if (principal.type === "SYSTEM") {
        return {
          authenticated: false,
          code: "PRIVILEGE_ESCALATION_BLOCKED",
          reason: "SYSTEM principal type cannot be authenticated via external credentials",
          evaluatedAt: now,
        };
      }

      const context = SecurityContext.create({
        principal,
        authenticated: true,
        correlationId: typeof metadata?.correlationId === "string" ? metadata.correlationId : crypto.randomUUID(),
        tenantId: principal.tenantId,
        metadata,
      });

      return {
        authenticated: true,
        principal,
        context,
        evaluatedAt: now,
      };
    } catch {
      return {
        authenticated: false,
        code: "AUTHENTICATION_ERROR",
        reason: "Authentication failed due to an internal error",
        evaluatedAt: now,
      };
    }
  }
}

export interface BearerTokenProviderOptions {
  readonly verifier?: BearerTokenVerifier | undefined;
}

export class BearerTokenAuthenticationProvider implements AuthenticationProvider {
  private readonly verifier?: BearerTokenVerifier | undefined;

  constructor(options?: BearerTokenProviderOptions) {
    this.verifier = options?.verifier;
  }

  supports(credentialType: string): boolean {
    return credentialType === "BEARER_TOKEN";
  }

  async authenticate(
    credential: string,
    metadata?: Readonly<Record<string, unknown>>
  ): Promise<AuthenticationResult> {
    const now = new Date();
    if (!credential || typeof credential !== "string" || credential.trim() === "") {
      return {
        authenticated: false,
        code: "EMPTY_CREDENTIAL",
        reason: "Bearer token credential cannot be empty",
        evaluatedAt: now,
      };
    }

    if (!this.verifier) {
      return {
        authenticated: false,
        code: "UNTRUSTED_BEARER_PROVIDER",
        reason: "JWT verification pending trusted adapter/dependency",
        evaluatedAt: now,
      };
    }

    const token = credential.trim();
    let claims: BearerTokenClaims | null = null;

    try {
      claims = await this.verifier.verifyToken(token);
    } catch {
      return {
        authenticated: false,
        code: "TOKEN_VERIFICATION_FAILED",
        reason: "Bearer token verification failed",
        evaluatedAt: now,
      };
    }

    if (!claims) {
      return {
        authenticated: false,
        code: "INVALID_TOKEN",
        reason: "Bearer token could not be verified",
        evaluatedAt: now,
      };
    }

    if (!claims.sub || typeof claims.sub !== "string" || claims.sub.trim() === "") {
      return {
        authenticated: false,
        code: "MISSING_SUBJECT",
        reason: "Token subject claim is missing or invalid",
        evaluatedAt: now,
      };
    }

    const validExternalTypes: readonly PrincipalType[] = ["HUMAN", "SERVICE", "AGENT", "TOOL"];
    if (claims.principalType === "SYSTEM") {
      return {
        authenticated: false,
        code: "PRIVILEGE_ESCALATION_BLOCKED",
        reason: "SYSTEM principal type cannot be authenticated via external credentials",
        evaluatedAt: now,
      };
    }

    const principalType: PrincipalType =
      typeof claims.principalType === "string" && validExternalTypes.includes(claims.principalType as PrincipalType)
        ? (claims.principalType as PrincipalType)
        : "HUMAN";

    const roles = Array.isArray(claims.roles)
      ? (claims.roles as unknown[]).filter((r): r is string => typeof r === "string" && r.trim() !== "")
      : ["authenticated"];

    const principal = Principal.create({
      id: claims.sub.trim(),
      type: principalType,
      name: typeof claims.name === "string" && claims.name.trim() !== "" ? claims.name.trim() : `User (${claims.sub.trim()})`,
      roles,
      permissions: [], // Authentication establishes identity; Authorization is determined by PolicyGateway / RBAC
      tenantId: typeof claims.tenantId === "string" && claims.tenantId.trim() !== "" ? claims.tenantId.trim() : undefined,
      metadata: typeof claims.metadata === "object" && claims.metadata !== null ? claims.metadata : undefined,
    });

    const context = SecurityContext.create({
      principal,
      authenticated: true,
      correlationId: typeof metadata?.correlationId === "string" ? metadata.correlationId : crypto.randomUUID(),
      tenantId: principal.tenantId,
      metadata,
    });

    return {
      authenticated: true,
      principal,
      context,
      evaluatedAt: now,
    };
  }
}

export class AuthenticationService {
  private readonly providers: AuthenticationProvider[] = [];

  constructor(
    private readonly eventPublisher?: EventPublisher | undefined,
    providers: AuthenticationProvider[] = []
  ) {
    this.providers.push(...providers);
  }

  registerProvider(provider: AuthenticationProvider): void {
    this.providers.push(provider);
  }

  async authenticate(request: AuthenticationRequest): Promise<AuthenticationResult> {
    const provider = this.providers.find((p) => p.supports(request.credentialType));
    const now = new Date();

    if (!provider) {
      const result: AuthenticationResult = {
        authenticated: false,
        code: "UNSUPPORTED_CREDENTIAL_TYPE",
        reason: `No provider registered for credential type: '${request.credentialType}'`,
        evaluatedAt: now,
      };
      this.publishAuthEvent("auth.failed", request, result);
      return result;
    }

    try {
      const result = await provider.authenticate(request.credential, request.metadata);
      if (result.authenticated) {
        this.publishAuthEvent("auth.succeeded", request, result);
      } else {
        const eventType =
          result.code === "KEY_REVOKED"
            ? "auth.revoked"
            : result.code === "KEY_EXPIRED" || result.code === "TOKEN_EXPIRED"
            ? "auth.expired"
            : "auth.failed";
        this.publishAuthEvent(eventType, request, result);
      }
      return result;
    } catch {
      const result: AuthenticationResult = {
        authenticated: false,
        code: "AUTHENTICATION_ERROR",
        reason: "Authentication failed due to an internal error",
        evaluatedAt: now,
      };
      this.publishAuthEvent("auth.failed", request, result);
      return result;
    }
  }

  async authenticateFromHeaders(
    headers: Readonly<Record<string, string | string[] | undefined>>,
    correlationId?: string,
    requestId?: string
  ): Promise<AuthenticationResult> {
    const authHeader = this.getHeaderValue(headers, "authorization");
    const xApiKey = this.getHeaderValue(headers, "x-api-key");
    const xAgentToken = this.getHeaderValue(headers, "x-agent-token");

    if (xApiKey) {
      return this.authenticate({
        credentialType: "API_KEY",
        credential: xApiKey,
        correlationId,
        requestId,
      });
    }

    if (xAgentToken) {
      return this.authenticate({
        credentialType: "BEARER_TOKEN",
        credential: xAgentToken,
        correlationId,
        requestId,
      });
    }

    if (authHeader) {
      const trimmed = authHeader.trim();
      if (trimmed.startsWith("Bearer ") || trimmed.startsWith("bearer ")) {
        return this.authenticate({
          credentialType: "BEARER_TOKEN",
          credential: trimmed.substring(7).trim(),
          correlationId,
          requestId,
        });
      }
      if (trimmed.startsWith("ApiKey ") || trimmed.startsWith("apikey ")) {
        return this.authenticate({
          credentialType: "API_KEY",
          credential: trimmed.substring(7).trim(),
          correlationId,
          requestId,
        });
      }
    }

    const context = SecurityContext.anonymous(correlationId ?? crypto.randomUUID());
    return {
      authenticated: false,
      code: "NO_CREDENTIALS_PROVIDED",
      reason: "No authentication credentials found in request headers",
      principal: context.principal,
      context,
      evaluatedAt: new Date(),
    };
  }

  private getHeaderValue(
    headers: Readonly<Record<string, string | string[] | undefined>>,
    name: string
  ): string | undefined {
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target) {
        if (Array.isArray(value)) return value[0];
        return value;
      }
    }
    return undefined;
  }

  private publishAuthEvent(
    type: "auth.succeeded" | "auth.failed" | "auth.revoked" | "auth.expired",
    request: AuthenticationRequest,
    result: AuthenticationResult
  ): void {
    if (!this.eventPublisher) return;

    const traceId = request.correlationId ?? crypto.randomUUID();
    const event: DomainEvent = {
      id: crypto.randomUUID(),
      type,
      traceId,
      aggregateId: result.principal?.id ?? "anonymous",
      occurredAt: new Date(),
      payload: {
        credentialType: request.credentialType,
        authenticated: result.authenticated,
        principalId: result.principal?.id,
        principalType: result.principal?.type,
        tenantId: result.principal?.tenantId,
        code: result.code,
        reason: result.reason,
        requestId: request.requestId,
      },
    };

    try {
      this.eventPublisher.publish(event);
    } catch {
      // Event publishing errors should not crash auth evaluation
    }
  }
}
