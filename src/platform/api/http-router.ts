import {
  WorkflowValidationError,
  WorkflowNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowConcurrencyConflictError,
  WorkflowCycleError,
  WorkflowStateTransitionError,
  WorkflowExecutionError,
  NoEligibleAgentFoundError,
} from "../../domain/workflow/workflow-errors.js";
import {
  VerificationError,
  VerificationValidationError,
  VerificationNotFoundError,
  SelfVerificationError,
  VerificationConcurrencyConflictError,
  VerificationPolicyDeniedError,
} from "../../domain/workflow/verification-errors.js";
import {
  ApprovalError,
  ApprovalValidationError,
  ApprovalNotFoundError,
  SelfApprovalError,
  ApprovalExpiredError,
  ApprovalConcurrencyConflictError,
  ApprovalPolicyDeniedError,
  ApprovalTenantMismatchError,
  ApprovalInvalidStateTransitionError,
  UnauthorizedApproverError,
} from "../../domain/workflow/approval-errors.js";
import {
  AgentLifecycleError,
  AgentLifecycleValidationError,
  AgentLifecycleNotFoundError,
  AgentEvaluationNotFoundError,
  InvalidLifecycleTransitionError,
  AgentSuspendedError,
  AgentRevokedError,
  AgentDeprecatedError,
  AgentNotQualifiedError,
  AgentEvaluationExpiredError,
  SelfGovernanceError,
  AgentLifecycleConcurrencyConflictError,
  AgentEvaluationConcurrencyConflictError,
  AgentLifecycleTenantMismatchError,
} from "../../domain/agent/agent-lifecycle-errors.js";
import { AgentLifecycle, AgentLifecycleState } from "../../domain/agent/agent-lifecycle.js";
import { AgentEvaluation, EvaluationType, EvaluationVerdict } from "../../domain/agent/agent-evaluation.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PlatformService } from "./platform-service.js";
import { OperationDTO } from "./platform-dto.js";
import {
  AgentAlreadyExistsError,
  AgentInactiveError,
  AgentNotFoundError,
  AgentValidationError,
} from "../../domain/agent/agent.js";
import {
  OperationConflictError,
  OperationNotFoundError,
  OperationValidationError,
} from "../../application/autonomy/autonomous-operation-service.js";
import { AutonomyBudgetValidationError } from "../../domain/autonomy/autonomy-budget.js";
import { AutonomousOperationValidationError } from "../../domain/autonomy/autonomous-operation.js";
import {
  TaskNotFoundError,
  InvalidTaskTransitionError,
} from "../../domain/task/task.js";
import {
  AuthenticationService,
  ApiKeyAuthenticationProvider,
  BearerTokenAuthenticationProvider,
} from "../../application/security/authentication-service.js";
import {
  AuthorizationEvaluator,
  RbacAuthorizationEvaluator,
} from "../../application/security/rbac-authorization-evaluator.js";
import {
  ApiKeyRepository,
  InMemoryApiKeyRepository,
} from "../../infrastructure/security/in-memory-api-key-repository.js";
import { InMemoryRoleRepository } from "../../infrastructure/security/in-memory-role-repository.js";
import { RoleRepository, ResourceType } from "../../domain/security/authorization.js";
import { SecurityContext } from "../../domain/security/security.js";
import { extractRequestContextFromHeaders } from "../../domain/context/request-context.js";
import { formatApiError } from "./error-contract.js";
import { randomUUID } from "node:crypto";
import {
  OrganizationValidationError,
  OrganizationNotFoundError,
  AreaNotFoundError,
  TeamNotFoundError,
  OrganizationConflictError,
  InvalidHierarchyError,
  CrossTenantOrganizationError,
  MembershipConflictError,
  BudgetValidationError,
  BudgetNotFoundError,
  BudgetExhaustedError,
  BudgetSuspendedError,
  BudgetConcurrencyConflictError,
} from "../../domain/organization/organization-errors.js";
import {
  CoordinationDomainError,
  CoordinationCycleError,
  CoordinationDepthExceededError,
} from "../../domain/organization/organizational-coordination.js";
import {
  ProfileValidationError,
  ProfileNotFoundError,
  CapabilityNotFoundError,
  CapabilityAlreadyExistsError,
  ProfileConcurrencyConflictError,
} from "../../domain/organization/agent-profile.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = fs.existsSync(path.resolve(process.cwd(), "src/platform/web"))
  ? path.resolve(process.cwd(), "src/platform/web")
  : path.resolve(__dirname, "../web");

const ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

export function normalizeId(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return ID_REGEX.test(trimmed) ? trimmed : undefined;
}


type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string };

export interface HttpServerOptions {
  readonly authService?: AuthenticationService | undefined;
  readonly authzEvaluator?: AuthorizationEvaluator | undefined;
  readonly roleRepository?: RoleRepository | undefined;
  readonly apiKeyRepository?: ApiKeyRepository | undefined;
  readonly enforceSecurity?: boolean | undefined;
}

