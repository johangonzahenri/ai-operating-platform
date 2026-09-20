import crypto from "node:crypto";
import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";
import { Principal, PrincipalType } from "./security.js";

export type ApiCredentialStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface ApiCredentialProps {
  readonly id: string;
  readonly principalId: string;
  readonly principalType?: PrincipalType | undefined;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly status?: ApiCredentialStatus | undefined;
  readonly scopes?: readonly string[] | undefined;
  readonly createdAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly revokedAt?: Date | undefined;
  readonly lastUsedAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly version?: number | undefined;
}

export class ApiCredentialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiCredentialValidationError";
  }
}

export class ApiCredential {
  readonly id!: string;
  readonly principalId!: string;
  readonly principalType!: PrincipalType;
  readonly tenantId!: string;
  readonly applicationId!: string;
  readonly name!: string;
  readonly keyPrefix!: string;
  readonly keyHash!: string;
  readonly status!: ApiCredentialStatus;
  readonly scopes!: readonly string[];
  readonly createdAt!: Date;
  readonly expiresAt?: Date | undefined;
  readonly revokedAt?: Date | undefined;
  readonly lastUsedAt?: Date | undefined;
  readonly metadata!: Readonly<Record<string, unknown>>;
  readonly version!: number;

  private constructor(props: {
    id: string;
    principalId: string;
    principalType: PrincipalType;
    tenantId: string;
    applicationId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    status: ApiCredentialStatus;
    scopes: readonly string[];
    createdAt: Date;
    expiresAt?: Date | undefined;
    revokedAt?: Date | undefined;
    lastUsedAt?: Date | undefined;
    metadata: Readonly<Record<string, unknown>>;
    version: number;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static hashSecret(rawSecret: string): string {
    if (typeof rawSecret !== "string" || rawSecret.trim() === "") {
      throw new ApiCredentialValidationError("Secret to hash must be a non-empty string");
    }
    return crypto.createHash("sha256").update(rawSecret.trim()).digest("hex");
  }

  static create(props: ApiCredentialProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): ApiCredential {
    if (!props || typeof props.id !== "string" || props.id.trim() === "") {
      throw new ApiCredentialValidationError("API credential id must be a non-empty string");
    }
    if (typeof props.principalId !== "string" || props.principalId.trim() === "") {
      throw new ApiCredentialValidationError("API credential principalId must be a non-empty string");
    }
    if (typeof props.tenantId !== "string" || props.tenantId.trim() === "") {
      throw new ApiCredentialValidationError("API credential tenantId must be a non-empty string");
    }
    if (typeof props.applicationId !== "string" || props.applicationId.trim() === "") {
      throw new ApiCredentialValidationError("API credential applicationId must be a non-empty string");
    }
    if (typeof props.name !== "string" || props.name.trim() === "") {
      throw new ApiCredentialValidationError("API credential name must be a non-empty string");
    }
    if (typeof props.keyPrefix !== "string" || props.keyPrefix.trim() === "") {
      throw new ApiCredentialValidationError("API credential keyPrefix must be a non-empty string");
    }
    if (typeof props.keyHash !== "string" || props.keyHash.trim() === "") {
      throw new ApiCredentialValidationError("API credential keyHash must be a non-empty string");
    }

    const validStatuses: readonly ApiCredentialStatus[] = ["ACTIVE", "EXPIRED", "REVOKED"];
    const status: ApiCredentialStatus = props.status ?? "ACTIVE";
    if (!validStatuses.includes(status)) {
      throw new ApiCredentialValidationError(`Invalid API credential status: '${String(status)}'`);
    }

    const principalType: PrincipalType = props.principalType ?? "SERVICE";
    if (principalType === "SYSTEM") {
      throw new ApiCredentialValidationError("API credential cannot be associated with SYSTEM principal type");
    }

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    const scopes = Array.isArray(props.scopes)
      ? Object.freeze([...new Set(props.scopes.map((s) => (typeof s === "string" ? s.trim().toLowerCase() : "")).filter(Boolean))])
      : Object.freeze([]);

    const createdAt = props.createdAt instanceof Date && !Number.isNaN(props.createdAt.getTime())
      ? new Date(props.createdAt.getTime())
      : new Date();

    const expiresAt = props.expiresAt instanceof Date && !Number.isNaN(props.expiresAt.getTime())
      ? new Date(props.expiresAt.getTime())
      : undefined;

    if (expiresAt && expiresAt.getTime() <= createdAt.getTime()) {
      throw new ApiCredentialValidationError("API credential expiresAt cannot be earlier than or equal to createdAt");
    }

    const revokedAt = props.revokedAt instanceof Date && !Number.isNaN(props.revokedAt.getTime())
      ? new Date(props.revokedAt.getTime())
      : undefined;

    const lastUsedAt = props.lastUsedAt instanceof Date && !Number.isNaN(props.lastUsedAt.getTime())
      ? new Date(props.lastUsedAt.getTime())
      : undefined;

    const version = typeof props.version === "number" && props.version >= 1 ? props.version : 1;

    return new ApiCredential({
      id: props.id.trim(),
      principalId: props.principalId.trim(),
      principalType,
      tenantId: props.tenantId.trim(),
      applicationId: props.applicationId.trim(),
      name: props.name.trim(),
      keyPrefix: props.keyPrefix.trim(),
      keyHash: props.keyHash.trim().toLowerCase(),
      status,
      scopes,
      createdAt,
      expiresAt,
      revokedAt,
      lastUsedAt,
      metadata: sanitizedMetadata,
      version,
    });
  }

  static rehydrate(props: ApiCredentialProps): ApiCredential {
    return ApiCredential.create(props);
  }

  verifySecret(rawSecret: string): boolean {
    if (typeof rawSecret !== "string" || rawSecret.trim() === "") return false;
    const computedHash = ApiCredential.hashSecret(rawSecret);
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
    if (this.status === "EXPIRED") return true;
    if (!this.expiresAt) return false;
    return now.getTime() >= this.expiresAt.getTime();
  }

  isRevoked(): boolean {
    return this.status === "REVOKED";
  }

  isActive(now: Date = new Date()): boolean {
    return this.status === "ACTIVE" && !this.isExpired(now) && !this.isRevoked();
  }

  hasScope(requiredScope: string): boolean {
    if (typeof requiredScope !== "string" || requiredScope.trim() === "") return false;
    const target = requiredScope.trim().toLowerCase();

    // Universal wildcard
    if (this.scopes.includes("*")) return true;
    if (this.scopes.includes(target)) return true;

    // Domain wildcard matching (e.g., 'tasks.*' matches 'tasks.read', 'tasks.create')
    for (const scope of this.scopes) {
      if (scope.endsWith(".*")) {
        const prefix = scope.slice(0, -2);
        if (target.startsWith(prefix + ".")) {
          return true;
        }
      }
    }

    return false;
  }

  recordUsage(timestamp: Date = new Date()): ApiCredential {
    return new ApiCredential({
      id: this.id,
      principalId: this.principalId,
      principalType: this.principalType,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      name: this.name,
      keyPrefix: this.keyPrefix,
      keyHash: this.keyHash,
      status: this.status,
      scopes: this.scopes,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      lastUsedAt: new Date(timestamp.getTime()),
      metadata: this.metadata,
      version: this.version + 1,
    });
  }

  revoke(reason?: string, timestamp: Date = new Date()): ApiCredential {
    const updatedMetadata = {
      ...this.metadata,
      ...(reason ? { revocationReason: reason } : {}),
    };
    return new ApiCredential({
      id: this.id,
      principalId: this.principalId,
      principalType: this.principalType,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      name: this.name,
      keyPrefix: this.keyPrefix,
      keyHash: this.keyHash,
      status: "REVOKED",
      scopes: this.scopes,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      revokedAt: new Date(timestamp.getTime()),
      lastUsedAt: this.lastUsedAt,
      metadata: Object.freeze(updatedMetadata),
      version: this.version + 1,
    });
  }

  toPrincipal(): Principal {
    return Principal.create({
      id: this.principalId,
      type: this.principalType,
      name: `${this.name} (${this.keyPrefix})`,
      roles: ["service", ...this.scopes],
      permissions: [...this.scopes],
      tenantId: this.tenantId,
      metadata: {
        credentialId: this.id,
        applicationId: this.applicationId,
        keyPrefix: this.keyPrefix,
      },
    });
  }

  toSafeDTO(): Record<string, unknown> {
    return {
      id: this.id,
      principalId: this.principalId,
      principalType: this.principalType,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      name: this.name,
      keyPrefix: this.keyPrefix,
      status: this.status,
      scopes: [...this.scopes],
      createdAt: this.createdAt.toISOString(),
      expiresAt: this.expiresAt ? this.expiresAt.toISOString() : undefined,
      revokedAt: this.revokedAt ? this.revokedAt.toISOString() : undefined,
      lastUsedAt: this.lastUsedAt ? this.lastUsedAt.toISOString() : undefined,
      metadata: { ...this.metadata },
      version: this.version,
    };
  }
}
