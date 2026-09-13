import crypto from "node:crypto";
import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";

export type PrincipalType = "HUMAN" | "SERVICE" | "AGENT" | "TOOL" | "SYSTEM";

export interface PrincipalProps {
  readonly id: string;
  readonly type: PrincipalType;
  readonly name?: string | undefined;
  readonly roles?: readonly string[] | undefined;
  readonly permissions?: readonly string[] | undefined;
  readonly tenantId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class Principal {
  readonly id!: string;
  readonly type!: PrincipalType;
  readonly name!: string;
  readonly roles!: readonly string[];
  readonly permissions!: readonly string[];
  readonly tenantId?: string | undefined;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    type: PrincipalType;
    name: string;
    roles: readonly string[];
    permissions: readonly string[];
    tenantId?: string | undefined;
    metadata: Readonly<Record<string, unknown>>;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(props: PrincipalProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): Principal {
    if (!props || typeof props.id !== "string" || props.id.trim() === "") {
      throw new SecurityContextValidationError("Principal id must be a non-empty string");
    }
    const validTypes: readonly PrincipalType[] = ["HUMAN", "SERVICE", "AGENT", "TOOL", "SYSTEM"];
    if (!props.type || !validTypes.includes(props.type)) {
      throw new SecurityContextValidationError(`Invalid principal type: '${String(props.type)}'`);
    }

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    const roles = Array.isArray(props.roles)
      ? Object.freeze([...new Set(props.roles.map((r) => (typeof r === "string" ? r.trim() : "")).filter(Boolean))])
      : Object.freeze([]);

    const permissions = Array.isArray(props.permissions)
      ? Object.freeze([...new Set(props.permissions.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean))])
      : Object.freeze([]);

    return new Principal({
      id: props.id.trim(),
      type: props.type,
      name: props.name?.trim() || props.id.trim(),
      roles,
      permissions,
      ...(props.tenantId?.trim() ? { tenantId: props.tenantId.trim() } : {}),
      metadata: sanitizedMetadata,
    });
  }

  hasPermission(permission: string): boolean {
    if (typeof permission !== "string" || permission.trim() === "") return false;
    const target = permission.trim();
    return this.permissions.includes(target) || this.permissions.includes("*");
  }

  hasRole(role: string): boolean {
    if (typeof role !== "string" || role.trim() === "") return false;
    return this.roles.includes(role.trim());
  }
}

export interface SecurityContextProps {
  readonly principal: Principal;
  readonly authenticated: boolean;
  readonly correlationId: string;
  readonly requestId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly resourceScope?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class SecurityContext {
  readonly principal!: Principal;
  readonly authenticated!: boolean;
  readonly correlationId!: string;
  readonly requestId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly resourceScope?: string | undefined;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: {
    principal: Principal;
    authenticated: boolean;
    correlationId: string;
    requestId?: string | undefined;
    tenantId?: string | undefined;
    resourceScope?: string | undefined;
    metadata: Readonly<Record<string, unknown>>;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(props: SecurityContextProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): SecurityContext {
    if (!props || !props.principal || !(props.principal instanceof Principal)) {
      throw new SecurityContextValidationError("SecurityContext requires a valid Principal instance");
    }
    if (typeof props.authenticated !== "boolean") {
      throw new SecurityContextValidationError("SecurityContext authenticated flag must be a boolean");
    }
    if (typeof props.correlationId !== "string" || props.correlationId.trim() === "") {
      throw new SecurityContextValidationError("SecurityContext correlationId must be a non-empty string");
    }

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    return new SecurityContext({
      principal: props.principal,
      authenticated: props.authenticated,
      correlationId: props.correlationId.trim(),
      ...(props.requestId?.trim() ? { requestId: props.requestId.trim() } : {}),
      ...(props.tenantId?.trim() ? { tenantId: props.tenantId.trim() } : {}),
      ...(props.resourceScope?.trim() ? { resourceScope: props.resourceScope.trim() } : {}),
      metadata: sanitizedMetadata,
    });
  }

  static anonymous(correlationId: string = crypto.randomUUID()): SecurityContext {
    return SecurityContext.create({
      principal: Principal.create({
        id: "anonymous",
        type: "HUMAN",
        roles: ["anonymous"],
        permissions: [],
      }),
      authenticated: false,
      correlationId,
    });
  }

  static system(correlationId: string = crypto.randomUUID(), scope?: string): SecurityContext {
    return SecurityContext.create({
      principal: Principal.create({
        id: "system-internal",
        type: "SYSTEM",
        roles: ["system-admin"],
        permissions: ["*"],
      }),
      authenticated: true,
      correlationId,
      ...(scope ? { resourceScope: scope } : {}),
    });
  }
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const TRUST_BOUNDARIES = Object.freeze([
  "A_CLIENT_TO_API",
  "B_API_TO_RUNTIME",
  "C_PLANNER_TO_AGENTS",
  "D_AGENT_TO_TOOL",
  "E_AGENT_TO_MODEL",
  "F_AGENT_TO_MEMORY",
  "G_RUNTIME_TO_PERSISTENCE",
  "H_PLATFORM_TO_EXTERNAL",
] as const);

export type TrustBoundary = typeof TRUST_BOUNDARIES[number];

export const SECURITY_INVARIANTS = Object.freeze([
  "1. No unauthenticated principal may access protected platform operations.",
  "2. Authentication does not imply authorization.",
  "3. Every privileged operation requires explicit authorization.",
  "4. Agents cannot elevate their own privileges.",
  "5. Agents cannot arbitrarily spawn privileged agents.",
  "6. Tools require explicit authorization.",
  "7. Models/providers require explicit authorization.",
  "8. Memory access must respect ownership/boundaries.",
  "9. Cross-agent context must be explicitly transferred.",
  "10. Security decisions must be observable.",
  "11. Security failures must fail closed.",
  "12. Security events must not expose secrets.",
  "13. Security metadata must not become an uncontrolled data exfiltration channel.",
  "14. Authorization must happen before execution, not after.",
  "15. Security enforcement must not depend on an agent behaving honestly.",
] as const);

export class SecurityContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityContextValidationError";
  }
}

export class SecurityAuthorizationDeniedError extends Error {
  constructor(
    readonly principalId: string,
    readonly resourceId: string,
    readonly requiredPermission: string,
    message: string = `Access denied for principal '${principalId}' to resource '${resourceId}'`
  ) {
    super(message);
    this.name = "SecurityAuthorizationDeniedError";
  }
}

export class SecurityInvariantViolationError extends Error {
  constructor(readonly invariantId: number, message: string) {
    super(`Security invariant #${invariantId} violation: ${message}`);
    this.name = "SecurityInvariantViolationError";
  }
}

export interface AuthorizationRequest {
  readonly context: SecurityContext;
  readonly action: string;
  readonly resourceType: "API" | "AGENT" | "TOOL" | "MODEL" | "MEMORY" | "COORDINATION";
  readonly resourceId: string;
  readonly requiredPermission?: string | undefined;
  readonly riskLevel?: RiskLevel | undefined;
  readonly targetAgentId?: string | undefined;
  readonly targetScope?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly code: string;
  readonly reason: string;
  readonly evaluatedAt: Date;
  readonly principalId?: string | undefined;
  readonly action?: string | undefined;
  readonly resourceId?: string | undefined;
}

export function evaluateFailClosedAuthorization(
  request: unknown,
  evaluator?: (req: AuthorizationRequest) => boolean | { allowed: boolean; reason?: string; code?: string }
): AuthorizationDecision {
  const evaluatedAt = new Date();

  // Fail closed on invalid request payload
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return {
      allowed: false,
      code: "SECURITY_INVALID_REQUEST",
      reason: "Authorization request must be a valid non-null object",
      evaluatedAt,
    };
  }