export function createHttpServer(
  service: PlatformService,
  options?: HttpServerOptions
): http.Server {
  const authService =
    options?.authService ??
    new AuthenticationService(undefined, [
      new ApiKeyAuthenticationProvider(
        options?.apiKeyRepository ?? new InMemoryApiKeyRepository()
      ),
      new BearerTokenAuthenticationProvider(),
    ]);

  const authzEvaluator =
    options?.authzEvaluator ??
    new RbacAuthorizationEvaluator(
      options?.roleRepository ?? new InMemoryRoleRepository()
    );

  const mustEnforceSecurity = Boolean(
    options?.enforceSecurity || options?.authService
  );

  return http.createServer(async (req, res) => {
    const reqCtx = extractRequestContextFromHeaders(req.headers, {
      method: req.method,
      path: req.url,
    });
    const requestId = reqCtx.requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Correlation-Id", reqCtx.correlationId);

    // 1. Secure CORS: strictly restricted to localhost / 127.0.0.1 origins
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        if (
          parsedOrigin.hostname === "localhost" ||
          parsedOrigin.hostname === "127.0.0.1" ||
          parsedOrigin.hostname === "[::1]"
        ) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } catch {
        // Invalid origin URL - do not set header
      }
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Correlation-Id, X-Tenant-Id, X-Application-Id, Idempotency-Key");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Security: Immediate check for directory traversal in raw or decoded URL
    const rawUrl = req.url ?? "/";
    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Bad Request: Malformed URL encoding", status: 400, code: "MALFORMED_URL", requestId, correlationId: reqCtx.correlationId }));
      return;
    }

    if (rawUrl.includes("..") || decodedUrl.includes("..")) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Forbidden: Path traversal prohibited", status: 403, code: "PATH_TRAVERSAL", requestId, correlationId: reqCtx.correlationId }));
      return;
    }

    const url = new URL(rawUrl, `http://${req.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname;

    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };

    const sendError = (statusCode: number, message: string, code?: string, traceId?: string) => {
      const defaultCode = statusCode === 404 ? "NOT_FOUND"
        : statusCode === 400 ? "BAD_REQUEST"
        : statusCode === 401 ? "UNAUTHORIZED"
        : statusCode === 403 ? "FORBIDDEN"
        : statusCode === 409 ? "CONFLICT"
        : statusCode === 429 ? "RATE_LIMIT_EXCEEDED"
        : "INTERNAL_SERVER_ERROR";
      const formatted = formatApiError(
        code ?? defaultCode,
        message,
        statusCode,
        { requestId: reqCtx.requestId, correlationId: reqCtx.correlationId }
      );
      const payload: Record<string, unknown> = {
        error: formatted.error.message,
        status: formatted.status,
        code: formatted.error.code,
        requestId: formatted.error.requestId,
        correlationId: formatted.error.correlationId,
        timestamp: new Date().toISOString(),
      };
      if (traceId) payload.traceId = traceId;
      sendJson(statusCode, payload);
    };

    const readJsonBody = async (): Promise<JsonBodyResult> => {
      // Strict Content-Type validation
      const contentType = req.headers["content-type"];
      if (!contentType) {
        return { ok: false, status: 415, error: "Unsupported Media Type: Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" };
      }
      const ct = contentType.trim().toLowerCase();
      if (ct !== "application/json" && !ct.startsWith("application/json;")) {
        return { ok: false, status: 415, error: "Unsupported Media Type: Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" };
      }

      return new Promise((resolve) => {
        let body = "";
        let tooLarge = false;

        req.on("data", (chunk) => {
          if (tooLarge) return;
          body += chunk.toString();
          if (body.length > 1e6) {
            tooLarge = true;
            resolve({ ok: false, status: 413, error: "Payload Too Large: request body exceeds 1MB limit", code: "PAYLOAD_TOO_LARGE" });
          }
        });

        req.on("end", () => {
          if (tooLarge) return;
          if (!body.trim()) {
            resolve({ ok: true, body: {} });
            return;
          }
          try {
            const parsed = JSON.parse(body);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
              resolve({ ok: false, status: 400, error: "Bad Request: JSON body must be an object", code: "INVALID_JSON" });
              return;
            }
            resolve({ ok: true, body: parsed as Record<string, unknown> });
          } catch {
            resolve({ ok: false, status: 400, error: "Bad Request: Malformed JSON syntax", code: "MALFORMED_JSON" });
          }
        });

        req.on("error", (err) => {
          resolve({ ok: false, status: 400, error: `Bad Request: ${err.message}`, code: "READ_ERROR" });
        });
      });
    };

    const hasAuthHeader = Boolean(
      req.headers.authorization ||
      req.headers["x-api-key"] ||
      req.headers["x-agent-token"]
    );

    const authenticateAndAuthorize = async (
      action: string,
      resourceType: ResourceType = "API",
      resourceId = "",
      targetTenantId?: string,
      strict = false
    ): Promise<
      | { ok: true; context?: SecurityContext }
      | { ok: false; status: number; code: string; message: string }
    > => {

      if (strict || mustEnforceSecurity || hasAuthHeader) {
        const authResult = await authService.authenticateFromHeaders(
          req.headers,
          undefined,
          requestId
        );
        if (!authResult.authenticated || !authResult.context) {
          return {
            ok: false,
            status: 401,
            code: authResult.code ?? "UNAUTHORIZED",
            message: authResult.reason ?? "Authentication required",
          };
        }

        const authzResult = await authzEvaluator.evaluate({
          context: authResult.context,
          action,
          resourceType,
          resourceId,
          targetTenantId,
        });

        if (!authzResult.allowed) {
          return {
            ok: false,
            status: 403,
            code: authzResult.code ?? "FORBIDDEN",
            message: authzResult.reason ?? "Access denied",
          };
        }

        return { ok: true, context: authResult.context };
      }

      return { ok: true };
    };

    try {
      // 1. API Endpoints (Support /api/v1/ and /api/ prefixes)
      const isPlatformV1 = pathname.startsWith("/api/platform/v1/");
      const isV1 = pathname.startsWith("/api/v1/");
      const isUnversioned = pathname.startsWith("/api/");
      if (isPlatformV1 || isV1 || isUnversioned) {
        const subPath = isPlatformV1
          ? pathname.substring("/api/platform/v1".length)
          : isV1
          ? pathname.substring("/api/v1".length)
          : pathname.substring("/api".length);

        // RFC 8594: Emit Deprecation and Sunset headers on legacy /api/platform/v1/* alias
        if (isPlatformV1) {
          res.setHeader("Deprecation", "true");
          res.setHeader("Sunset", "Thu, 31 Dec 2026 23:59:59 GMT");
          res.setHeader("Link", `</api/v1${subPath}>; rel="successor-version"`);
        }

        // Server-Side Rate Limiter Check (Enterprise Gateway)
        const rateLimiter = service.getRateLimiter();
        const rlDecision = rateLimiter.checkRateLimit({
          tenantId: reqCtx.tenantId,
          applicationId: reqCtx.applicationId,
          principal: reqCtx.principal,
        });
        res.setHeader("X-RateLimit-Limit", rlDecision.limit.toString());
        res.setHeader("X-RateLimit-Remaining", Math.max(0, rlDecision.remaining).toString());
        res.setHeader("X-RateLimit-Reset", rlDecision.resetAt.toISOString());

        if (!rlDecision.allowed) {
          res.setHeader("Retry-After", Math.ceil(rlDecision.retryAfterMs / 1000).toString());
          sendError(429, `Rate limit exceeded. Tier: ${rlDecision.scope}. Retry after ${Math.ceil(rlDecision.retryAfterMs / 1000)}s`, "RATE_LIMIT_EXCEEDED");
          return;
        }

        // GET /status (Public)
        if (subPath === "/status" && req.method === "GET") {
          sendJson(200, service.getStatus());
          return;
        }

        // GET /health (Public)
        if (subPath === "/health" && req.method === "GET") {
          sendJson(200, service.getHealth());
          return;
        }

        // GET /health/live or /health/liveness or /liveness (Public)
        if ((subPath === "/health/live" || subPath === "/health/liveness" || subPath === "/liveness") && req.method === "GET") {
          sendJson(200, service.getLiveness());
          return;
        }

        // GET /health/ready or /health/readiness or /readiness (Public)
        if ((subPath === "/health/ready" || subPath === "/health/readiness" || subPath === "/readiness") && req.method === "GET") {
          sendJson(200, service.getReadiness());
          return;
        }

        // GET /diagnostics (Public)
        if (subPath === "/diagnostics" && req.method === "GET") {
          sendJson(200, service.getDiagnosticsReport());
          return;
        }

        // GET /governance/policies (Protected)
        if (subPath === "/governance/policies" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("security.read", "SYSTEM", undefined, undefined, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, { policies: service.getGovernanceService().getPolicies() });
          return;
        }

        // GET /governance/applications (Protected)
        if (subPath === "/governance/applications" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("applications.read", "SYSTEM", undefined, undefined, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, { applications: service.getGovernanceService().getApplications() });
          return;
        }

        // GET /governance/audit (Protected)
        if (subPath === "/governance/audit" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("security.read", "SYSTEM", undefined, undefined, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, { auditTrail: service.getGovernanceService().getAuditTrail() });
          return;
        }

        // GET /platform (Protected)
        if (subPath === "/platform" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("public.read", undefined, undefined, undefined, true);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, service.getPlatformMetadata());
          return;
        }

        // --- SaaS Control Plane Endpoints (Prompt 82) ---

        // GET /tenants
        if (subPath === "/tenants" && req.method === "GET") {
          sendJson(200, service.listTenants());
          return;
        }

        // GET /tenants/:id
        const tenantDetailMatch = subPath.match(/^\/tenants\/([^/]+)$/);
        if (tenantDetailMatch && req.method === "GET") {
          const id = normalizeId(tenantDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid tenant ID format", "INVALID_ID");
            return;
          }
          const tenant = service.getTenant(id);
          if (!tenant) {
            sendError(404, "Tenant not found", "TENANT_NOT_FOUND");
            return;
          }
          sendJson(200, tenant);
          return;
        }

        // GET /tenants/:id/dashboard
        const tenantDashboardMatch = subPath.match(/^\/tenants\/([^/]+)\/dashboard$/);
        if (tenantDashboardMatch && req.method === "GET") {
          const id = normalizeId(tenantDashboardMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid tenant ID format", "INVALID_ID");
            return;
          }
          const dashboard = service.getTenantDashboard(id);
          if (!dashboard) {
            sendError(404, "Tenant not found", "TENANT_NOT_FOUND");
            return;
          }
          sendJson(200, dashboard);
          return;
        }

        // GET /usage
        if (subPath === "/usage" && req.method === "GET") {
          sendJson(200, service.getGlobalUsageSummary());
          return;
        }

        // GET /capabilities
        if (subPath === "/capabilities" && req.method === "GET") {
          sendJson(200, service.getCapabilityCatalog());
          return;
        }

        // GET /integrations (Prompt 85)
        if (subPath === "/integrations" && req.method === "GET") {
          sendJson(200, service.listIntegrations());
          return;
        }

        // POST /integrations/verify-all (Prompt 85)
        if (subPath === "/integrations/verify-all" && req.method === "POST") {
          const results = await service.verifyAllIntegrations();
          sendJson(200, results);
          return;
        }

        // GET /integrations/:id (Prompt 85)
        const integrationDetailMatch = subPath.match(/^\/integrations\/([^/]+)$/);
        if (integrationDetailMatch && req.method === "GET") {
          const id = normalizeId(integrationDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid integration ID format", "INVALID_ID");
            return;
          }
          const item = service.getIntegration(id);
          if (!item) {
            sendError(404, "Integration not found", "NOT_FOUND");
            return;
          }
          sendJson(200, item);
          return;
        }

        // POST /integrations/:id/verify (Prompt 85)
        const integrationVerifyMatch = subPath.match(/^\/integrations\/([^/]+)\/verify$/);
        if (integrationVerifyMatch && req.method === "POST") {
          const id = normalizeId(integrationVerifyMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid integration ID format", "INVALID_ID");
            return;
          }
          try {
            const verified = await service.verifyIntegration(id);
            sendJson(200, verified);
            return;
          } catch (err: any) {
            sendError(400, err.message || "Failed to verify integration", "VERIFICATION_ERROR");
            return;
          }
        }

        // POST /demo/reset (Prompt 87)
        if (subPath === "/demo/reset" && req.method === "POST") {
          const resetReport = service.resetDemoData();
          sendJson(200, resetReport);
          return;
        }



        // GET /events/stream — Reactive Operational Streaming (SSE)
        if (subPath === "/events/stream" && req.method === "GET") {
          // 1. Authenticate caller (Support Authorization header, x-api-key, or query param token/apiKey)
          const queryApiKey = url.searchParams.get("apiKey") || url.searchParams.get("api_key");
          const queryToken = url.searchParams.get("token");

          // Temporarily graft query credentials onto headers if absent
          if (!req.headers["x-api-key"] && queryApiKey) {
            req.headers["x-api-key"] = queryApiKey;
          }
          if (!req.headers["authorization"] && queryToken) {
            req.headers["authorization"] = `Bearer ${queryToken}`;
          }

          const authCheck = await authenticateAndAuthorize("events.read", "API", "events", undefined, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }

          // 2. Derive trusted tenantId (From SecurityContext, or fallback to query/header tenant for unauthenticated local demo)
          const callerTenant = authCheck.context?.tenantId ??
            req.headers["x-tenant-id"]?.toString() ??
            url.searchParams.get("tenantId") ??
            "default-tenant";

          // Cross-tenant protection: if client specified tenantId, verify it matches authenticated context
          const requestedTenant = url.searchParams.get("tenantId");
          if (requestedTenant && authCheck.context?.tenantId && requestedTenant !== authCheck.context.tenantId) {
            sendError(403, "Forbidden: Cross-tenant event streaming forbidden", "FORBIDDEN");
            return;
          }

          // 3. Extract filtering and Last-Event-ID
          const lastEventIdHeader = req.headers["last-event-id"]?.toString();
          const lastEventIdQuery = url.searchParams.get("lastEventId");
          let lastEventId: number | undefined = undefined;
          const rawLastId = lastEventIdHeader ?? lastEventIdQuery;
          if (rawLastId !== undefined && rawLastId !== null) {
            const parsed = parseInt(rawLastId, 10);
            if (!Number.isNaN(parsed) && parsed >= 0) {
              lastEventId = parsed;
            }
          }

          const filterCriteria = {
            tenantId: callerTenant,
            organizationId: url.searchParams.get("organizationId")?.trim() || undefined,
            teamId: url.searchParams.get("teamId")?.trim() || undefined,
            agentId: url.searchParams.get("agentId")?.trim() || undefined,
            executionId: url.searchParams.get("executionId")?.trim() || undefined,
            traceId: url.searchParams.get("traceId")?.trim() || undefined,
            eventType: url.searchParams.get("eventType")?.trim() || undefined,
            lastEventId,
          };

          const streamResult = service.handleEventStream(res, filterCriteria);
          if (!streamResult.ok) {
            sendError(streamResult.status, streamResult.message, streamResult.code);
          }
          return;
        }

        // GET /events
        if (subPath === "/events" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const afterSeqParam = url.searchParams.get("afterSequence");
          const beforeSeqParam = url.searchParams.get("beforeSequence");
          const taskIdParam = url.searchParams.get("taskId");
          const executionIdParam = url.searchParams.get("executionId");
          const agentIdParam = url.searchParams.get("agentId");
          const traceIdParam = url.searchParams.get("traceId");
          const correlationIdParam = url.searchParams.get("correlationId");
          const eventTypeParam = url.searchParams.get("eventType");
          const aggregateTypeParam = url.searchParams.get("aggregateType");
          const fromParam = url.searchParams.get("from");
          const toParam = url.searchParams.get("to");

          let limit: number | undefined = undefined;
          if (limitParam !== null) {
            const parsed = parseInt(limitParam, 10);
            if (Number.isNaN(parsed) || parsed < 1 || parsed > 500) {
              sendError(400, "Bad Request: 'limit' must be an integer between 1 and 500", "INVALID_LIMIT");
              return;
            }
            limit = parsed;
          }

          let afterSequence: number | undefined = undefined;
          if (afterSeqParam !== null) {
            const parsed = parseInt(afterSeqParam, 10);
            if (Number.isNaN(parsed) || parsed < 0) {
              sendError(400, "Bad Request: 'afterSequence' must be a non-negative integer", "INVALID_SEQUENCE");
              return;
            }
            afterSequence = parsed;
          }

          let beforeSequence: number | undefined = undefined;
          if (beforeSeqParam !== null) {
            const parsed = parseInt(beforeSeqParam, 10);
            if (Number.isNaN(parsed) || parsed < 0) {
              sendError(400, "Bad Request: 'beforeSequence' must be a non-negative integer", "INVALID_SEQUENCE");
              return;
            }
            beforeSequence = parsed;
          }

          let from: Date | undefined = undefined;
          if (fromParam !== null) {
            from = new Date(fromParam);
            if (Number.isNaN(from.getTime())) {
              sendError(400, "Bad Request: 'from' must be a valid ISO-8601 date string", "INVALID_DATE");
              return;
            }
          }

          let to: Date | undefined = undefined;
          if (toParam !== null) {
            to = new Date(toParam);
            if (Number.isNaN(to.getTime())) {
              sendError(400, "Bad Request: 'to' must be a valid ISO-8601 date string", "INVALID_DATE");
              return;
            }
          }

          const options = {
            limit,
            afterSequence,
            beforeSequence,
            taskId: taskIdParam ? taskIdParam.trim() : undefined,
            executionId: executionIdParam ? executionIdParam.trim() : undefined,
            agentId: agentIdParam ? agentIdParam.trim() : undefined,
            traceId: traceIdParam ? traceIdParam.trim() : undefined,
            correlationId: correlationIdParam ? correlationIdParam.trim() : undefined,
            eventType: eventTypeParam ? eventTypeParam.trim() : undefined,
            aggregateType: aggregateTypeParam ? aggregateTypeParam.trim() : undefined,
            from,
            to,
          };

          const response = service.getEvents(options);
          sendJson(200, response);
          return;
        }

        // GET /events/:id
        const eventDetailMatch = subPath.match(/^\/events\/([^/]+)$/);
        if (eventDetailMatch && req.method === "GET") {
          const rawId = eventDetailMatch[1] ?? "";
          const id = normalizeId(rawId);
          if (!id && !/^\d+$/.test(rawId)) {
            sendError(400, "Bad Request: Invalid event ID format", "INVALID_ID");
            return;
          }
          const event = service.getEvent(id ?? rawId);

          if (!event) {
            sendError(404, "Event not found", "NOT_FOUND");
            return;
          }
          sendJson(200, event);
          return;
        }


        // GET /tools
        if (subPath === "/tools" && req.method === "GET") {
          sendJson(200, service.listTools());
          return;
        }

        // GET /tools/:id
        const toolDetailMatch = subPath.match(/^\/tools\/([^/]+)$/);
        if (toolDetailMatch && req.method === "GET") {
          const id = normalizeId(toolDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid tool ID format", "INVALID_ID");
            return;
          }
          const tool = service.getTool(id);
          if (!tool) {
            sendError(404, "Tool not found", "NOT_FOUND");
            return;
          }
          sendJson(200, tool);
          return;
        }

        // GET /models
        if (subPath === "/models" && req.method === "GET") {
          sendJson(200, service.listModels());
          return;
        }

        // GET /models/:id
        const modelDetailMatch = subPath.match(/^\/models\/([^/]+)$/);
        if (modelDetailMatch && req.method === "GET") {
          const id = normalizeId(modelDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid model ID format", "INVALID_ID");
            return;
          }
          const model = service.getModel(id);
          if (!model) {
            sendError(404, "Model not found", "NOT_FOUND");
            return;
          }
          sendJson(200, model);
          return;
        }

        // GET /applications
        if (subPath === "/applications" && req.method === "GET") {
          sendJson(200, service.listApplications());
          return;
        }

        // GET /applications/:id
        const appDetailMatch = subPath.match(/^\/applications\/([^/]+)$/);
        if (appDetailMatch && req.method === "GET") {
          const id = normalizeId(appDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid application ID format", "INVALID_ID");
            return;
          }
          const app = service.getApplication(id);
          if (!app) {
            sendError(404, "Application not found", "APPLICATION_NOT_FOUND");
            return;
          }
          sendJson(200, app);
          return;
        }

        // GET /applications/:id/analytics
        const appAnalyticsMatch = subPath.match(/^\/applications\/([^/]+)\/analytics$/);
        if (appAnalyticsMatch && req.method === "GET") {
          const id = normalizeId(appAnalyticsMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid application ID format", "INVALID_ID");
            return;
          }
          try {
            const analytics = service.getApplicationAnalytics(id);
            sendJson(200, analytics);
            return;
          } catch (err: any) {
            sendError(404, err.message, "APPLICATION_NOT_FOUND");
            return;
          }
        }

        // POST /applications/:id/lifecycle
        const appLifecycleMatch = subPath.match(/^\/applications\/([^/]+)\/lifecycle$/);
        if (appLifecycleMatch && req.method === "POST") {
          const id = normalizeId(appLifecycleMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid application ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          try {
            const body = bodyResult.body as { state: any; reason?: string };
            const updated = service.updateApplicationLifecycle(id, body.state, body.reason);
            sendJson(200, updated);
            return;
          } catch (err: any) {
            sendError(400, err.message, "LIFECYCLE_UPDATE_FAILED");
            return;
          }
        }

        // POST /factory/generate
        if (subPath === "/factory/generate" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          try {
            const generated = service.generateApplication(bodyResult.body as any);
            sendJson(201, generated);
            return;
          } catch (err: any) {
            sendError(400, err.message, "FACTORY_GENERATION_FAILED");
            return;
          }
        }

        // POST /factory/validate
        if (subPath === "/factory/validate" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const body = bodyResult.body as { manifest?: any; tenantId?: string };
          const validationResult = service.validateApplicationManifest(
            body.manifest ?? body,
            body.tenantId
          );
          sendJson(200, validationResult);
          return;
        }

        // POST /factory/register
        if (subPath === "/factory/register" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          try {
            const body = bodyResult.body as { manifest?: any; tenantId?: string };
            const registered = service.registerApplication(
              body.manifest ?? body,
              body.tenantId ?? "tenant-default"
            );
            sendJson(201, registered);
            return;
          } catch (err: any) {
            sendError(400, err.message, "FACTORY_REGISTRATION_FAILED");
            return;
          }
        }

        // GET /agents
        if (subPath === "/agents" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("agent.read", "AGENT");
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, service.listSafeAgents());
          return;
        }

        // POST /agents
        if (subPath === "/agents" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { id: rawId, name, description, model, instructions, tools, memoryScope } = bodyResult.body;
          const id = normalizeId(rawId);
          if (!id) {
            sendError(400, "Bad Request: 'id' is required and must be alphanumeric (1-128 chars)", "INVALID_ID");
            return;
          }
          if (typeof name !== "string" || !name.trim()) {
            sendError(400, "Bad Request: 'name' is required", "INVALID_NAME");
            return;
          }
          if (typeof model !== "string" || !model.trim()) {
            sendError(400, "Bad Request: 'model' is required", "INVALID_MODEL");
            return;
          }
          if (tools !== undefined && !Array.isArray(tools)) {
            sendError(400, "Bad Request: 'tools' if provided must be an array of strings", "INVALID_TOOLS");
            return;
          }

          try {
            const created = service.createAgent({
              id,
              name: name.trim(),
              description: typeof description === "string" ? description.trim() : undefined,
              model: model.trim(),
              instructions: typeof instructions === "string" ? instructions.trim() : undefined,
              tools: Array.isArray(tools) ? tools.map(String) : undefined,
              memoryScope: typeof memoryScope === "string" ? memoryScope.trim() : undefined,
            });
            sendJson(201, created);
            return;
          } catch (err) {
            if (err instanceof AgentAlreadyExistsError) {
              sendError(409, err.message, "AGENT_EXISTS");
              return;
            }
            if (err instanceof AgentValidationError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/activate
        const agentActivateMatch = subPath.match(/^\/agents\/([^/]+)\/activate$/);
        if (agentActivateMatch && req.method === "POST") {
          const id = normalizeId(agentActivateMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          try {
            const updated = service.activateAgent(id);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/deactivate
        const agentDeactivateMatch = subPath.match(/^\/agents\/([^/]+)\/deactivate$/);
        if (agentDeactivateMatch && req.method === "POST") {
          const id = normalizeId(agentDeactivateMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          try {
            const updated = service.deactivateAgent(id);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/executions
        const agentExecMatch = subPath.match(/^\/agents\/([^/]+)\/executions$/);
        if (agentExecMatch && req.method === "POST") {
          const id = normalizeId(agentExecMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { input, traceId: rawTraceId } = bodyResult.body;
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          try {
            const result = await service.executeAgent(id, input as Record<string, unknown>, traceId);
            sendJson(201, result);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentInactiveError) {
              sendError(400, err.message, "AGENT_INACTIVE");
              return;
            }
            throw err;
          }
        }

        // GET /agents/:id
        const agentDetailMatch = subPath.match(/^\/agents\/([^/]+)$/);
        if (agentDetailMatch && agentDetailMatch[1] !== "discover" && req.method === "GET") {
          const id = normalizeId(agentDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const agent = service.getAgent(id);
          if (!agent) {
            sendError(404, "Agent not found", "AGENT_NOT_FOUND");
            return;
          }
          sendJson(200, agent);
          return;
        }

        // PUT /agents/:id
        if (agentDetailMatch && req.method === "PUT") {
          const id = normalizeId(agentDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { name, description, model, instructions, tools, memoryScope } = bodyResult.body;
          if (name !== undefined && (typeof name !== "string" || !name.trim())) {
            sendError(400, "Bad Request: 'name' cannot be empty", "INVALID_NAME");
            return;
          }
          if (model !== undefined && (typeof model !== "string" || !model.trim())) {
            sendError(400, "Bad Request: 'model' cannot be empty", "INVALID_MODEL");
            return;
          }
          if (tools !== undefined && !Array.isArray(tools)) {
            sendError(400, "Bad Request: 'tools' must be an array of strings", "INVALID_TOOLS");
            return;
          }

          try {
            const updated = service.updateAgent(id, {
              name: typeof name === "string" ? name.trim() : undefined,
              description: typeof description === "string" ? description.trim() : undefined,
              model: typeof model === "string" ? model.trim() : undefined,
              instructions: typeof instructions === "string" ? instructions.trim() : undefined,
              tools: Array.isArray(tools) ? tools.map(String) : undefined,
              memoryScope: typeof memoryScope === "string" ? memoryScope.trim() : undefined,
            });
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentValidationError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // GET /metrics
        if (subPath === "/metrics" && req.method === "GET") {
          sendJson(200, service.getMetrics());
          return;
        }

        // GET /audit
        if (subPath === "/audit" && req.method === "GET") {
          const executionId = url.searchParams.get("executionId")?.trim() || undefined;
          sendJson(200, service.getAuditLogs(executionId));
          return;
        }


        // GET /tasks
        if (subPath === "/tasks" && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("task.read", "TASK");
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          sendJson(200, service.getTasks());
          return;
        }

        // POST /tasks
        if (subPath === "/tasks" && req.method === "POST") {
          const authCheck = await authenticateAndAuthorize("task.create", "TASK");
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }

          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { agentId: rawAgentId, input, traceId: rawTraceId, metadata: rawMetadata, idempotencyKey: rawIdempotencyKey } = bodyResult.body;

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let metadata: Record<string, string> | undefined;
          if (rawMetadata !== undefined) {
            if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
              sendError(400, "Bad Request: 'metadata' must be an object", "INVALID_METADATA");
              return;
            }
            const entries = Object.entries(rawMetadata);
            if (entries.length > 16 || entries.some(([key, value]) => key.length === 0 || key.length > 64 || typeof value !== "string" || value.length > 256)) {
              sendError(400, "Bad Request: 'metadata' must contain at most 16 string values", "INVALID_METADATA");
              return;
            }
            metadata = Object.fromEntries(entries) as Record<string, string>;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          // Security: Stamp caller principal and tenant into metadata (prevent spoofing)
          if (authCheck.context?.principal) {
            metadata = {
              ...(metadata ?? {}),
              callerPrincipalId: authCheck.context.principal.id,
              ...(authCheck.context.tenantId ? { callerTenantId: authCheck.context.tenantId } : {}),
            };
          }

          const idempotencyKey =
            typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim() !== ""
              ? rawIdempotencyKey.trim()
              : req.headers["idempotency-key"]?.toString().trim();
          if (idempotencyKey) {
            metadata = {
              ...(metadata ?? {}),
              idempotencyKey,
            };
          }

          const idempotencyStore = service.getIdempotencyStore();
          const callerTenantId = authCheck.context?.tenantId;
          const callerPrincipalId = authCheck.context?.principal?.id;

          if (idempotencyKey) {
            const acquireResult = await idempotencyStore.acquire(
              idempotencyKey,
              { agentId, input },
              callerTenantId,
              callerPrincipalId
            );

            if (acquireResult.status === "MISMATCH") {
              sendError(409, "Idempotency key was previously used with a different request payload", "IDEMPOTENCY_PAYLOAD_MISMATCH");
              return;
            }
            if (acquireResult.status === "IN_PROGRESS") {
              sendError(409, "A request with this idempotency key is currently in progress", "IDEMPOTENCY_CONCURRENT_EXECUTION");
              return;
            }
            if (acquireResult.status === "CACHED") {
              sendJson(acquireResult.statusCode, acquireResult.response);
              return;
            }
          }

          try {
            const taskInput = metadata ? { ...(input as Record<string, unknown>), metadata } : input as Record<string, unknown>;
            const result = await service.submitTask(agentId, taskInput, traceId);
            if (idempotencyKey) {
              await idempotencyStore.complete(idempotencyKey, 201, result, callerTenantId, callerPrincipalId);
            }
            sendJson(201, result);
            return;
          } catch (err) {
            if (idempotencyKey) {
              await idempotencyStore.fail(idempotencyKey, 500, { error: err instanceof Error ? err.message : String(err) }, callerTenantId, callerPrincipalId);
            }
            throw err;
          }
        }

        // POST /tasks/:id/cancel
        const taskCancelMatch = subPath.match(/^\/tasks\/([^/]+)\/cancel$/);
        if (taskCancelMatch && req.method === "POST") {
          const id = normalizeId(taskCancelMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }

          const task = service.getTask(id);
          if (!task) {
            sendError(404, "Task not found", "TASK_NOT_FOUND");
            return;
          }

          const taskTenant = (task.input?.metadata as Record<string, string> | undefined)?.callerTenantId;
          const authCheck = await authenticateAndAuthorize("task.cancel", "TASK", id, taskTenant, true);
          if (!authCheck.ok) {
            if (authCheck.code === "SECURITY_TENANT_ISOLATION_VIOLATION") {
              sendError(404, "Task not found", "TASK_NOT_FOUND");
              return;
            }
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }

          let reason: string | undefined = undefined;
          const contentType = req.headers["content-type"];
          if (contentType) {
            const bodyResult = await readJsonBody();
            if (bodyResult.ok && typeof bodyResult.body.reason === "string") {
              reason = bodyResult.body.reason.trim();
            }
          }

          try {
            const cancelled = service.cancelTask(id, reason);
            sendJson(200, cancelled);
            return;
          } catch (err) {
            if (err instanceof TaskNotFoundError) {
              sendError(404, err.message, "TASK_NOT_FOUND");
              return;
            }
            if (err instanceof InvalidTaskTransitionError) {
              sendError(409, err.message, "INVALID_TASK_TRANSITION");
              return;
            }
            throw err;
          }
        }

        // GET /tasks/:id/events
        const taskEventsMatch = subPath.match(/^\/tasks\/([^/]+)\/events$/);
        if (taskEventsMatch && req.method === "GET") {
          const id = normalizeId(taskEventsMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }

          const task = service.getTask(id);
          if (!task) {
            sendError(404, "Task not found", "TASK_NOT_FOUND");
            return;
          }

          const taskTenant = (task.input?.metadata as Record<string, string> | undefined)?.callerTenantId;
          const authCheck = await authenticateAndAuthorize("task.read", "TASK", id, taskTenant, true);
          if (!authCheck.ok) {
            if (authCheck.code === "SECURITY_TENANT_ISOLATION_VIOLATION") {
              sendError(404, "Task not found", "TASK_NOT_FOUND");
              return;
            }
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }

          const events = service.getTaskEvents(id);
          sendJson(200, {
            data: events,
            meta: {
              count: events.length,
              taskId: id,
            },
          });
          return;
        }

        // GET /tasks/:id
        const taskMatch = subPath.match(/^\/tasks\/([^/]+)$/);
        if (taskMatch && req.method === "GET") {
          const id = normalizeId(taskMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }
          const task = service.getTask(id);
          if (!task) {
            sendError(404, "Task not found", "NOT_FOUND");
            return;
          }

          const taskTenant = (task.input?.metadata as Record<string, string> | undefined)?.callerTenantId;
          const authCheck = await authenticateAndAuthorize("task.read", "TASK", id, taskTenant);
          if (!authCheck.ok) {
            if (authCheck.code === "SECURITY_TENANT_ISOLATION_VIOLATION") {
              sendError(404, "Task not found", "NOT_FOUND");
              return;
            }
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }

          sendJson(200, task);
          return;
        }


        // Product-layer compatibility route. Task creation already starts an execution
        // in the current engine, so this returns that correlated execution idempotently.
        const taskExecuteMatch = subPath.match(/^\/tasks\/([^/]+)\/execute$/);
        if (taskExecuteMatch && req.method === "POST") {
          const id = normalizeId(taskExecuteMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }
          const task = service.getTask(id);
          if (!task) {
            sendError(404, "Task not found", "TASK_NOT_FOUND");
            return;
          }
          const taskTenant = (task.input?.metadata as Record<string, string> | undefined)?.callerTenantId;
          const authCheck = await authenticateAndAuthorize("task.execute", "TASK", id, taskTenant);
          if (!authCheck.ok) {
            if (authCheck.code === "SECURITY_TENANT_ISOLATION_VIOLATION") {
              sendError(404, "Task not found", "TASK_NOT_FOUND");
              return;
            }
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const execution = service.getExecutionForTask(id);
          if (!execution) {
            sendError(404, "Execution for task not found", "EXECUTION_NOT_FOUND");
            return;
          }
          sendJson(200, execution);
          return;
        }

        // GET /executions
        if (subPath === "/executions" && req.method === "GET") {
          sendJson(200, service.getExecutions());
          return;
        }

        // POST /executions (Submit task & execution)
        if (subPath === "/executions" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { agentId: rawAgentId, input, traceId: rawTraceId } = bodyResult.body;

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          const result = await service.submitExecution(agentId, input as Record<string, unknown>, traceId);
          sendJson(201, result);
          return;
        }

        // GET /executions/:id/timeline
        const timelineMatch = subPath.match(/^\/executions\/([^/]+)\/timeline$/);
        if (timelineMatch && req.method === "GET") {
          const id = normalizeId(timelineMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          const timeline = service.getExecutionTimeline(id);
          sendJson(200, timeline);
          return;
        }

        const executionEventsMatch = subPath.match(/^\/executions\/([^/]+)\/events$/);
        if (executionEventsMatch && req.method === "GET") {
          const id = normalizeId(executionEventsMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          if (!service.getExecution(id)) {
            sendError(404, "Execution not found", "EXECUTION_NOT_FOUND");
            return;
          }
          sendJson(200, service.getExecutionTimeline(id));
          return;
        }

        // GET /executions/:id
        const execMatch = subPath.match(/^\/executions\/([^/]+)$/);
        if (execMatch && req.method === "GET") {
          const id = normalizeId(execMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          const exec = service.getExecution(id);
          if (!exec) {
            sendError(404, "Execution not found", "NOT_FOUND");
            return;
          }

          sendJson(200, exec);
          return;
        }

        // POST /orchestrate
        if (subPath === "/orchestrate" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { operations: rawOperations, traceId: rawTraceId } = bodyResult.body;

          if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
            sendError(400, "Bad Request: 'operations' must be a non-empty array", "INVALID_OPERATIONS");
            return;
          }
          if (rawOperations.length > 50) {
            sendError(400, "Bad Request: 'operations' array cannot exceed 50 operations", "OPERATIONS_LIMIT_EXCEEDED");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          // Validate and normalize each operation
          const seenIds = new Set<string>();
          const normalizedOps: OperationDTO[] = [];
          for (let i = 0; i < rawOperations.length; i++) {
            const op = rawOperations[i];
            if (!op || typeof op !== "object" || Array.isArray(op)) {
              sendError(400, `Bad Request: operation at index ${i} must be an object`, "INVALID_OPERATION");
              return;
            }
            const id = normalizeId(op.id);
            if (!id) {
              sendError(400, `Bad Request: operation at index ${i} has invalid or missing 'id'`, "INVALID_OPERATION_ID");
              return;
            }
            if (seenIds.has(id)) {
              sendError(400, `Bad Request: duplicate operation id '${id}'`, "DUPLICATE_OPERATION_ID");
              return;
            }
            seenIds.add(id);

            if (op.kind !== "MODEL" && op.kind !== "TOOL") {
              sendError(400, `Bad Request: operation '${id}' must have kind 'MODEL' or 'TOOL'`, "INVALID_OPERATION_KIND");
              return;
            }
            let toolId: string | undefined = undefined;
            if (op.kind === "TOOL") {
              toolId = normalizeId(op.toolId);
              if (!toolId) {
                sendError(400, `Bad Request: tool operation '${id}' requires a valid 'toolId'`, "MISSING_TOOL_ID");
                return;
              }
            }
            if (!op.input || typeof op.input !== "object" || Array.isArray(op.input)) {
              sendError(400, `Bad Request: operation '${id}' requires an 'input' object`, "INVALID_OPERATION_INPUT");
              return;
            }
            normalizedOps.push({
              kind: op.kind,
              id,
              model: typeof op.model === "string" ? op.model.trim() : undefined,
              toolId,
              input: op.input as Record<string, unknown>,
              bindings: Array.isArray(op.bindings) ? op.bindings : undefined,
            });
          }

          const result = await service.executeOrchestration({ operations: normalizedOps, traceId });
          sendJson(200, result);
          return;
        }

        // GET /operations
        if (subPath === "/operations" && req.method === "GET") {
          sendJson(200, service.listOperations());
          return;
        }

        // POST /operations
        if (subPath === "/operations" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { id: rawId, agentId: rawAgentId, objective: rawObjective, budget: rawBudget, metadata } = bodyResult.body;

          let id: string | undefined = undefined;
          if (rawId !== undefined) {
            id = normalizeId(rawId);
            if (!id) {
              sendError(400, "Bad Request: 'id' if provided must be alphanumeric (1-128 chars)", "INVALID_ID");
              return;
            }
          }

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }

          if (typeof rawObjective !== "string" || !rawObjective.trim()) {
            sendError(400, "Bad Request: 'objective' is required and must be a non-empty string", "INVALID_OBJECTIVE");
            return;
          }
          if (rawObjective.length > 4096) {
            sendError(400, "Bad Request: 'objective' cannot exceed 4096 characters", "INVALID_OBJECTIVE");
            return;
          }

          if (!rawBudget || typeof rawBudget !== "object" || Array.isArray(rawBudget)) {
            sendError(400, "Bad Request: 'budget' is required and must be an object", "INVALID_BUDGET");
            return;
          }

          const b = rawBudget as Record<string, unknown>;
          if (typeof b.maxSteps !== "number" || !Number.isInteger(b.maxSteps) || b.maxSteps <= 0) {
            sendError(400, "Bad Request: 'budget.maxSteps' must be a positive integer", "INVALID_BUDGET");
            return;
          }
          if (typeof b.maxDurationMs !== "number" || !Number.isInteger(b.maxDurationMs) || b.maxDurationMs <= 0) {
            sendError(400, "Bad Request: 'budget.maxDurationMs' must be a positive integer", "INVALID_BUDGET");
            return;
          }
          if (typeof b.maxToolCalls !== "number" || !Number.isInteger(b.maxToolCalls) || b.maxToolCalls < 0) {
            sendError(400, "Bad Request: 'budget.maxToolCalls' must be a non-negative integer", "INVALID_BUDGET");
            return;
          }
          if (b.maxTokens !== undefined && (typeof b.maxTokens !== "number" || !Number.isInteger(b.maxTokens) || b.maxTokens < 0)) {
            sendError(400, "Bad Request: 'budget.maxTokens' if provided must be a non-negative integer", "INVALID_BUDGET");
            return;
          }

          const budgetDto = {
            maxSteps: b.maxSteps,
            maxDurationMs: b.maxDurationMs,
            maxToolCalls: b.maxToolCalls,
            maxTokens: typeof b.maxTokens === "number" ? b.maxTokens : undefined,
          };

          try {
            const detail = await service.createOperation({
              id,
              agentId,
              objective: rawObjective.trim(),
              budget: budgetDto,
              metadata: (metadata && typeof metadata === "object" && !Array.isArray(metadata)) ? metadata as Record<string, unknown> : undefined,
            });
            sendJson(201, detail);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentInactiveError) {
              sendError(400, err.message, "AGENT_INACTIVE");
              return;
            }
            if (err instanceof OperationConflictError) {
              sendError(409, err.message, "OPERATION_EXISTS");
              return;
            }
            if (
              err instanceof OperationValidationError ||
              err instanceof AutonomyBudgetValidationError ||
              err instanceof AutonomousOperationValidationError
            ) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // POST /operations/:id/cancel
        const operationCancelMatch = subPath.match(/^\/operations\/([^/]+)\/cancel$/);
        if (operationCancelMatch && req.method === "POST") {
          const id = normalizeId(operationCancelMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid operation ID format", "INVALID_ID");
            return;
          }
          let reason: string | undefined = undefined;
          const contentType = req.headers["content-type"];
          if (contentType) {
            const bodyResult = await readJsonBody();
            if (bodyResult.ok && typeof bodyResult.body.reason === "string") {
              reason = bodyResult.body.reason.trim();
            }
          }
          try {
            const updated = service.cancelOperation(id, reason);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof OperationNotFoundError) {
              sendError(404, err.message, "OPERATION_NOT_FOUND");
              return;
            }
            if (err instanceof OperationConflictError) {
              sendError(409, err.message, "OPERATION_CONFLICT");
              return;
            }
            throw err;
          }
        }

        // GET /operations/:id
        const operationDetailMatch = subPath.match(/^\/operations\/([^/]+)$/);
        if (operationDetailMatch && req.method === "GET") {
          const id = normalizeId(operationDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid operation ID format", "INVALID_ID");
            return;
          }
          const detail = service.getOperationDetail(id);
          if (!detail) {
            sendError(404, "Operation not found", "NOT_FOUND");
            return;
          }
          sendJson(200, detail);
          return;
        }

        // --- Diagnostics Endpoints (v0.9.2) ---

        // GET /diagnostics/traces/:traceId
        const traceMatch = subPath.match(/^\/diagnostics\/traces\/([^/]+)$/);
        if (traceMatch && req.method === "GET") {
          const traceId = normalizeId(traceMatch[1]);
          if (!traceId) {
            sendError(400, "Bad Request: Invalid trace ID format", "INVALID_ID");
            return;
          }
          const diagnostic = service.getTraceDiagnostics(traceId);
          if (!diagnostic) {
            sendError(404, "Trace not found", "NOT_FOUND");
            return;
          }
          sendJson(200, diagnostic);
          return;
        }

        // GET /diagnostics/recovery/history
        if (subPath === "/diagnostics/recovery/history" && req.method === "GET") {
          const history = service.getCrashRecoveryHistory();
          sendJson(200, { data: history, meta: { count: history.length } });
          return;
        }

        // GET /diagnostics/tasks/:taskId/timeline
        const taskDiagMatch = subPath.match(/^\/diagnostics\/tasks\/([^/]+)\/timeline$/);
        if (taskDiagMatch && req.method === "GET") {
          const taskId = normalizeId(taskDiagMatch[1]);
          if (!taskId) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }
          const timeline = service.getTaskDiagnostics(taskId);
          sendJson(200, { data: timeline, meta: { count: timeline.length } });
          return;
        }

        // GET /diagnostics/executions/:id/forensics
        const execForensicsMatch = subPath.match(/^\/diagnostics\/executions\/([^/]+)\/forensics$/);
        if (execForensicsMatch && req.method === "GET") {
          const execId = normalizeId(execForensicsMatch[1]);
          if (!execId) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          // Use trace lookup via execution's events
          const diagnostic = service.getTraceDiagnostics(execId);
          if (!diagnostic) {
            sendError(404, "Execution forensics not found", "NOT_FOUND");
            return;
          }
          sendJson(200, diagnostic);
          return;
        }

        // --- Paginated Listing Endpoints (v0.9.2) ---

        // GET /paginated/tasks
        if (subPath === "/paginated/tasks" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const offsetParam = url.searchParams.get("offset");
          const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
          const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;
          if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
            sendError(400, "Bad Request: 'limit' must be 1-500", "INVALID_LIMIT");
            return;
          }
          if (offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
            sendError(400, "Bad Request: 'offset' must be non-negative", "INVALID_OFFSET");
            return;
          }
          sendJson(200, service.getTasksPaginated({ limit, offset }));
          return;
        }

        // GET /paginated/executions
        if (subPath === "/paginated/executions" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const offsetParam = url.searchParams.get("offset");
          const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
          const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;
          if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
            sendError(400, "Bad Request: 'limit' must be 1-500", "INVALID_LIMIT");
            return;
          }
          if (offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
            sendError(400, "Bad Request: 'offset' must be non-negative", "INVALID_OFFSET");
            return;
          }
          sendJson(200, service.getExecutionsPaginated({ limit, offset }));
          return;
        }

        // GET /paginated/operations
        if (subPath === "/paginated/operations" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const offsetParam = url.searchParams.get("offset");
          const statusParam = url.searchParams.get("status");
          const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
          const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;
          if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
            sendError(400, "Bad Request: 'limit' must be 1-500", "INVALID_LIMIT");
            return;
          }
          if (offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
            sendError(400, "Bad Request: 'offset' must be non-negative", "INVALID_OFFSET");
            return;
          }
          sendJson(200, service.listOperationsPaginated({ limit, offset, status: statusParam?.trim() || undefined }));
          return;
        }

        // GET /paginated/agents
        if (subPath === "/paginated/agents" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const offsetParam = url.searchParams.get("offset");
          const statusParam = url.searchParams.get("status");
          const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
          const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;
          if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
            sendError(400, "Bad Request: 'limit' must be 1-500", "INVALID_LIMIT");
            return;
          }
          if (offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
            sendError(400, "Bad Request: 'offset' must be non-negative", "INVALID_OFFSET");
            return;
          }
          sendJson(200, service.listAgentsPaginated({ limit, offset, status: statusParam?.trim() || undefined }));
          return;
        }

        // --- Observability Endpoints (Prompt 98) ---

        // GET /observability/metrics
        if (subPath === "/observability/metrics" && req.method === "GET") {
          sendJson(200, service.getObservabilityService().getMetricsSnapshot());
          return;
        }

        // GET /observability/logs
        if (subPath === "/observability/logs" && req.method === "GET") {
          const limitParam = url.searchParams.get("limit");
          const levelParam = url.searchParams.get("level");
          const limit = limitParam ? parseInt(limitParam, 10) : 100;
          const level = levelParam as "DEBUG" | "INFO" | "WARN" | "ERROR" | undefined;
          sendJson(200, service.getObservabilityService().getLogs({ limit: Number.isNaN(limit) ? 100 : limit, level }));
          return;
        }

        // GET /observability/dependencies
        if (subPath === "/observability/dependencies" && req.method === "GET") {
          sendJson(200, service.checkDependencies());
          return;
        }

        // --- Document Generation Endpoint (Prompt 98) ---

        // POST /documents/generate
        if (subPath === "/documents/generate" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { type, tenantId, title, content, metadata } = bodyResult.body;
          if (!type || typeof type !== "string" || !title || typeof title !== "string" || !content || typeof content !== "object") {
            sendError(400, "Bad Request: type, title, and content are required", "INVALID_ARGUMENT");
            return;
          }
          try {
            const doc = service.getDocumentService().generateDocument({
              type: type as any,
              tenantId: typeof tenantId === "string" ? tenantId : reqCtx.tenantId,
              title,
              content: content as Record<string, unknown>,
              metadata: typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : undefined,
            });
            sendJson(201, doc);
            return;
          } catch (err: any) {
            sendError(400, err.message, "DOCUMENT_GENERATION_FAILED");
            return;
          }
        }

        // --- Business Devices & Printing Endpoints (Prompt 98) ---

        // GET /devices
        if (subPath === "/devices" && req.method === "GET") {
          const tenantFilter = url.searchParams.get("tenantId") || reqCtx.tenantId;
          const typeFilter = url.searchParams.get("type");
          const statusFilter = url.searchParams.get("status");
          const devices = service.getDeviceService().listDevices({
            tenantId: tenantFilter,
            type: typeFilter as any,
            status: statusFilter as any,
          });
          sendJson(200, { data: devices, count: devices.length });
          return;
        }

        // POST /devices
        if (subPath === "/devices" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const b = bodyResult.body;
          if (!b.id || typeof b.id !== "string" || !b.name || typeof b.name !== "string" || !b.type || typeof b.type !== "string") {
            sendError(400, "Bad Request: id, name, and type are required", "INVALID_ARGUMENT");
            return;
          }
          try {
            const registered = service.getDeviceService().registerDevice({
              id: b.id,
              name: b.name,
              type: b.type as any,
              model: typeof b.model === "string" ? b.model : undefined,
              tenantId: typeof b.tenantId === "string" ? b.tenantId : reqCtx.tenantId,
              status: typeof b.status === "string" ? (b.status as any) : "READY",
              connectivity: typeof b.connectivity === "string" ? (b.connectivity as any) : "LOCAL_USB",
              portOrAddress: typeof b.portOrAddress === "string" ? b.portOrAddress : undefined,
              capabilities: Array.isArray(b.capabilities) ? (b.capabilities as any) : ["RAW_PRINT"],
              metadata: typeof b.metadata === "object" && b.metadata !== null ? (b.metadata as Record<string, unknown>) : undefined,
            });
            sendJson(201, registered);
            return;
          } catch (err: any) {
            sendError(400, err.message, "DEVICE_REGISTRATION_FAILED");
            return;
          }
        }

        // GET /devices/:id/health
        const deviceHealthMatch = subPath.match(/^\/devices\/([^/]+)\/health$/);
        if (deviceHealthMatch && req.method === "GET") {
          const devId = normalizeId(deviceHealthMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          try {
            const health = await service.getDeviceService().checkDeviceHealth(devId, {
              tenantId: reqCtx.tenantId,
            });
            sendJson(200, health);
            return;
          } catch (err: any) {
            sendError(404, err.message, "DEVICE_NOT_FOUND");
            return;
          }
        }

        // GET /devices/:id/capabilities
        const deviceCapMatch = subPath.match(/^\/devices\/([^/]+)\/capabilities$/);
        if (deviceCapMatch && req.method === "GET") {
          const devId = normalizeId(deviceCapMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const dev = service.getDeviceService().getDevice(devId, { tenantId: reqCtx.tenantId });
          if (!dev) {
            sendError(404, `Device ${devId} not found`, "DEVICE_NOT_FOUND");
            return;
          }
          sendJson(200, {
            deviceId: dev.id,
            type: dev.type,
            capabilities: dev.capabilities,
            connection: dev.connection,
            model: dev.model,
          });
          return;
        }

        // GET /devices/:id/status
        const deviceStatusMatch = subPath.match(/^\/devices\/([^/]+)\/status$/);
        if (deviceStatusMatch && req.method === "GET") {
          const devId = normalizeId(deviceStatusMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const dev = service.getDeviceService().getDevice(devId, { tenantId: reqCtx.tenantId });
          if (!dev) {
            sendError(404, `Device ${devId} not found`, "DEVICE_NOT_FOUND");
            return;
          }
          sendJson(200, {
            deviceId: dev.id,
            status: dev.status,
            connection: dev.connection,
            lastSeen: dev.lastSeen,
          });
          return;
        }

        // GET /devices/:id/consumables
        const deviceConsumablesMatch = subPath.match(/^\/devices\/([^/]+)\/consumables$/);
        if (deviceConsumablesMatch && req.method === "GET") {
          const devId = normalizeId(deviceConsumablesMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const dev = service.getDeviceService().getDevice(devId, { tenantId: reqCtx.tenantId });
          if (!dev) {
            sendError(404, `Device ${devId} not found`, "DEVICE_NOT_FOUND");
            return;
          }
          sendJson(200, {
            deviceId: dev.id,
            consumablesStatus: "UNSUPPORTED",
            message: "Consumables querying is unsupported for local raw GDI printer without proprietary vendor drivers.",
          });
          return;
        }

        // POST /devices/:id/print-jobs
        const devicePrintJobsMatch = subPath.match(/^\/devices\/([^/]+)\/print-jobs$/);
        if (devicePrintJobsMatch && req.method === "POST") {
          const devId = normalizeId(devicePrintJobsMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const b = bodyResult.body;
          const idempotencyKey = (req.headers["idempotency-key"] as string) || (typeof b.idempotencyKey === "string" ? b.idempotencyKey : undefined);
          const tenantId = typeof b.tenantId === "string" ? b.tenantId : reqCtx.tenantId;
          const applicationId = typeof b.applicationId === "string" ? b.applicationId : reqCtx.applicationId;

          try {
            const job = await service.getDeviceService().submitPrintJob({
              deviceId: devId,
              tenantId,
              applicationId,
              title: typeof b.title === "string" ? b.title : "Print Document",
              documentType: typeof b.documentType === "string" ? (b.documentType as any) : "CUSTOM",
              payload: (typeof b.payload === "object" && b.payload !== null) ? (b.payload as Record<string, unknown>) : { content: b.content ?? "" },
              copies: typeof b.copies === "number" ? b.copies : 1,
              orientation: typeof b.orientation === "string" ? (b.orientation as any) : "PORTRAIT",
              idempotencyKey,
            }, {
              tenantId,
              applicationId,
              principal: reqCtx.principal,
            });
            sendJson(201, job);
            return;
          } catch (err: any) {
            if (err.message?.includes("Idempotency conflict")) {
              sendError(409, err.message, "IDEMPOTENCY_CONFLICT");
              return;
            }
            if (err.message?.includes("not found")) {
              sendError(404, err.message, "DEVICE_NOT_FOUND");
              return;
            }
            if (err.message?.includes("does not have required capability") || err.message?.includes("Suspended tenant")) {
              sendError(403, err.message, "FORBIDDEN");
              return;
            }
            sendError(400, err.message, "PRINT_JOB_FAILED");
            return;
          }
        }

        // GET /devices/:id/print-jobs
        if (devicePrintJobsMatch && req.method === "GET") {
          const devId = normalizeId(devicePrintJobsMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const tenantFilter = url.searchParams.get("tenantId") || (reqCtx.tenantId !== "tenant-default" ? reqCtx.tenantId : undefined);
          const jobs = service.getDeviceService().listPrintJobs({
            deviceId: devId,
            tenantId: tenantFilter,
          });
          sendJson(200, { data: jobs, count: jobs.length });
          return;
        }

        // GET /devices/:id/print-jobs/:jobId
        const devicePrintJobDetailMatch = subPath.match(/^\/devices\/([^/]+)\/print-jobs\/([^/]+)$/);
        if (devicePrintJobDetailMatch && req.method === "GET") {
          const devId = normalizeId(devicePrintJobDetailMatch[1]);
          const jobId = normalizeId(devicePrintJobDetailMatch[2]);
          if (!devId || !jobId) {
            sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
            return;
          }
          const job = service.getDeviceService().getPrintJob(jobId, { tenantId: reqCtx.tenantId });
          if (!job || job.deviceId !== devId) {
            sendError(404, `Print job ${jobId} not found for device ${devId}`, "PRINT_JOB_NOT_FOUND");
            return;
          }
          sendJson(200, job);
          return;
        }

        // POST /devices/:id/print-jobs/:jobId/cancel
        const devicePrintJobCancelMatch = subPath.match(/^\/devices\/([^/]+)\/print-jobs\/([^/]+)\/cancel$/);
        if (devicePrintJobCancelMatch && req.method === "POST") {
          const devId = normalizeId(devicePrintJobCancelMatch[1]);
          const jobId = normalizeId(devicePrintJobCancelMatch[2]);
          if (!devId || !jobId) {
            sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
            return;
          }
          let reason: string | undefined;
          const contentType = req.headers["content-type"];
          if (contentType) {
            const bodyResult = await readJsonBody();
            if (bodyResult.ok && typeof bodyResult.body.reason === "string") {
              reason = bodyResult.body.reason;
            }
          }
          try {
            const cancelled = service.getDeviceService().cancelPrintJob(jobId, reason, { tenantId: reqCtx.tenantId });
            sendJson(200, cancelled);
            return;
          } catch (err: any) {
            sendError(404, err.message, "PRINT_JOB_NOT_FOUND");
            return;
          }
        }

        // PATCH /devices/:id
        const devicePatchMatch = subPath.match(/^\/devices\/([^/]+)$/);
        if (devicePatchMatch && req.method === "PATCH") {
          const devId = normalizeId(devicePatchMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          try {
            const updated = service.getDeviceService().updateDevice(devId, bodyResult.body, { tenantId: reqCtx.tenantId });
            sendJson(200, updated);
            return;
          } catch (err: any) {
            sendError(404, err.message, "DEVICE_NOT_FOUND");
            return;
          }
        }

        // DELETE /devices/:id
        if (devicePatchMatch && req.method === "DELETE") {
          const devId = normalizeId(devicePatchMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const removed = service.getDeviceService().unregisterDevice(devId, { tenantId: reqCtx.tenantId });
          if (!removed) {
            sendError(404, `Device ${devId} not found`, "DEVICE_NOT_FOUND");
            return;
          }
          sendJson(200, { success: true, message: `Device ${devId} unregistered` });
          return;
        }

        // GET /devices/:id
        if (devicePatchMatch && req.method === "GET") {
          const devId = normalizeId(devicePatchMatch[1]);
          if (!devId) {
            sendError(400, "Bad Request: Invalid device ID format", "INVALID_ID");
            return;
          }
          const dev = service.getDeviceService().getDevice(devId, { tenantId: reqCtx.tenantId });
          if (!dev) {
            sendError(404, `Device ${devId} not found`, "DEVICE_NOT_FOUND");
            return;
          }
          sendJson(200, dev);
          return;
        }

        // ====================================================================
        // Organization / Virtual Organization Routes (Prompt 102)
        // Strictly registered under /api/v1/* (NOT under /api/platform/v1/*)
        // ====================================================================
        if (!isPlatformV1) {
          const handleOrgError = (err: any) => {
            if (err instanceof OrganizationValidationError || err instanceof InvalidHierarchyError || err instanceof BudgetValidationError || err instanceof ProfileValidationError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            if (err instanceof OrganizationNotFoundError) {
              sendError(404, err.message, "ORGANIZATION_NOT_FOUND");
              return;
            }
            if (err instanceof AreaNotFoundError) {
              sendError(404, err.message, "AREA_NOT_FOUND");
              return;
            }
            if (err instanceof TeamNotFoundError) {
              sendError(404, err.message, "TEAM_NOT_FOUND");
              return;
            }
            if (err instanceof ProfileNotFoundError) {
              sendError(404, err.message, "PROFILE_NOT_FOUND");
              return;
            }
            if (err instanceof CapabilityNotFoundError) {
              sendError(404, err.message, "CAPABILITY_NOT_FOUND");
              return;
            }
            if (err instanceof BudgetNotFoundError) {
              sendError(404, err.message, "BUDGET_NOT_FOUND");
              return;
            }
            if (err instanceof BudgetExhaustedError) {
              sendError(429, err.message, "BUDGET_EXHAUSTED");
              return;
            }
            if (err instanceof BudgetSuspendedError) {
              sendError(403, err.message, "BUDGET_SUSPENDED");
              return;
            }
            if (err instanceof OrganizationConflictError) {
              sendError(409, err.message, "ORGANIZATION_CONFLICT");
              return;
            }
            if (err instanceof MembershipConflictError) {
              sendError(409, err.message, "MEMBERSHIP_CONFLICT");
              return;
            }
            if (err instanceof CapabilityAlreadyExistsError) {
              sendError(409, err.message, "CAPABILITY_ALREADY_EXISTS");
              return;
            }
            if (err instanceof BudgetConcurrencyConflictError || err instanceof ProfileConcurrencyConflictError) {
              sendError(409, err.message, "CONCURRENCY_CONFLICT");
              return;
            }
            if (err instanceof CrossTenantOrganizationError) {
              sendError(403, err.message, "CROSS_TENANT_FORBIDDEN");
              return;
            }
            if (err instanceof CoordinationCycleError) {
              sendError(400, err.message, "COORDINATION_CYCLE");
              return;
            }
            if (err instanceof CoordinationDepthExceededError) {
              sendError(400, err.message, "COORDINATION_DEPTH_EXCEEDED");
              return;
            }
            if (err instanceof CoordinationDomainError) {
              sendError(400, err.message, "COORDINATION_ERROR");
              return;
            }
            sendError(500, err.message || "Internal organization error", "ORGANIZATION_ERROR");
          };


          // GET /organizations
          if (subPath === "/organizations" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("organization.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const orgs = await service.getOrganizationService().listOrganizations(tenantId);
              const orgDTOs = await Promise.all(orgs.map(async (org) => {
                const areas = await service.getOrganizationService().listAreas(org.organizationId, tenantId);
                let teamsCount = 0;
                for (const area of areas) {
                  const teams = await service.getOrganizationService().listTeams(area.areaId, tenantId);
                  teamsCount += teams.length;
                }
                return service.toOrganizationDTO(org, { areasCount: areas.length, teamsCount });
              }));
              sendJson(200, orgDTOs);
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /organizations
          if (subPath === "/organizations" && req.method === "POST") {
            const authCheck = await authenticateAndAuthorize("organization.create", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { id?: string; name?: string; description?: string };
            try {
              const org = await service.getOrganizationService().createOrganization({
                id: body.id as string,
                name: body.name as string,
                description: body.description,
                tenantId,
              });
              sendJson(201, service.toOrganizationDTO(org, { areasCount: 0, teamsCount: 0 }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // Hierarchy route: GET /organizations/:id/hierarchy
          const orgHierarchyMatch = subPath.match(/^\/organizations\/([^/]+)\/hierarchy$/);
          if (orgHierarchyMatch && req.method === "GET") {
            const orgId = normalizeId(orgHierarchyMatch[1]);
            if (!orgId) {
              sendError(400, "Bad Request: Invalid organization ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", orgId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const hierarchy = await service.getOrganizationService().getOrganizationHierarchy(orgId, tenantId);
              sendJson(200, {
                organization: service.toOrganizationDTO(hierarchy.organization),
                areas: hierarchy.areas.map((a) => ({
                  area: service.toAreaDTO(a.area),
                  teams: a.teams.map((t) => ({
                    team: service.toTeamDTO(t.team),
                    members: t.members.map((m) => service.toAgentMembershipDTO(m)),
                  })),
                })),
              });
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // Areas of Organization: GET /organizations/:id/areas
          const orgAreasMatch = subPath.match(/^\/organizations\/([^/]+)\/areas$/);
          if (orgAreasMatch && req.method === "GET") {
            const orgId = normalizeId(orgAreasMatch[1]);
            if (!orgId) {
              sendError(400, "Bad Request: Invalid organization ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", orgId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              await service.getOrganizationService().getOrganization(orgId, tenantId);
              const areas = await service.getOrganizationService().listAreas(orgId, tenantId);
              const areaDTOs = await Promise.all(areas.map(async (area) => {
                const teams = await service.getOrganizationService().listTeams(area.areaId, tenantId);
                return service.toAreaDTO(area, { teamsCount: teams.length });
              }));
              sendJson(200, areaDTOs);
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /organizations/:id/areas
          if (orgAreasMatch && req.method === "POST") {
            const orgId = normalizeId(orgAreasMatch[1]);
            if (!orgId) {
              sendError(400, "Bad Request: Invalid organization ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", orgId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { id?: string; name?: string; description?: string };
            try {
              const area = await service.getOrganizationService().createArea({
                id: body.id as string,
                organizationId: orgId,
                tenantId,
                name: body.name as string,
                description: body.description,
              });
              sendJson(201, service.toAreaDTO(area, { teamsCount: 0 }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /organizations/:id
          const orgDetailMatch = subPath.match(/^\/organizations\/([^/]+)$/);
          if (orgDetailMatch && req.method === "GET") {
            const orgId = normalizeId(orgDetailMatch[1]);
            if (!orgId) {
              sendError(400, "Bad Request: Invalid organization ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", orgId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const org = await service.getOrganizationService().getOrganization(orgId, tenantId);
              const areas = await service.getOrganizationService().listAreas(orgId, tenantId);
              let teamsCount = 0;
              for (const area of areas) {
                const teams = await service.getOrganizationService().listTeams(area.areaId, tenantId);
                teamsCount += teams.length;
              }
              sendJson(200, service.toOrganizationDTO(org, { areasCount: areas.length, teamsCount }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // PATCH /organizations/:id
          if (orgDetailMatch && req.method === "PATCH") {
            const orgId = normalizeId(orgDetailMatch[1]);
            if (!orgId) {
              sendError(400, "Bad Request: Invalid organization ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", orgId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { name?: string; description?: string; status?: any };
            try {
              const updated = await service.getOrganizationService().updateOrganization(
                orgId,
                {
                  ...(typeof body.name === "string" ? { name: body.name } : {}),
                  ...(typeof body.description === "string" ? { description: body.description } : {}),
                  ...(body.status !== undefined ? { status: body.status } : {}),
                },
                tenantId
              );
              sendJson(200, service.toOrganizationDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // Teams of Area: GET /areas/:id/teams
          const areaTeamsMatch = subPath.match(/^\/areas\/([^/]+)\/teams$/);
          if (areaTeamsMatch && req.method === "GET") {
            const areaId = normalizeId(areaTeamsMatch[1]);
            if (!areaId) {
              sendError(400, "Bad Request: Invalid area ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", areaId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              await service.getOrganizationService().getArea(areaId, tenantId);
              const teams = await service.getOrganizationService().listTeams(areaId, tenantId);
              const teamDTOs = await Promise.all(teams.map(async (team) => {
                const members = await service.getOrganizationService().listTeamMemberships(team.teamId, tenantId);
                return service.toTeamDTO(team, { membersCount: members.length });
              }));
              sendJson(200, teamDTOs);
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /areas/:id/teams
          if (areaTeamsMatch && req.method === "POST") {
            const areaId = normalizeId(areaTeamsMatch[1]);
            if (!areaId) {
              sendError(400, "Bad Request: Invalid area ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", areaId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { id?: string; organizationId?: string; name?: string; description?: string };
            try {
              const area = await service.getOrganizationService().getArea(areaId, tenantId);
              const orgId = typeof body.organizationId === "string" && body.organizationId.trim() ? body.organizationId.trim() : area.organizationId;
              const team = await service.getOrganizationService().createTeam({
                id: body.id as string,
                areaId,
                organizationId: orgId,
                tenantId,
                name: body.name as string,
                description: body.description,
              });
              sendJson(201, service.toTeamDTO(team, { membersCount: 0 }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /areas/:id
          const areaDetailMatch = subPath.match(/^\/areas\/([^/]+)$/);
          if (areaDetailMatch && req.method === "GET") {
            const areaId = normalizeId(areaDetailMatch[1]);
            if (!areaId) {
              sendError(400, "Bad Request: Invalid area ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", areaId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const area = await service.getOrganizationService().getArea(areaId, tenantId);
              const teams = await service.getOrganizationService().listTeams(areaId, tenantId);
              sendJson(200, service.toAreaDTO(area, { teamsCount: teams.length }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // Team agent membership routes:
          // DELETE /teams/:id/agents/:agentId
          const teamAgentDeleteMatch = subPath.match(/^\/teams\/([^/]+)\/agents\/([^/]+)$/);
          if (teamAgentDeleteMatch && req.method === "DELETE") {
            const teamId = normalizeId(teamAgentDeleteMatch[1]);
            const agentId = normalizeId(teamAgentDeleteMatch[2]);
            if (!teamId || !agentId) {
              sendError(400, "Bad Request: Invalid team ID or agent ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              await service.getOrganizationService().removeAgent(teamId, agentId, tenantId);
              sendJson(200, { success: true, message: `Agent ${agentId} removed from team ${teamId}` });
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /teams/:id/agents
          const teamAgentsMatch = subPath.match(/^\/teams\/([^/]+)\/agents$/);
          if (teamAgentsMatch && req.method === "GET") {
            const teamId = normalizeId(teamAgentsMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              await service.getOrganizationService().getTeam(teamId, tenantId);
              const members = await service.getOrganizationService().listTeamMemberships(teamId, tenantId);
              sendJson(200, members.map((m) => service.toAgentMembershipDTO(m)));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /teams/:id/agents
          if (teamAgentsMatch && req.method === "POST") {
            const teamId = normalizeId(teamAgentsMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { agentId?: string; role?: any };
            try {
              const team = await service.getOrganizationService().getTeam(teamId, tenantId);
              const membership = await service.getOrganizationService().assignAgent({
                teamId,
                agentId: body.agentId as string,
                tenantId,
                organizationId: team.organizationId,
                role: body.role ?? "OPERATOR",
              });
              sendJson(201, service.toAgentMembershipDTO(membership));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /teams/:id
          const teamDetailMatch = subPath.match(/^\/teams\/([^/]+)$/);
          if (teamDetailMatch && req.method === "GET") {
            const teamId = normalizeId(teamDetailMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const team = await service.getOrganizationService().getTeam(teamId, tenantId);
              const members = await service.getOrganizationService().listTeamMemberships(teamId, tenantId);
              sendJson(200, service.toTeamDTO(team, { membersCount: members.length }));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /teams/:id/budget
          const teamBudgetMatch = subPath.match(/^\/teams\/([^/]+)\/budget$/);
          if (teamBudgetMatch && req.method === "GET") {
            const teamId = normalizeId(teamBudgetMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const budget = await service.getTeamResourceBudgetService().getBudget(teamId, tenantId);
              sendJson(200, service.toTeamResourceBudgetDTO(budget));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /teams/:id/budget
          if (teamBudgetMatch && req.method === "POST") {
            const teamId = normalizeId(teamBudgetMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { id?: string; limits?: any; window?: any };
            try {
              const budget = await service.getTeamResourceBudgetService().createBudget({
                id: body.id,
                teamId,
                tenantId,
                limits: body.limits,
                window: body.window,
              });
              sendJson(201, service.toTeamResourceBudgetDTO(budget));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // PATCH /teams/:id/budget
          if (teamBudgetMatch && req.method === "PATCH") {
            const teamId = normalizeId(teamBudgetMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as { limits?: any; status?: "ACTIVE" | "SUSPENDED" };
            try {
              if (body.status === "SUSPENDED") {
                await service.getTeamResourceBudgetService().suspendBudget(teamId, tenantId);
              } else if (body.status === "ACTIVE") {
                await service.getTeamResourceBudgetService().reactivateBudget(teamId, tenantId);
              }
              let updatedBudget;
              if (body.limits) {
                updatedBudget = await service.getTeamResourceBudgetService().updateBudget(teamId, tenantId, body.limits);
              } else {
                updatedBudget = await service.getTeamResourceBudgetService().getBudget(teamId, tenantId);
              }
              sendJson(200, service.toTeamResourceBudgetDTO(updatedBudget));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /teams/:id/budget/authorize or /teams/:id/budget/consume
          const teamBudgetActionMatch = subPath.match(/^\/teams\/([^/]+)\/budget\/(authorize|consume)$/);
          if (teamBudgetActionMatch && req.method === "POST") {
            const teamId = normalizeId(teamBudgetActionMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as Record<string, unknown>;
            try {
              const result = await service.getTeamResourceBudgetService().evaluateAndConsume(
                teamId,
                tenantId,
                body,
                reqCtx.correlationId
              );
              if (result.allowed) {
                sendJson(200, {
                  allowed: true,
                  budget: result.budget ? service.toTeamResourceBudgetDTO(result.budget) : undefined,
                  remaining: result.remaining,
                });
              } else {
                sendJson(429, {
                  allowed: false,
                  reason: result.reason,
                });
              }
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // Team Agent Coordination routes (Prompt 109):
          // POST /teams/:id/coordinations or /teams/:id/coordination
          const teamCoordinationMatch = subPath.match(/^\/teams\/([^/]+)\/coordinations?$/);
          if (teamCoordinationMatch && req.method === "POST") {
            const teamId = normalizeId(teamCoordinationMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              id?: string;
              organizationId?: string;
              sourceAgentId?: string;
              targetAgentId?: string;
              purpose?: string;
              inputPayload?: Record<string, unknown>;
              correlationId?: string;
              parentExecutionId?: string;
              depth?: number;
              maxDepth?: number;
              handoffCount?: number;
              maxHandoffs?: number;
              history?: string[];
              requestedTokens?: number;
              requestedCost?: number;
              estimatedDurationMs?: number;
            };

            if (!body.sourceAgentId || typeof body.sourceAgentId !== "string" || !body.sourceAgentId.trim()) {
              sendError(400, "Bad Request: 'sourceAgentId' must be a non-empty string", "INVALID_SOURCE_AGENT");
              return;
            }
            if (!body.targetAgentId || typeof body.targetAgentId !== "string" || !body.targetAgentId.trim()) {
              sendError(400, "Bad Request: 'targetAgentId' must be a non-empty string", "INVALID_TARGET_AGENT");
              return;
            }
            if (!body.purpose || typeof body.purpose !== "string" || !body.purpose.trim()) {
              sendError(400, "Bad Request: 'purpose' must be a non-empty string", "INVALID_PURPOSE");
              return;
            }

            try {
              const team = await service.getOrganizationService().getTeam(teamId, tenantId);
              const orgId = typeof body.organizationId === "string" && body.organizationId.trim()
                ? body.organizationId.trim()
                : team.organizationId;

              const result = await service.getOrganizationalCoordinationService().coordinate(
                {
                  id: body.id,
                  tenantId,
                  organizationId: orgId,
                  teamId,
                  sourceAgentId: body.sourceAgentId,
                  targetAgentId: body.targetAgentId,
                  requesterId: authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "anonymous",
                  correlationId: body.correlationId ?? reqCtx.correlationId,
                  parentExecutionId: body.parentExecutionId,
                  purpose: body.purpose,
                  inputPayload: body.inputPayload ?? {},
                  depth: body.depth,
                  maxDepth: body.maxDepth,
                  handoffCount: body.handoffCount,
                  maxHandoffs: body.maxHandoffs,
                  history: body.history,
                  requestedTokens: body.requestedTokens,
                  requestedCost: body.requestedCost,
                  estimatedDurationMs: body.estimatedDurationMs,
                },
                reqCtx.correlationId
              );

              sendJson(result.success ? 201 : 422, {
                success: result.success,
                coordination: service.toAgentCoordinationDTO(result.record),
                executionId: result.executionId,
                output: result.output,
                error: result.error,
              });
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /teams/:id/coordinations or /teams/:id/coordination
          if (teamCoordinationMatch && req.method === "GET") {
            const teamId = normalizeId(teamCoordinationMatch[1]);
            if (!teamId) {
              sendError(400, "Bad Request: Invalid team ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", teamId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const limit = url.searchParams.has("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 50;
            const offset = url.searchParams.has("offset") ? parseInt(url.searchParams.get("offset")!, 10) : 0;

            try {
              const records = await service.getOrganizationalCoordinationService().listTeamCoordinations(
                teamId,
                tenantId,
                Number.isNaN(limit) ? 50 : limit,
                Number.isNaN(offset) ? 0 : offset
              );
              sendJson(200, records.map((r) => service.toAgentCoordinationDTO(r)));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /coordinations/:id or /coordination/:id
          const singleCoordMatch = subPath.match(/^\/coordinations?\/([^/]+)$/);
          if (singleCoordMatch && req.method === "GET") {
            const coordId = normalizeId(singleCoordMatch[1]);
            if (!coordId) {
              sendError(400, "Bad Request: Invalid coordination ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.read", "API", coordId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;

            try {
              const record = await service.getOrganizationalCoordinationService().getCoordination(coordId, tenantId);
              sendJson(200, service.toAgentCoordinationDTO(record));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // ====================================================================
          // Agent Role, Responsibility & Capability Governance (Prompt 110)
          // ====================================================================

          // GET /agents/discover
          if (subPath === "/agents/discover" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("agent.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const role = url.searchParams.get("role") ?? undefined;
            const responsibilitiesParam = url.searchParams.get("responsibilities") ?? url.searchParams.get("responsibility");
            const responsibility = responsibilitiesParam
              ? (responsibilitiesParam.split(",")[0]?.trim() || undefined)
              : undefined;
            const capabilitiesParam = url.searchParams.get("capabilities") ?? url.searchParams.get("capabilityId");
            const capabilityId = capabilitiesParam
              ? (capabilitiesParam.split(",")[0]?.trim() || undefined)
              : undefined;
            const status = url.searchParams.get("status") ?? undefined;
            const organizationId = url.searchParams.get("organizationId") ?? undefined;
            const teamId = url.searchParams.get("teamId") ?? undefined;
            const limitParam = url.searchParams.get("limit");
            const limit = limitParam ? parseInt(limitParam, 10) : undefined;

            try {
              const profiles = await service.getAgentProfileService().discoverAgents({
                tenantId,
                role: role as any,
                responsibility,
                capabilityId,
                status: status as any,
                organizationId,
                teamId,
                limit: Number.isNaN(limit as any) ? undefined : limit,
              });
              sendJson(200, profiles.map((p) => service.toAgentProfileDTO(p)));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /agents/discover
          if (subPath === "/agents/discover" && req.method === "POST") {
            const authCheck = await authenticateAndAuthorize("agent.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              role?: any;
              responsibilities?: string[];
              responsibility?: string;
              capabilities?: string[];
              capabilityId?: string;
              status?: any;
              organizationId?: string;
              teamId?: string;
              limit?: number;
            };

            const responsibility = Array.isArray(body.responsibilities) && body.responsibilities.length > 0
              ? (body.responsibilities[0]?.trim() || undefined)
              : typeof body.responsibility === "string"
              ? (body.responsibility.trim() || undefined)
              : undefined;

            const capabilityId = Array.isArray(body.capabilities) && body.capabilities.length > 0
              ? (body.capabilities[0]?.trim() || undefined)
              : typeof body.capabilityId === "string"
              ? (body.capabilityId.trim() || undefined)
              : undefined;

            try {
              const profiles = await service.getAgentProfileService().discoverAgents({
                tenantId,
                role: body.role,
                responsibility,
                capabilityId,
                status: body.status,
                organizationId: body.organizationId,
                teamId: body.teamId,
                limit: typeof body.limit === "number" ? body.limit : undefined,
              });
              sendJson(200, profiles.map((p) => service.toAgentProfileDTO(p)));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // GET /agents/:id/profile
          const agentProfileMatch = subPath.match(/^\/agents\/([^/]+)\/profile$/);
          if (agentProfileMatch && req.method === "GET") {
            const agentId = normalizeId(agentProfileMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.read", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;

            try {
              const profile = await service.getAgentProfileService().getProfile(agentId, tenantId);
              sendJson(200, service.toAgentProfileDTO(profile));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /agents/:id/profile (Create profile)
          if (agentProfileMatch && req.method === "POST") {
            const agentId = normalizeId(agentProfileMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              organizationId?: string;
              teamId?: string;
              role?: any;
              responsibilities?: string[];
              capabilities?: any[];
              status?: any;
            };

            try {
              const profile = await service.getAgentProfileService().createProfile({
                agentId,
                tenantId,
                organizationId: body.organizationId ?? "",
                teamId: body.teamId ?? "",
                role: body.role,
                responsibilities: body.responsibilities,
                capabilities: body.capabilities,
                status: body.status,
              });
              sendJson(201, service.toAgentProfileDTO(profile));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // PATCH /agents/:id/profile or PUT /agents/:id/profile (Update profile)
          if (agentProfileMatch && (req.method === "PATCH" || req.method === "PUT")) {
            const agentId = normalizeId(agentProfileMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              expectedVersion?: number;
              role?: any;
              responsibilities?: string[];
              status?: any;
              metadata?: Record<string, unknown>;
            };

            try {
              let updated = await service.getAgentProfileService().getProfile(agentId, tenantId);

              if (body.role !== undefined) {
                updated = await service.getAgentProfileService().updateRole(agentId, body.role, tenantId);
              }
              if (body.responsibilities !== undefined) {
                updated = await service.getAgentProfileService().updateResponsibilities(agentId, body.responsibilities, tenantId);
              }
              if (body.status !== undefined) {
                updated = await service.getAgentProfileService().setStatus(agentId, body.status, tenantId);
              }

              sendJson(200, service.toAgentProfileDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /agents/:id/capabilities (Add capability)
          const agentCapabilitiesMatch = subPath.match(/^\/agents\/([^/]+)\/capabilities$/);
          if (agentCapabilitiesMatch && req.method === "POST") {
            const agentId = normalizeId(agentCapabilitiesMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              id?: string;
              name?: string;
              version?: string;
              description?: string;
              category?: string;
              status?: any;
              metadata?: Record<string, unknown>;
            };

            if (!body.id || typeof body.id !== "string" || !body.id.trim()) {
              sendError(400, "Bad Request: 'id' is required for capability", "INVALID_ID");
              return;
            }
            if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
              sendError(400, "Bad Request: 'name' is required for capability", "INVALID_NAME");
              return;
            }

            try {
              const updated = await service.getAgentProfileService().addCapability(
                agentId,
                {
                  id: body.id.trim(),
                  name: body.name.trim(),
                  version: typeof body.version === "string" ? body.version.trim() : undefined,
                  description: typeof body.description === "string" ? body.description.trim() : undefined,
                  category: typeof body.category === "string" ? body.category.trim() : undefined,
                  status: body.status,
                  metadata: body.metadata,
                },
                tenantId
              );
              sendJson(201, service.toAgentProfileDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /agents/:id/capabilities/:capId/verify
          const capVerifyMatch = subPath.match(/^\/agents\/([^/]+)\/capabilities\/([^/]+)\/verify$/);
          if (capVerifyMatch && req.method === "POST") {
            const agentId = normalizeId(capVerifyMatch[1]);
            const capId = normalizeId(capVerifyMatch[2]);
            if (!agentId || !capId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as { verifiedBy?: string }) : {};
            const verifiedBy = body.verifiedBy ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system";

            try {
              const updated = await service.getAgentProfileService().verifyCapability(
                agentId,
                capId,
                verifiedBy,
                tenantId
              );
              sendJson(200, service.toAgentProfileDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // POST /agents/:id/capabilities/:capId/disable
          const capDisableMatch = subPath.match(/^\/agents\/([^/]+)\/capabilities\/([^/]+)\/disable$/);
          if (capDisableMatch && req.method === "POST") {
            const agentId = normalizeId(capDisableMatch[1]);
            const capId = normalizeId(capDisableMatch[2]);
            if (!agentId || !capId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;

            try {
              const updated = await service.getAgentProfileService().disableCapability(
                agentId,
                capId,
                tenantId
              );
              sendJson(200, service.toAgentProfileDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }

          // DELETE /agents/:id/capabilities/:capId
          const capDeleteMatch = subPath.match(/^\/agents\/([^/]+)\/capabilities\/([^/]+)$/);
          if (capDeleteMatch && req.method === "DELETE") {
            const agentId = normalizeId(capDeleteMatch[1]);
            const capId = normalizeId(capDeleteMatch[2]);
            if (!agentId || !capId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("organization.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;

            try {
              const updated = await service.getAgentProfileService().removeCapability(
                agentId,
                capId,
                tenantId
              );
              sendJson(200, service.toAgentProfileDTO(updated));
              return;
            } catch (err: any) {
              handleOrgError(err);
              return;
            }
          }


          // ====================================================================
          // Agent Lifecycle & Evaluation Governance Routes (Phase 65 / Prompt 114)
          // ====================================================================
          const handleAgentLifecycleError = (err: any) => {
            if (err instanceof AgentLifecycleValidationError || err instanceof InvalidLifecycleTransitionError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            if (err instanceof SelfGovernanceError) {
              sendError(403, err.message, "SELF_GOVERNANCE_DENIED");
              return;
            }
            if (err instanceof AgentLifecycleTenantMismatchError) {
              sendError(403, err.message, "TENANT_MISMATCH");
              return;
            }
            if (err instanceof AgentLifecycleNotFoundError || err instanceof AgentEvaluationNotFoundError) {
              sendError(404, err.message, "NOT_FOUND");
              return;
            }
            if (err instanceof AgentLifecycleConcurrencyConflictError || err instanceof AgentEvaluationConcurrencyConflictError) {
              sendError(409, err.message, "CONCURRENCY_CONFLICT");
              return;
            }
            if (err instanceof AgentSuspendedError) {
              sendError(422, err.message, "AGENT_SUSPENDED");
              return;
            }
            if (err instanceof AgentRevokedError) {
              sendError(422, err.message, "AGENT_REVOKED");
              return;
            }
            if (err instanceof AgentDeprecatedError) {
              sendError(422, err.message, "AGENT_DEPRECATED");
              return;
            }
            if (err instanceof AgentNotQualifiedError || err instanceof AgentEvaluationExpiredError) {
              sendError(422, err.message, "NOT_QUALIFIED");
              return;
            }
            sendError(500, err.message || "Internal server error in agent lifecycle", "INTERNAL_ERROR");
          };

          // GET /agents/:id/lifecycle
          const agentLifecycleGetMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle$/);
          if (agentLifecycleGetMatch && req.method === "GET") {
            const agentId = normalizeId(agentLifecycleGetMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.read", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;

            try {
              const lc = await service.getAgentLifecycleService().getOrCreateLifecycle(agentId, tenantId);
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/lifecycle/transition
          const agentLifecycleTransitionMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle\/transition$/);
          if (agentLifecycleTransitionMatch && req.method === "POST") {
            const agentId = normalizeId(agentLifecycleTransitionMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const operatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              targetState?: AgentLifecycleState;
              reason?: string;
              operatorPrincipalId?: string;
              expectedVersion?: number;
            };

            if (!body.targetState) {
              sendError(400, "Bad Request: 'targetState' is required", "INVALID_STATE");
              return;
            }

            try {
              let lc: AgentLifecycle;
              const op = body.operatorPrincipalId ?? operatorPrincipalId;
              switch (body.targetState) {
                case "ACTIVE":
                  lc = await service.getAgentLifecycleService().activateAgent({
                    agentId,
                    tenantId,
                    operatorPrincipalId: op,
                    expectedVersion: body.expectedVersion,
                  });
                  break;
                case "SUSPENDED":
                  lc = await service.getAgentLifecycleService().suspendAgent({
                    agentId,
                    tenantId,
                    operatorPrincipalId: op,
                    reason: body.reason ?? "Manual suspension",
                    expectedVersion: body.expectedVersion,
                  });
                  break;
                case "REVOKED":
                  lc = await service.getAgentLifecycleService().revokeAgent({
                    agentId,
                    tenantId,
                    operatorPrincipalId: op,
                    reason: body.reason ?? "Manual revocation",
                    expectedVersion: body.expectedVersion,
                  });
                  break;
                case "DEPRECATED":
                  lc = await service.getAgentLifecycleService().deprecateAgent({
                    agentId,
                    tenantId,
                    operatorPrincipalId: op,
                    reason: body.reason ?? "Manual deprecation",
                    expectedVersion: body.expectedVersion,
                  });
                  break;
                default:
                  sendError(400, `Unsupported lifecycle transition target state '${body.targetState}'`, "INVALID_STATE");
                  return;
              }
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/lifecycle/activate
          const agentActivateLifecycleMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle\/activate$/);
          if (agentActivateLifecycleMatch && req.method === "POST") {
            const agentId = normalizeId(agentActivateLifecycleMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const operatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            const body = (bodyResult.ok ? bodyResult.body : {}) as {
              operatorPrincipalId?: string;
              expectedVersion?: number;
            };

            try {
              const lc = await service.getAgentLifecycleService().activateAgent({
                agentId,
                tenantId,
                operatorPrincipalId: body.operatorPrincipalId ?? operatorPrincipalId,
                expectedVersion: body.expectedVersion,
              });
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/lifecycle/suspend
          const agentSuspendMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle\/suspend$/);
          if (agentSuspendMatch && req.method === "POST") {
            const agentId = normalizeId(agentSuspendMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const operatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              reason?: string;
              operatorPrincipalId?: string;
              expectedVersion?: number;
            };
            if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
              sendError(400, "Bad Request: 'reason' is required to suspend an agent", "INVALID_REASON");
              return;
            }

            try {
              const lc = await service.getAgentLifecycleService().suspendAgent({
                agentId,
                tenantId,
                operatorPrincipalId: body.operatorPrincipalId ?? operatorPrincipalId,
                reason: body.reason,
                expectedVersion: body.expectedVersion,
              });
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/lifecycle/revoke
          const agentRevokeMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle\/revoke$/);
          if (agentRevokeMatch && req.method === "POST") {
            const agentId = normalizeId(agentRevokeMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const operatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              reason?: string;
              operatorPrincipalId?: string;
              expectedVersion?: number;
            };
            if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
              sendError(400, "Bad Request: 'reason' is required to revoke an agent", "INVALID_REASON");
              return;
            }

            try {
              const lc = await service.getAgentLifecycleService().revokeAgent({
                agentId,
                tenantId,
                operatorPrincipalId: body.operatorPrincipalId ?? operatorPrincipalId,
                reason: body.reason,
                expectedVersion: body.expectedVersion,
              });
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/lifecycle/deprecate
          const agentDeprecateMatch = subPath.match(/^\/agents\/([^/]+)\/lifecycle\/deprecate$/);
          if (agentDeprecateMatch && req.method === "POST") {
            const agentId = normalizeId(agentDeprecateMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const operatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              reason?: string;
              operatorPrincipalId?: string;
              expectedVersion?: number;
            };
            if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
              sendError(400, "Bad Request: 'reason' is required to deprecate an agent", "INVALID_REASON");
              return;
            }

            try {
              const lc = await service.getAgentLifecycleService().deprecateAgent({
                agentId,
                tenantId,
                operatorPrincipalId: body.operatorPrincipalId ?? operatorPrincipalId,
                reason: body.reason,
                expectedVersion: body.expectedVersion,
              });
              sendJson(200, service.toAgentLifecycleDTO(lc));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/evaluations/:evalId/complete
          const agentEvalCompleteMatch = subPath.match(/^\/agents\/([^/]+)\/evaluations\/([^/]+)\/complete$/);
          if (agentEvalCompleteMatch && req.method === "POST") {
            const agentId = normalizeId(agentEvalCompleteMatch[1]);
            const evalId = normalizeId(agentEvalCompleteMatch[2]);
            if (!agentId || !evalId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const evaluatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              verdict?: EvaluationVerdict;
              evidence?: Readonly<Record<string, unknown>>;
              expiresAt?: string;
              expectedVersion?: number;
              evaluatorPrincipalId?: string;
              autoTransitionLifecycle?: boolean;
            };

            if (!body.verdict || (body.verdict !== "PASS" && body.verdict !== "FAIL")) {
              sendError(400, "Bad Request: 'verdict' must be either 'PASS' or 'FAIL' to complete evaluation", "INVALID_VERDICT");
              return;
            }

            try {
              const completed = await service.getAgentLifecycleService().completeEvaluation({
                id: evalId,
                tenantId,
                verdict: body.verdict as "PASS" | "FAIL",
                evidence: body.evidence,
                expectedVersion: body.expectedVersion,
                autoTransitionLifecycle: body.autoTransitionLifecycle,
              });
              sendJson(200, service.toAgentEvaluationDTO(completed));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // POST /agents/:id/evaluations
          const agentEvaluationsPostMatch = subPath.match(/^\/agents\/([^/]+)\/evaluations$/);
          if (agentEvaluationsPostMatch && req.method === "POST") {
            const agentId = normalizeId(agentEvaluationsPostMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.update", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const evaluatorPrincipalId = authCheck.context?.principal?.id ?? "system";

            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as {
              id?: string;
              evaluatorPrincipalId?: string;
              evaluationType: EvaluationType;
              verdict?: EvaluationVerdict;
              criteriaReference: string;
              evidence?: Readonly<Record<string, unknown>>;
              expiresAt?: string;
              metadata?: Readonly<Record<string, unknown>>;
              autoTransitionLifecycle?: boolean;
            };

            if (!body.evaluationType) {
              sendError(400, "Bad Request: 'evaluationType' is required", "INVALID_EVALUATION_TYPE");
              return;
            }
            if (!body.criteriaReference) {
              sendError(400, "Bad Request: 'criteriaReference' is required", "INVALID_CRITERIA");
              return;
            }

            try {
              const evaluation = await service.getAgentLifecycleService().evaluateAgent({
                id: body.id,
                tenantId,
                agentId,
                evaluatorPrincipalId: body.evaluatorPrincipalId ?? evaluatorPrincipalId,
                evaluationType: body.evaluationType,
                verdict: body.verdict,
                criteriaReference: body.criteriaReference,
                evidence: body.evidence,
                expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
                metadata: body.metadata,
                autoTransitionLifecycle: body.autoTransitionLifecycle,
              });
              sendJson(201, service.toAgentEvaluationDTO(evaluation));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // GET /agents/:id/evaluations
          if (agentEvaluationsPostMatch && req.method === "GET") {
            const agentId = normalizeId(agentEvaluationsPostMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.read", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const limitParam = url.searchParams.get("limit");
            const offsetParam = url.searchParams.get("offset");
            const limit = limitParam ? parseInt(limitParam, 10) : undefined;
            const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

            try {
              const evals = await service.getAgentLifecycleService().listEvaluations(agentId, tenantId, limit, offset);
              sendJson(200, evals.map((e) => service.toAgentEvaluationDTO(e)));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // GET /agents/:id/evaluations/latest
          const agentEvalLatestMatch = subPath.match(/^\/agents\/([^/]+)\/evaluations\/latest$/);
          if (agentEvalLatestMatch && req.method === "GET") {
            const agentId = normalizeId(agentEvalLatestMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.read", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const evaluationType = (url.searchParams.get("type") as EvaluationType) ?? "CAPABILITY_CHECK";

            try {
              const latest = await service.getAgentLifecycleService().getLatestEvaluation(agentId, evaluationType, tenantId);
              if (!latest) {
                sendError(404, "No evaluation found for agent and type", "NOT_FOUND");
                return;
              }
              sendJson(200, service.toAgentEvaluationDTO(latest));
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // GET /agents/:id/eligibility
          const agentEligibilityMatch = subPath.match(/^\/agents\/([^/]+)\/eligibility$/);
          if (agentEligibilityMatch && req.method === "GET") {
            const agentId = normalizeId(agentEligibilityMatch[1]);
            if (!agentId) {
              sendError(400, "Bad Request: Invalid Agent ID", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("agent.read", "API", agentId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const requiredCapability = url.searchParams.get("requiredCapability") ?? undefined;
            const requireVerifiedCapability = url.searchParams.get("requireVerifiedCapability") === "true";

            try {
              const result = await service.getAgentLifecycleService().checkEligibility({
                agentId,
                tenantId,
                requiredCapability,
                requireVerifiedCapability,
              });
              sendJson(200, result);
              return;
            } catch (err: any) {
              handleAgentLifecycleError(err);
              return;
            }
          }

          // ====================================================================
          // Workflow Orchestration Routes (Prompt 111)
          // ====================================================================
          const handleWorkflowError = (err: any) => {
            if (err instanceof WorkflowValidationError || err instanceof WorkflowCycleError || err instanceof WorkflowStateTransitionError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            if (err instanceof WorkflowNotFoundError) {
              sendError(404, err.message, "WORKFLOW_NOT_FOUND");
              return;
            }
            if (err instanceof WorkflowInstanceNotFoundError) {
              sendError(404, err.message, "WORKFLOW_INSTANCE_NOT_FOUND");
              return;
            }
            if (err instanceof WorkflowConcurrencyConflictError) {
              sendError(409, err.message, "CONCURRENCY_CONFLICT");
              return;
            }
            if (err instanceof NoEligibleAgentFoundError) {
              sendError(422, err.message, "NO_ELIGIBLE_AGENT");
              return;
            }
            if (err instanceof WorkflowExecutionError) {
              sendError(500, err.message, "WORKFLOW_EXECUTION_ERROR");
              return;
            }
            sendError(500, err.message || "Internal workflow error", "WORKFLOW_ERROR");
          };

          // GET /workflows
          if (subPath === "/workflows" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const defs = await service.getWorkflowOrchestratorService().listDefinitions(tenantId);
              sendJson(200, defs.map((d) => service.toWorkflowDefinitionDTO(d)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows
          if (subPath === "/workflows" && req.method === "POST") {
            const authCheck = await authenticateAndAuthorize("workflow.create", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as any;
            try {
              const created = await service.getWorkflowOrchestratorService().createDefinition({
                id: body.id || randomUUID(),
                tenantId,
                organizationId: body.organizationId || "default-org",
                areaId: body.areaId,
                teamId: body.teamId,
                name: body.name,
                description: body.description,
                steps: body.steps ?? [],
              });
              sendJson(201, service.toWorkflowDefinitionDTO(created));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/instances
          if (subPath === "/workflows/instances" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const instances = await service.getWorkflowOrchestratorService().listInstances(tenantId);
              sendJson(200, instances.map((i) => service.toWorkflowInstanceDTO(i)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/instances/:instanceId
          const wfInstGetMatch = subPath.match(/^\/workflows\/instances\/([^/]+)$/);
          if (wfInstGetMatch && req.method === "GET") {
            const instanceId = normalizeId(wfInstGetMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const inst = await service.getWorkflowOrchestratorService().getInstance(instanceId, tenantId);
              sendJson(200, service.toWorkflowInstanceDTO(inst));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/advance
          const wfInstAdvanceMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/advance$/);
          if (wfInstAdvanceMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstAdvanceMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.execute", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const result = await service.getWorkflowOrchestratorService().advanceWorkflow(instanceId, tenantId);
              sendJson(200, {
                instance: service.toWorkflowInstanceDTO(result.instance),
                executedSteps: result.executedSteps,
              });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/pause
          const wfInstPauseMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/pause$/);
          if (wfInstPauseMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstPauseMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as { reason?: string }) : {};
            try {
              const paused = await service.getWorkflowOrchestratorService().pauseWorkflow(instanceId, tenantId, body.reason);
              sendJson(200, service.toWorkflowInstanceDTO(paused));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/resume
          const wfInstResumeMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/resume$/);
          if (wfInstResumeMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstResumeMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const resumed = await service.getWorkflowOrchestratorService().resumeWorkflow(instanceId, tenantId);
              sendJson(200, service.toWorkflowInstanceDTO(resumed));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/cancel
          const wfInstCancelMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/cancel$/);
          if (wfInstCancelMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstCancelMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as { reason?: string }) : {};
            try {
              const cancelled = await service.getWorkflowOrchestratorService().cancelWorkflow(instanceId, tenantId, body.reason);
              sendJson(200, service.toWorkflowInstanceDTO(cancelled));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/:id
          const wfGetMatch = subPath.match(/^\/workflows\/([^/]+)$/);
          if (wfGetMatch && req.method === "GET") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const def = await service.getWorkflowOrchestratorService().getDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(def));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // PUT /workflows/:id
          if (wfGetMatch && req.method === "PUT") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as any;
            try {
              const updated = await service.getWorkflowOrchestratorService().updateDefinition(id, tenantId, {
                name: body.name,
                description: body.description,
                steps: body.steps,
              });
              sendJson(200, service.toWorkflowDefinitionDTO(updated));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/activate
          const wfActivateMatch = subPath.match(/^\/workflows\/([^/]+)\/activate$/);
          if (wfActivateMatch && req.method === "POST") {
            const id = normalizeId(wfActivateMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const activated = await service.getWorkflowOrchestratorService().activateDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(activated));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/archive
          const wfArchiveMatch = subPath.match(/^\/workflows\/([^/]+)\/archive$/);
          if (wfArchiveMatch && req.method === "POST") {
            const id = normalizeId(wfArchiveMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const archived = await service.getWorkflowOrchestratorService().archiveDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(archived));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // DELETE /workflows/:id
          if (wfGetMatch && req.method === "DELETE") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.delete", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const deleted = await service.getWorkflowOrchestratorService().deleteDefinition(id, tenantId);
              if (!deleted) {
                sendError(404, `Workflow definition '${id}' not found`, "WORKFLOW_NOT_FOUND");
                return;
              }
              sendJson(200, { ok: true, id, deleted: true });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/instances or POST /workflows/:id/start
          const wfStartMatch = subPath.match(/^\/workflows\/([^/]+)\/(instances|start)$/);
          if (wfStartMatch && req.method === "POST") {
            const id = normalizeId(wfStartMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.execute", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as any) : {};
            try {
              const result = await service.getWorkflowOrchestratorService().startWorkflow({
                id: body.id,
                definitionId: id,
                tenantId,
                initiatorId: body.initiatorId ?? body.initiatedBy ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system",
                input: body.input ?? body.initialInput ?? {},
                correlationId: body.correlationId,
                autoAdvance: body.autoAdvance !== false,
              });
              sendJson(201, {
                instance: service.toWorkflowInstanceDTO(result.instance),
                executedSteps: result.executedSteps,
              });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/:id/instances
          const wfListInstMatch = subPath.match(/^\/workflows\/([^/]+)\/instances$/);
          if (wfListInstMatch && req.method === "GET") {
            const id = normalizeId(wfListInstMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const instances = await service.getWorkflowOrchestratorService().listInstancesByDefinition(id, tenantId);
              sendJson(200, instances.map((i) => service.toWorkflowInstanceDTO(i)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }
        }

        // ====================================================================
        // Verification & Result Validation Routes (Prompt 112 / Phase 63)
        // ====================================================================
        const handleVerificationError = (err: unknown) => {
          if (err instanceof VerificationValidationError) {
            sendError(400, err.message, "VERIFICATION_VALIDATION_ERROR");
          } else if (err instanceof VerificationNotFoundError) {
            sendError(404, err.message, "VERIFICATION_NOT_FOUND");
          } else if (err instanceof SelfVerificationError) {
            sendError(403, err.message, "SELF_VERIFICATION_REJECTED");
          } else if (err instanceof VerificationConcurrencyConflictError) {
            sendError(409, err.message, "VERIFICATION_CONCURRENCY_CONFLICT");
          } else if (err instanceof VerificationPolicyDeniedError) {
            sendError(403, err.message, "VERIFICATION_POLICY_DENIED");
          } else if (err instanceof WorkflowInstanceNotFoundError) {
            sendError(404, err.message, "WORKFLOW_INSTANCE_NOT_FOUND");
          } else if (err instanceof WorkflowNotFoundError) {
            sendError(404, err.message, "WORKFLOW_NOT_FOUND");
          } else {
            const msg = err instanceof Error ? err.message : "Internal verification error";
            sendError(500, msg, "VERIFICATION_INTERNAL_ERROR");
          }
        };

        const vService = service.getWorkflowVerificationService();
        if (vService) {
          // POST /verifications
          if (subPath === "/verifications" && req.method === "POST") {
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(400, "Bad Request: Invalid JSON body", "INVALID_JSON");
              return;
            }
            const body = bodyResult.body as any;
            const targetTenant = body.tenantId ?? reqCtx.tenantId;
            const authCheck = await authenticateAndAuthorize("workflow.verify", "API", body.workflowInstanceId ?? "", targetTenant);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? targetTenant;
            const verifierId = body.verifierPrincipalId ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system";

            try {
              const vResult = await vService.verifyStepResult({
                tenantId,
                workflowInstanceId: body.workflowInstanceId,
                stepId: body.stepId,
                verifierPrincipalId: verifierId,
                verifierSource: body.verifierSource ?? "SYSTEM",
                producerPrincipalId: body.producerPrincipalId,
                explicitRule: body.explicitRule,
                overrideOutput: body.overrideOutput,
              });
              sendJson(201, service.toVerificationResultDTO(vResult));
              return;
            } catch (err: any) {
              handleVerificationError(err);
              return;
            }
          }

          // GET /verifications
          if (subPath === "/verifications" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", "", reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const limitParam = url.searchParams.get("limit");
            const offsetParam = url.searchParams.get("offset");
            const limit = limitParam ? parseInt(limitParam, 10) : 50;
            const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
            try {
              const results = await vService.listVerifications(tenantId, limit, offset);
              sendJson(200, results.map((r) => service.toVerificationResultDTO(r)));
              return;
            } catch (err: any) {
              handleVerificationError(err);
              return;
            }
          }

          // GET /verifications/:id
          const vGetMatch = subPath.match(/^\/verifications\/([^/]+)$/);
          if (vGetMatch && req.method === "GET") {
            const id = normalizeId(vGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const result = await vService.getVerification(id, tenantId);
              sendJson(200, service.toVerificationResultDTO(result));
              return;
            } catch (err: any) {
              handleVerificationError(err);
              return;
            }
          }

          // GET /workflows/instances/:instanceId/verifications
          const vInstMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/verifications$/);
          if (vInstMatch && req.method === "GET") {
            const instanceId = normalizeId(vInstMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const results = await vService.listVerificationsByInstance(instanceId, tenantId);
              sendJson(200, results.map((r) => service.toVerificationResultDTO(r)));
              return;
            } catch (err: any) {
              handleVerificationError(err);
              return;
            }
          }

          // GET /executions/:executionId/verifications
          const vExecMatch = subPath.match(/^\/executions\/([^/]+)\/verifications$/);
          if (vExecMatch && req.method === "GET") {
            const executionId = normalizeId(vExecMatch[1]);
            if (!executionId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("execution.read", "API", executionId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const results = await vService.listVerificationsByExecution(executionId, tenantId);
              sendJson(200, results.map((r) => service.toVerificationResultDTO(r)));
              return;
            } catch (err: any) {
              handleVerificationError(err);
              return;
            }
          }
        }

        const hService = service.humanOversight;
        if (hService) {
          const handleApprovalError = (err: any) => {
            if (err instanceof ApprovalValidationError) {
              sendError(400, err.message, "APPROVAL_VALIDATION_ERROR");
            } else if (err instanceof ApprovalNotFoundError) {
              sendError(404, err.message, "APPROVAL_NOT_FOUND");
            } else if (err instanceof SelfApprovalError) {
              sendError(403, err.message, "SELF_APPROVAL_PROHIBITED");
            } else if (err instanceof UnauthorizedApproverError) {
              sendError(403, err.message, "UNAUTHORIZED_APPROVER");
            } else if (err instanceof ApprovalPolicyDeniedError) {
              sendError(403, err.message, "APPROVAL_POLICY_DENIED");
            } else if (err instanceof ApprovalTenantMismatchError) {
              sendError(403, err.message, "APPROVAL_TENANT_MISMATCH");
            } else if (err instanceof ApprovalExpiredError) {
              sendError(409, err.message, "APPROVAL_EXPIRED");
            } else if (err instanceof ApprovalConcurrencyConflictError) {
              sendError(409, err.message, "APPROVAL_CONCURRENCY_CONFLICT");
            } else if (err instanceof ApprovalInvalidStateTransitionError) {
              sendError(409, err.message, "APPROVAL_INVALID_STATE_TRANSITION");
            } else {
              const msg = err instanceof Error ? err.message : "Internal approval error";
              sendError(500, msg, "APPROVAL_INTERNAL_ERROR");
            }
          };

          // POST /approvals (Create Approval Request)
          if (subPath === "/approvals" && req.method === "POST") {
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(400, "Bad Request: Invalid JSON body", "INVALID_JSON");
              return;
            }
            const body = bodyResult.body as any;
            const targetTenant = body.tenantId ?? reqCtx.tenantId;
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", body.workflowInstanceId ?? "", targetTenant);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? targetTenant;
            const requesterId = body.requesterPrincipalId ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system";

            try {
              const approval = await hService.requestApproval({
                id: body.id,
                tenantId,
                workflowId: body.workflowId,
                workflowInstanceId: body.workflowInstanceId,
                workflowStepId: body.workflowStepId,
                taskId: body.taskId,
                executionId: body.executionId,
                verificationResultId: body.verificationResultId,
                requesterPrincipalId: requesterId,
                producerPrincipalId: body.producerPrincipalId,
                purpose: body.purpose,
                requiredAuthority: body.requiredAuthority,
                requiredRole: body.requiredRole,
                expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
              });
              sendJson(201, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // GET /approvals (List Approvals with filters)
          if (subPath === "/approvals" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", "", reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const limitParam = url.searchParams.get("limit");
            const offsetParam = url.searchParams.get("offset");
            const statusParam = url.searchParams.get("status");
            const instanceIdParam = url.searchParams.get("workflowInstanceId");
            const stepIdParam = url.searchParams.get("workflowStepId");

            const limit = limitParam ? parseInt(limitParam, 10) : 50;
            const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

            try {
              const approvals = await hService.listApprovals(
                {
                  tenantId,
                  status: statusParam as any,
                  workflowInstanceId: instanceIdParam ?? undefined,
                  workflowStepId: stepIdParam ?? undefined,
                },
                limit,
                offset
              );
              sendJson(200, approvals.map((a) => service.toApprovalRequestDTO(a)));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // GET /approvals/:id
          const aGetMatch = subPath.match(/^\/approvals\/([^/]+)$/);
          if (aGetMatch && req.method === "GET") {
            const id = normalizeId(aGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const approval = await hService.getApproval(id, tenantId);
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // POST /approvals/:id/review
          const aReviewMatch = subPath.match(/^\/approvals\/([^/]+)\/review$/);
          if (aReviewMatch && req.method === "POST") {
            const id = normalizeId(aReviewMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as any) : {};
            const reviewerId = body.reviewerPrincipalId ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "reviewer";

            try {
              const approval = await hService.startReview({
                approvalId: id,
                tenantId,
                reviewerPrincipalId: reviewerId,
              });
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // POST /approvals/:id/approve
          const aApproveMatch = subPath.match(/^\/approvals\/([^/]+)\/approve$/);
          if (aApproveMatch && req.method === "POST") {
            const id = normalizeId(aApproveMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as any) : {};
            const approverId = body.approverPrincipalId ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "approver";

            try {
              const approval = await hService.approve({
                approvalId: id,
                tenantId,
                approverPrincipalId: approverId,
                reason: body.reason,
                metadata: body.metadata,
              });
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // POST /approvals/:id/reject
          const aRejectMatch = subPath.match(/^\/approvals\/([^/]+)\/reject$/);
          if (aRejectMatch && req.method === "POST") {
            const id = normalizeId(aRejectMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(400, "Bad Request: Invalid JSON body", "INVALID_JSON");
              return;
            }
            const body = bodyResult.body as any;
            const approverId = body.approverPrincipalId ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "approver";

            try {
              const approval = await hService.reject({
                approvalId: id,
                tenantId,
                approverPrincipalId: approverId,
                reason: body.reason ?? "Rejected by human oversight",
                metadata: body.metadata,
              });
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // POST /approvals/:id/cancel
          const aCancelMatch = subPath.match(/^\/approvals\/([^/]+)\/cancel$/);
          if (aCancelMatch && req.method === "POST") {
            const id = normalizeId(aCancelMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as any) : {};
            const principalId = authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system";

            try {
              const approval = await hService.cancel({
                approvalId: id,
                tenantId,
                principalId,
                reason: body.reason,
              });
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // POST /approvals/:id/escalate
          const aEscalateMatch = subPath.match(/^\/approvals\/([^/]+)\/escalate$/);
          if (aEscalateMatch && req.method === "POST") {
            const id = normalizeId(aEscalateMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.approve", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(400, "Bad Request: Invalid JSON body", "INVALID_JSON");
              return;
            }
            const body = bodyResult.body as any;
            const principalId = authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system";

            try {
              const approval = await hService.escalate({
                approvalId: id,
                tenantId,
                principalId,
                escalationTarget: body.escalationTarget,
                reason: body.reason ?? "Escalated by reviewer",
              });
              sendJson(200, service.toApprovalRequestDTO(approval));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }

          // GET /workflows/instances/:instanceId/approvals
          const aInstMatch = subPath.match(/^\/workflows\/instances\/([^/]+)\/approvals$/);
          if (aInstMatch && req.method === "GET") {
            const instanceId = normalizeId(aInstMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const approvals = await hService.listByInstance(instanceId, tenantId);
              sendJson(200, approvals.map((a) => service.toApprovalRequestDTO(a)));
              return;
            } catch (err: any) {
              handleApprovalError(err);
              return;
            }
          }
        }


        sendError(404, `Endpoint not found: ${req.method} ${pathname}`, "ENDPOINT_NOT_FOUND");
        return;
      }

      // 2. Static Web UI Files (Secure path-traversal prevention)
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendError(405, "Method Not Allowed", "METHOD_NOT_ALLOWED");
        return;
      }

      // Sanitize requested file path
      let reqPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      // Resolve safely within WEB_DIR
      const resolvedPath = path.resolve(WEB_DIR, "." + path.normalize("/" + reqPath));
      const relative = path.relative(WEB_DIR, resolvedPath);

      // Path traversal check: must not escape WEB_DIR
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        sendError(403, "Forbidden", "FORBIDDEN");
        return;
      }

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
          ".pdf": "application/pdf",
        };
        const contentType = contentTypes[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(resolvedPath).pipe(res);
        return;
      }

      // SPA Fallback: serve index.html for unknown web paths
      const indexPath = path.join(WEB_DIR, "index.html");
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }

      sendError(404, "File not found", "FILE_NOT_FOUND");
    } catch (error) {
      // Security: do not leak internal stack traces to clients
      console.error("[HTTP 500] Unhandled server error:", error);
      sendError(500, "Internal Server Error", "INTERNAL_SERVER_ERROR");
    }
  });
}
