const fs = require("fs");
const path = require("path");

const filePath = path.resolve(__dirname, "../src/platform/api/http-router.ts");
let code = fs.readFileSync(filePath, "utf8");

// 1. Fix top declarations if needed
const importAnchor = "  OrganizationConflictError,";
const restoredDeclarations = `  OrganizationConflictError,
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
import {
  ApiCredentialService,
  CredentialNotFoundError,
  CredentialTenantMismatchError,
} from "../../application/security/api-credential-service.js";
import { ApiCredentialRepositoryPort } from "../../application/ports/api-credential-repository-port.js";
import {
  ApiCredentialError,
  ApiCredentialValidationError,
  ApiCredentialNotFoundError,
  ApiCredentialRevokedError,
  ApiCredentialExpiredError,
  ApiCredentialConcurrencyConflictError,
  ApiCredentialTenantMismatchError,
} from "../../domain/security/api-credential-errors.js";

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
  readonly apiCredentialService?: ApiCredentialService | undefined;
  readonly apiCredentialRepository?: ApiCredentialRepositoryPort | undefined;
  readonly enforceSecurity?: boolean | undefined;
}

export function createHttpServer(
  service: PlatformService,
  options?: HttpServerOptions
): http.Server {
  const credService = options?.apiCredentialService ?? service.getApiCredentialService();
  const authService =
    options?.authService ??
    new AuthenticationService(undefined, [
      new ApiKeyAuthenticationProvider(
        options?.apiKeyRepository ?? new InMemoryApiKeyRepository(),
        credService
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
    res.setHeader("X-Correlation-Id", reqCtx.correlationId);`;

if (code.includes(importAnchor) && !code.includes("export interface HttpServerOptions")) {
  code = code.replace(importAnchor, restoredDeclarations);
}

// 2. Enhance authenticateAndAuthorize
const oldAuthCode = `        const authzResult = await authzEvaluator.evaluate({
          context: authResult.context,
          action,
          resourceType,
          resourceId,
          targetTenantId,
        });`;

const enhancedAuthCode = `        // Tenant Reconciliation: reject spoofing / mismatch
        const headerTenant = req.headers["x-tenant-id"];
        if (typeof headerTenant === "string" && headerTenant.trim() !== "") {
          if (authResult.context.tenantId && authResult.context.tenantId !== headerTenant.trim()) {
            return {
              ok: false,
              status: 403,
              code: "TENANT_MISMATCH",
              message: "Authenticated tenant does not match X-Tenant-Id header",
            };
          }
        }

        // Application Reconciliation: reject spoofing / mismatch
        const headerApp = req.headers["x-application-id"];
        const contextApp = authResult.context.metadata?.applicationId as string | undefined;
        if (typeof headerApp === "string" && headerApp.trim() !== "") {
          if (contextApp && contextApp !== headerApp.trim()) {
            return {
              ok: false,
              status: 403,
              code: "APPLICATION_MISMATCH",
              message: "Authenticated application does not match X-Application-Id header",
            };
          }
        }

        // Scopes Verification
        const scopes = (authResult.context.metadata?.scopes as readonly string[]) ?? [];
        if (scopes.length > 0) {
          const hasScope = scopes.some((scope) => {
            if (scope === "*" || scope === action) return true;
            if (scope.endsWith(".*")) {
              const prefix = scope.slice(0, -2);
              return action.startsWith(prefix + ".");
            }
            return false;
          });
          if (!hasScope && !authResult.context.hasPermission(action)) {
            return {
              ok: false,
              status: 403,
              code: "INSUFFICIENT_SCOPE",
              message: \`Principal lacks required scope: \${action}\`,
            };
          }
        }

        const authzResult = await authzEvaluator.evaluate({
          context: authResult.context,
          action,
          resourceType,
          resourceId,
          targetTenantId: targetTenantId ?? authResult.context.tenantId,
        });`;

if (code.includes(oldAuthCode)) {
  code = code.replace(oldAuthCode, enhancedAuthCode);
}

