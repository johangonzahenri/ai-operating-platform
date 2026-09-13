import crypto from "node:crypto";
import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";
import { Principal, PrincipalType, SecurityContext } from "./security.js";

export type CredentialType = "API_KEY" | "BEARER_TOKEN";
export type ApiKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface ApiKeyRecordProps {
  readonly id: string;
  readonly principalId: string;
  readonly principalType?: PrincipalType | undefined;
  readonly keyHash: string;
  readonly status?: ApiKeyStatus | undefined;
  readonly roles?: readonly string[] | undefined;
  readonly tenantId?: string | undefined;
  readonly createdAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyValidationError";
  }
}

export class ApiKeyRecord {
  readonly id!: string;
  readonly principalId!: string;
  readonly principalType!: PrincipalType;
  readonly keyHash!: string;
  readonly status!: ApiKeyStatus;
  readonly roles!: readonly string[];
  readonly tenantId?: string | undefined;
  readonly createdAt!: Date;
  readonly expiresAt?: Date | undefined;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    principalId: string;
    principalType: PrincipalType;
    keyHash: string;
    status: ApiKeyStatus;
    roles: readonly string[];
    tenantId?: string | undefined;
    createdAt: Date;
    expiresAt?: Date | undefined;
    metadata: Readonly<Record<string, unknown>>;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static hashSecret(secret: string): string {
    if (typeof secret !== "string" || secret.trim() === "") {
      throw new ApiKeyValidationError("Secret to hash must be a non-empty string");
    }
    return crypto.createHash("sha256").update(secret.trim()).digest("hex");
  }

  static create(props: ApiKeyRecordProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): ApiKeyRecord {
    if (!props || typeof props.id !== "string" || props.id.trim() === "") {
      throw new ApiKeyValidationError("API key id must be a non-empty string");
    }
    if (typeof props.principalId !== "string" || props.principalId.trim() === "") {
      throw new ApiKeyValidationError("API key principalId must be a non-empty string");
    }
    if (typeof props.keyHash !== "string" || props.keyHash.trim() === "") {
      throw new ApiKeyValidationError("API key keyHash must be a non-empty string");
    }

    const validStatuses: readonly ApiKeyStatus[] = ["ACTIVE", "REVOKED", "EXPIRED"];
    const status: ApiKeyStatus = props.status ?? "ACTIVE";
    if (!validStatuses.includes(status)) {
      throw new ApiKeyValidationError(`Invalid API key status: '${String(status)}'`);
    }

    const principalType: PrincipalType = props.principalType ?? "SERVICE";
    if (principalType === "SYSTEM") {
      throw new ApiKeyValidationError("API key cannot be associated with SYSTEM principal type");
    }

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    const roles = Array.isArray(props.roles)
      ? Object.freeze([...new Set(props.roles.map((r) => (typeof r === "string" ? r.trim() : "")).filter(Boolean))])
      : Object.freeze(["service"]);

    const createdAt = props.createdAt instanceof Date && !Number.isNaN(props.createdAt.getTime())
      ? new Date(props.createdAt.getTime())
      : new Date();

    const expiresAt = props.expiresAt instanceof Date && !Number.isNaN(props.expiresAt.getTime())
      ? new Date(props.expiresAt.getTime())
      : undefined;

    if (expiresAt && expiresAt.getTime() <= createdAt.getTime()) {
      throw new ApiKeyValidationError("API key expiresAt cannot be earlier than or equal to createdAt");
    }

    return new ApiKeyRecord({
      id: props.id.trim(),
      principalId: props.principalId.trim(),
      principalType,
      keyHash: props.keyHash.trim().toLowerCase(),
      status,
      roles,
      ...(props.tenantId?.trim() ? { tenantId: props.tenantId.trim() } : {}),
      createdAt,
      ...(expiresAt ? { expiresAt } : {}),
      metadata: sanitizedMetadata,
    });
  }

  verifySecret(secret: string): boolean {
    if (typeof secret !== "string" || secret.trim() === "") return false;
    const computedHash = ApiKeyRecord.hashSecret(secret);
    try {
      const a = Buffer.from(computedHash, "hex");
      const b = Buffer.from(this.keyHash, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  isExpired(now: Date = new Date()): boolean {
    if (!this.expiresAt) return false;
    return now.getTime() >= this.expiresAt.getTime();
  }

  toPrincipal(): Principal {
    return Principal.create({
      id: this.principalId,
      type: this.principalType,
      name: `API Key (${this.id})`,
      roles: this.roles,
      permissions: [], // Authentication establishes identity only; authorization is evaluated by policy/RBAC
      tenantId: this.tenantId,
      metadata: { keyId: this.id },
    });
  }
}

export interface BearerTokenClaims {
  readonly sub: string;
  readonly iss?: string | undefined;
  readonly aud?: string | readonly string[] | undefined;
  readonly exp?: number | undefined;
  readonly nbf?: number | undefined;
  readonly iat?: number | undefined;
  readonly principalType?: PrincipalType | undefined;
  readonly name?: string | undefined;
  readonly roles?: readonly string[] | undefined;
  readonly tenantId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface BearerTokenVerifier {
  verifyToken(token: string): Promise<BearerTokenClaims | null>;
}

export interface AuthenticationRequest {
  readonly credentialType: CredentialType;
  readonly credential: string;
  readonly correlationId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AuthenticationResult {
  readonly authenticated: boolean;
  readonly principal?: Principal | undefined;
  readonly context?: SecurityContext | undefined;
  readonly code?: string | undefined;
  readonly reason?: string | undefined;
  readonly evaluatedAt: Date;
}