  const req = request as Partial<AuthorizationRequest>;

  // Fail closed on missing security context or principal
  if (!req.context || !(req.context instanceof SecurityContext) || !req.context.principal) {
    return {
      allowed: false,
      code: "SECURITY_CONTEXT_MISSING",
      reason: "Authorization requires an explicit SecurityContext and Principal",
      evaluatedAt,
    };
  }

  const { context, action, resourceId, requiredPermission } = req;
  const principal = context.principal;

  // Protected operations require authentication (Invariant #1)
  if (!context.authenticated && action !== "public.read" && action !== "health.check") {
    return {
      allowed: false,
      code: "SECURITY_UNAUTHENTICATED",
      reason: "Principal is not authenticated for protected operation",
      evaluatedAt,
      principalId: principal.id,
      action,
      resourceId,
    };
  }

  // Check required permission if specified
  if (requiredPermission) {
    if (typeof requiredPermission !== "string" || requiredPermission.trim() === "") {
      return {
        allowed: false,
        code: "SECURITY_PERMISSION_UNKNOWN",
        reason: "Required permission is empty or invalid",
        evaluatedAt,
        principalId: principal.id,
        action,
        resourceId,
      };
    }
    if (!principal.hasPermission(requiredPermission)) {
      return {
        allowed: false,
        code: "SECURITY_PERMISSION_DENIED",
        reason: `Principal '${principal.id}' lacks required permission '${requiredPermission}'`,
        evaluatedAt,
        principalId: principal.id,
        action,
        resourceId,
      };
    }
  }

  // Cross-agent boundary check: Agent cannot access or escalate outside its own scope (Invariant #4, #8)
  if (principal.type === "AGENT") {
    if (req.targetAgentId && req.targetAgentId !== principal.id && action !== "handoff.transfer") {
      return {
        allowed: false,
        code: "SECURITY_CROSS_AGENT_VIOLATION",
        reason: `Agent '${principal.id}' cannot directly access resources of target agent '${req.targetAgentId}'`,
        evaluatedAt,
        principalId: principal.id,
        action,
        resourceId,
      };
    }
  }

  // Custom evaluator if provided, wrapped with fail-closed try/catch (Invariant #11)
  if (evaluator) {
    try {
      const customRes = evaluator(req as AuthorizationRequest);
      if (typeof customRes === "boolean") {
        return {
          allowed: customRes,
          code: customRes ? "SECURITY_ALLOWED" : "SECURITY_POLICY_DENIED",
          reason: customRes ? "Operation authorized by policy" : "Operation denied by custom policy evaluator",
          evaluatedAt,
          principalId: principal.id,
          action,
          resourceId,
        };
      }
      return {
        allowed: customRes.allowed,
        code: customRes.code || (customRes.allowed ? "SECURITY_ALLOWED" : "SECURITY_POLICY_DENIED"),
        reason: customRes.reason || (customRes.allowed ? "Operation authorized" : "Operation denied by policy"),
        evaluatedAt,
        principalId: principal.id,
        action,
        resourceId,
      };
    } catch (err) {
      // Fail closed on any evaluator exception (Invariant #11)
      const message = err instanceof Error ? err.message : "Internal policy evaluator error";
      return {
        allowed: false,
        code: "POLICY_EVALUATION_FAILED",
        reason: `Policy evaluation encountered an error: ${message}`,
        evaluatedAt,
        principalId: principal.id,
        action,
        resourceId,
      };
    }
  }

  return {
    allowed: true,
    code: "SECURITY_ALLOWED",
    reason: "Operation authorized",
    evaluatedAt,
    principalId: principal.id,
    action,
    resourceId,
  };
}
