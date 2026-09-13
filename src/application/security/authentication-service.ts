import crypto from "node:crypto";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import {
  Principal,
  PrincipalType,
  SecurityContext,
} from "../../domain/security/security.js";
import {
  ApiKeyRecord,
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
        reason: "API key format invalid. Expected 'keyId.secret' or 'ak_keyId_secret'",
        evaluatedAt: now,
      };
    }

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
        reason: "SYSTEM principal type cannot be authenticated via API key",
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
  }
}

export interface BearerTokenProviderOptions {
  readonly secretOrPublicKey: string | Buffer;
  readonly algorithm?: "HS256" | "RS256" | undefined;
  readonly issuer?: string | undefined;
  readonly audience?: string | readonly string[] | undefined;
  readonly clockToleranceSeconds?: number | undefined;
}

export class BearerTokenAuthenticationProvider implements AuthenticationProvider {
  private readonly secretOrPublicKey: string | Buffer;
  private readonly algorithm: "HS256" | "RS256";
  private readonly issuer?: string | undefined;
  private readonly audience?: string | readonly string[] | undefined;
  private readonly clockToleranceSeconds: number;

  constructor(options: BearerTokenProviderOptions) {
    if (!options.secretOrPublicKey) {
      throw new Error("secretOrPublicKey is required for BearerTokenAuthenticationProvider");
    }
    this.secretOrPublicKey = options.secretOrPublicKey;
    this.algorithm = options.algorithm ?? "HS256";
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.clockToleranceSeconds = options.clockToleranceSeconds ?? 0;
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

    const token = credential.trim();
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        authenticated: false,
        code: "INVALID_JWT_FORMAT",
        reason: "JWT must contain header, payload, and signature components",
        evaluatedAt: now,
      };
    }

    const headerB64 = parts[0] ?? "";
    const payloadB64 = parts[1] ?? "";
    const signatureB64 = parts[2] ?? "";
    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;

    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
      return {
        authenticated: false,
        code: "INVALID_JWT_ENCODING",
        reason: "JWT header or payload is not valid base64url JSON",
        evaluatedAt: now,
      };
    }

    if (
      !header.alg ||
      typeof header.alg !== "string" ||
      header.alg.toLowerCase() === "none" ||
      header.alg !== this.algorithm
    ) {
      return {
        authenticated: false,
        code: "UNSUPPORTED_ALGORITHM",
        reason: "JWT algorithm '" + String(header.alg) + "' is not supported or not allowed",
        evaluatedAt: now,
      };
    }

    const signingInput = headerB64 + "." + payloadB64;
    const signature = Buffer.from(signatureB64, "base64url");

    if (this.algorithm === "HS256") {
      const expectedSignature = crypto
        .createHmac("sha256", this.secretOrPublicKey)
        .update(signingInput)
        .digest();

      if (
        signature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(signature, expectedSignature)
      ) {
        return {
          authenticated: false,
          code: "INVALID_SIGNATURE",
          reason: "JWT signature verification failed",
          evaluatedAt: now,
        };
      }
    } else if (this.algorithm === "RS256") {
      try {
        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(signingInput);
        const valid = verifier.verify(this.secretOrPublicKey, signature);
        if (!valid) {
          return {
            authenticated: false,
            code: "INVALID_SIGNATURE",
            reason: "JWT signature verification failed",
            evaluatedAt: now,
          };
        }
      } catch (err) {
        return {
          authenticated: false,
          code: "SIGNATURE_VERIFICATION_ERROR",
          reason: "Signature verification error: " + (err instanceof Error ? err.message : String(err)),
          evaluatedAt: now,
        };
      }
    }

    const nowSec = Math.floor(now.getTime() / 1000);

    if (typeof payload.exp === "number") {
      if (nowSec > payload.exp + this.clockToleranceSeconds) {
        return {
          authenticated: false,
          code: "TOKEN_EXPIRED",
          reason: "JWT has expired",
          evaluatedAt: now,
        };
      }
    }

    if (typeof payload.nbf === "number") {
      if (nowSec < payload.nbf - this.clockToleranceSeconds) {
        return {
          authenticated: false,
          code: "TOKEN_NOT_YET_VALID",
          reason: "JWT is not valid yet",
          evaluatedAt: now,
        };
      }
    }

    if (this.issuer && payload.iss !== this.issuer) {
      return {
        authenticated: false,
        code: "INVALID_ISSUER",
        reason: "JWT issuer '" + String(payload.iss) + "' does not match expected '" + this.issuer + "'",
        evaluatedAt: now,
      };
    }

    if (this.audience) {
      const tokenAud = payload.aud;
      const expectedAud = Array.isArray(this.audience) ? this.audience : [this.audience];
      const actualAud = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
      const match = expectedAud.some((aud) => actualAud.includes(aud));
      if (!match) {
        return {
          authenticated: false,
          code: "INVALID_AUDIENCE",
          reason: "JWT audience does not match expected audience",
          evaluatedAt: now,
        };
      }
    }

    if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim() === "") {
      return {
        authenticated: false,
        code: "MISSING_SUBJECT",
        reason: "JWT subject claim (sub) is missing or invalid",
        evaluatedAt: now,
      };
    }

    const principalType: PrincipalType =
      typeof payload.principalType === "string" &&
      ["HUMAN", "SERVICE", "AGENT", "TOOL"].includes(payload.principalType)
        ? (payload.principalType as PrincipalType)
        : "HUMAN";

    if (payload.principalType === "SYSTEM" || principalType === ("SYSTEM" as PrincipalType)) {
      return {
        authenticated: false,
        code: "PRIVILEGE_ESCALATION_BLOCKED",
        reason: "SYSTEM principal type cannot be authenticated via Bearer token",
        evaluatedAt: now,
      };
    }

    const roles = Array.isArray(payload.roles)
      ? (payload.roles as unknown[]).filter((r): r is string => typeof r === "string")
      : ["user"];

    const permissions = Array.isArray(payload.permissions)
      ? (payload.permissions as unknown[]).filter((p): p is string => typeof p === "string")
      : [];

    const principal = Principal.create({
      id: payload.sub,
      type: principalType,
      name: typeof payload.name === "string" ? payload.name : ("User (" + payload.sub + ")"),
      roles,
      permissions,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
      metadata: typeof payload.metadata === "object" && payload.metadata !== null
        ? (payload.metadata as Record<string, unknown>)
        : undefined,
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
        reason: "No provider registered for credential type: '" + request.credentialType + "'",
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
    } catch (err) {
      const result: AuthenticationResult = {
        authenticated: false,
        code: "AUTHENTICATION_ERROR",
        reason: err instanceof Error ? err.message : String(err),
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
