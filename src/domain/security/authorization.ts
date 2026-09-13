import crypto from "node:crypto";
import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";
import { Principal, PrincipalType, SecurityContext, RiskLevel } from "./security.js";

export type ResourceType =
  | "API"
  | "AGENT"
  | "TOOL"
  | "MODEL"
  | "MEMORY"
  | "COORDINATION"
  | "TASK"
  | "SYSTEM";

export type StandardAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXECUTE"
  | "INVOKE"
  | "TRANSFER"
  | "START"
  | string;

export interface PermissionProps {
  readonly resource: string;
  readonly action: string;
  readonly scope?: string | undefined;
  readonly description?: string | undefined;
}

export class PermissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionValidationError";
  }
}

export class Permission {
  readonly resource!: string;
  readonly action!: string;
  readonly scope?: string | undefined;
  readonly description?: string | undefined;

  private constructor(props: {
    resource: string;
    action: string;
    scope?: string | undefined;
    description?: string | undefined;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(props: PermissionProps): Permission {
    if (!props || typeof props.resource !== "string" || props.resource.trim() === "") {
      throw new PermissionValidationError("Permission resource must be a non-empty string");
    }
    if (typeof props.action !== "string" || props.action.trim() === "") {
      throw new PermissionValidationError("Permission action must be a non-empty string");
    }

    return new Permission({
      resource: props.resource.trim().toLowerCase(),
      action: props.action.trim().toLowerCase(),
      ...(props.scope?.trim() ? { scope: props.scope.trim() } : {}),
      ...(props.description?.trim() ? { description: props.description.trim() } : {}),
    });
  }

  static parse(permissionString: string): Permission {
    if (typeof permissionString !== "string" || permissionString.trim() === "") {
      throw new PermissionValidationError("Permission string must be a non-empty string");
    }
    const trimmed = permissionString.trim();
    if (trimmed === "*") {
      return new Permission({ resource: "*", action: "*" });
    }
    const parts = trimmed.split(".");
    if (parts.length === 1) {
      return new Permission({ resource: parts[0]!.toLowerCase(), action: "*" });
    }
    const resource = parts[0]!.toLowerCase();
    const action = parts.slice(1).join(".").toLowerCase();
    return new Permission({ resource, action });
  }

  toFormattedString(): string {
    if (this.resource === "*" && this.action === "*") return "*";
    if (this.action === "*") return `${this.resource}.*`;
    return `${this.resource}.${this.action}`;
  }

  matches(resource: string, action: string, scope?: string): boolean {
    const targetResource = resource.trim().toLowerCase();
    const targetAction = action.trim().toLowerCase();

    // Universal wildcard match
    if (this.resource === "*" && this.action === "*") {
      return true;
    }

    // Resource wildcard or exact match
    const resourceMatches = this.resource === "*" || this.resource === targetResource;
    // Action wildcard or exact match
    const actionMatches = this.action === "*" || this.action === targetAction;

    if (!resourceMatches || !actionMatches) {
      return false;
    }

    // Scope check if permission is scope-restricted
    if (this.scope && scope && this.scope !== scope) {
      return false;
    }

    return true;
  }
}

export interface RoleProps {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly (string | Permission)[];
  readonly description?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class RoleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleValidationError";
  }
}

export class Role {
  readonly id!: string;
  readonly name!: string;
  readonly permissions!: readonly string[];
  readonly description?: string | undefined;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    name: string;
    permissions: readonly string[];
    description?: string | undefined;
    metadata: Readonly<Record<string, unknown>>;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(props: RoleProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): Role {
    if (!props || typeof props.id !== "string" || props.id.trim() === "") {
      throw new RoleValidationError("Role id must be a non-empty string");
    }
    if (typeof props.name !== "string" || props.name.trim() === "") {
      throw new RoleValidationError("Role name must be a non-empty string");
    }
    if (!Array.isArray(props.permissions)) {
      throw new RoleValidationError("Role permissions must be an array");
    }

    const normalizedPermissions = props.permissions
      .map((p) => {
        if (typeof p === "string") return p.trim().toLowerCase();
        if (p instanceof Permission) return p.toFormattedString();
        return "";
      })
      .filter((p) => p.length > 0);

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    return new Role({
      id: props.id.trim(),
      name: props.name.trim(),
      permissions: Object.freeze([...new Set(normalizedPermissions)]),
      ...(props.description?.trim() ? { description: props.description.trim() } : {}),
      metadata: sanitizedMetadata,
    });
  }

  hasPermission(targetPermission: string): boolean {
    if (typeof targetPermission !== "string" || targetPermission.trim() === "") return false;
    const target = targetPermission.trim().toLowerCase();

    // If role has universal wildcard
    if (this.permissions.includes("*")) return true;
    if (this.permissions.includes(target)) return true;

    // Check wildcard patterns in role permissions
    for (const permStr of this.permissions) {
      if (permStr.endsWith(".*")) {
        const prefix = permStr.slice(0, -2);
        if (target.startsWith(prefix + ".")) {
          return true;
        }
      }
    }

    return false;
  }
}

export interface RoleRepository {
  findRoleById(id: string): Promise<Role | null>;
  findAllRoles(): Promise<readonly Role[]>;
  getRolesForPrincipal(principal: Principal): Promise<readonly Role[]>;
}

export interface AuthorizationRequest {
  readonly context: SecurityContext;
  readonly action: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly targetScope?: string | undefined;
  readonly targetTenantId?: string | undefined;
  readonly targetAgentId?: string | undefined;
  readonly requiredPermission?: string | undefined;
  readonly riskLevel?: RiskLevel | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AuthorizationResult {
  readonly allowed: boolean;
  readonly code: string;
  readonly reason: string;
  readonly evaluatedAt: Date;
  readonly principalId?: string | undefined;
  readonly principalType?: PrincipalType | undefined;
  readonly tenantId?: string | undefined;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly action?: string | undefined;
  readonly matchedRoles?: readonly string[] | undefined;
  readonly matchedPolicyId?: string | undefined;
}