// 3. Add handleCredentialError and credentials endpoints
const endpointsAnchor = 'sendError(404, `Endpoint not found: ${req.method} ${pathname}`, "ENDPOINT_NOT_FOUND");';
const credEndpoints = `        const handleCredentialError = (err: unknown) => {
          if (err instanceof ApiCredentialValidationError) {
            sendError(400, err.message, "CREDENTIAL_VALIDATION_ERROR");
          } else if (err instanceof CredentialNotFoundError || err instanceof ApiCredentialNotFoundError) {
            sendError(404, (err as Error).message, "CREDENTIAL_NOT_FOUND");
          } else if (err instanceof CredentialTenantMismatchError || err instanceof ApiCredentialTenantMismatchError) {
            sendError(403, (err as Error).message, "TENANT_MISMATCH");
          } else if (err instanceof ApiCredentialRevokedError) {
            sendError(403, err.message, "CREDENTIAL_REVOKED");
          } else if (err instanceof ApiCredentialExpiredError) {
            sendError(403, err.message, "CREDENTIAL_EXPIRED");
          } else if (err instanceof ApiCredentialConcurrencyConflictError) {
            sendError(409, err.message, "CONCURRENCY_CONFLICT");
          } else {
            sendError(500, err instanceof Error ? err.message : "Internal credential operation error", "INTERNAL_SERVER_ERROR");
          }
        };

        // --- API Credential Management Endpoints (Prompt 102) ---

        // GET /credentials or GET /security/credentials
        if ((subPath === "/credentials" || subPath === "/security/credentials") && req.method === "GET") {
          const authCheck = await authenticateAndAuthorize("credentials.read", "API", undefined, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? "default";
          const status = url.searchParams.get("status") as any;
          const principalId = url.searchParams.get("principalId") ?? undefined;
          const applicationId = url.searchParams.get("applicationId") ?? undefined;
          try {
            const credentials = await service.listCredentials(tenantId, {
              status,
              principalId,
              applicationId,
            });
            sendJson(200, { credentials });
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        // POST /credentials or POST /security/credentials
        if ((subPath === "/credentials" || subPath === "/security/credentials") && req.method === "POST") {
          const authCheck = await authenticateAndAuthorize("credentials.manage", "API", undefined, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? (bodyResult.body.tenantId as string) ?? "default";
          try {
            const result = await service.createCredential(bodyResult.body as any, tenantId);
            sendJson(201, result);
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        // GET /credentials/:id or GET /security/credentials/:id
        const credGetMatch = subPath.match(/^\\/(?:security\\/)?credentials\\/([^/]+)$/);
        if (credGetMatch && req.method === "GET") {
          const id = normalizeId(credGetMatch[1] ?? "") ?? credGetMatch[1] ?? "";
          const authCheck = await authenticateAndAuthorize("credentials.read", "API", id, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? "default";
          try {
            const credential = await service.getCredentialById(id, tenantId);
            if (!credential) {
              sendError(404, \`API credential not found: '\${id}'\`, "CREDENTIAL_NOT_FOUND");
              return;
            }
            sendJson(200, credential);
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        // POST /credentials/:id/rotate or POST /security/credentials/:id/rotate
        const credRotateMatch = subPath.match(/^\\/(?:security\\/)?credentials\\/([^/]+)\\/rotate$/);
        if (credRotateMatch && req.method === "POST") {
          const id = normalizeId(credRotateMatch[1] ?? "") ?? credRotateMatch[1] ?? "";
          const authCheck = await authenticateAndAuthorize("credentials.manage", "API", id, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? "default";
          try {
            const result = await service.rotateCredential(id, bodyResult.body as any, tenantId);
            sendJson(200, result);
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        // POST /credentials/:id/revoke or POST /security/credentials/:id/revoke
        const credRevokeMatch = subPath.match(/^\\/(?:security\\/)?credentials\\/([^/]+)\\/revoke$/);
        if (credRevokeMatch && req.method === "POST") {
          const id = normalizeId(credRevokeMatch[1] ?? "") ?? credRevokeMatch[1] ?? "";
          const authCheck = await authenticateAndAuthorize("credentials.manage", "API", id, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? "default";
          try {
            const credential = await service.revokeCredential(id, bodyResult.body as any, tenantId);
            sendJson(200, credential);
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        // DELETE /credentials/:id or DELETE /security/credentials/:id
        const credDeleteMatch = subPath.match(/^\\/(?:security\\/)?credentials\\/([^/]+)$/);
        if (credDeleteMatch && req.method === "DELETE") {
          const id = normalizeId(credDeleteMatch[1] ?? "") ?? credDeleteMatch[1] ?? "";
          const authCheck = await authenticateAndAuthorize("credentials.manage", "API", id, reqCtx.tenantId, false);
          if (!authCheck.ok) {
            sendError(authCheck.status, authCheck.message, authCheck.code);
            return;
          }
          const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId ?? "default";
          try {
            const credential = await service.revokeCredential(id, { reason: "Deleted via DELETE endpoint" }, tenantId);
            sendJson(200, credential);
            return;
          } catch (err) {
            handleCredentialError(err);
            return;
          }
        }

        ` + endpointsAnchor;

if (code.includes(endpointsAnchor) && !code.includes("handleCredentialError")) {
  code = code.replace(endpointsAnchor, credEndpoints);
}

fs.writeFileSync(filePath, code, "utf8");
console.log("Successfully patched http-router.ts");
