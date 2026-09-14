import { SecurityContext } from "../../domain/security/security.js";
import { ApplicationRegistryPort } from "../ports/application-registry-port.js";
import { ExternalApplication } from "../../domain/application/external-application.js";

export interface ApplicationRequestContextProps {
  readonly applicationId: string;
  readonly principalId: string;
  readonly tenantId?: string | undefined;
  readonly capabilities: readonly string[];
  readonly correlationId: string;
  readonly requestId?: string | undefined;
  readonly operation: string;
  readonly authenticated: boolean;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class ApplicationRequestContext {
  readonly applicationId!: string;
  readonly principalId!: string;
  readonly tenantId?: string | undefined;
  readonly capabilities!: readonly string[];
  readonly correlationId!: string;
  readonly requestId?: string | undefined;
  readonly operation!: string;
  readonly authenticated!: boolean;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: ApplicationRequestContextProps) {
    this.applicationId = props.applicationId;
    this.principalId = props.principalId;
    this.tenantId = props.tenantId;
    this.capabilities = Object.freeze([...props.capabilities]);
    this.correlationId = props.correlationId;
    this.requestId = props.requestId;
    this.operation = props.operation;
    this.authenticated = props.authenticated;
    this.metadata = Object.freeze(props.metadata ? { ...props.metadata } : {});
    Object.freeze(this);
  }

  static create(props: ApplicationRequestContextProps): ApplicationRequestContext {
    if (!props.applicationId || typeof props.applicationId !== "string" || props.applicationId.trim() === "") {
      throw new Error("ApplicationRequestContext requires a valid applicationId");
    }
    if (!props.principalId || typeof props.principalId !== "string") {
      throw new Error("ApplicationRequestContext requires a valid principalId");
    }
    if (!props.correlationId || typeof props.correlationId !== "string") {
      throw new Error("ApplicationRequestContext requires a valid correlationId");
    }
    if (!props.operation || typeof props.operation !== "string") {
      throw new Error("ApplicationRequestContext requires a valid operation");
    }

    return new ApplicationRequestContext({
      applicationId: props.applicationId.trim(),
      principalId: props.principalId.trim(),
      tenantId: props.tenantId?.trim(),
      capabilities: Array.isArray(props.capabilities) ? props.capabilities : [],
      correlationId: props.correlationId.trim(),
      requestId: props.requestId?.trim(),
      operation: props.operation.trim(),
      authenticated: Boolean(props.authenticated),
      metadata: props.metadata,
    });
  }

  hasCapability(capability: string): boolean {
    if (typeof capability !== "string" || capability.trim() === "") return false;
    const target = capability.trim();
    return this.capabilities.includes(target) || this.capabilities.includes("*");
  }

  static derive(
    securityContext: SecurityContext,
    applicationRegistry: ApplicationRegistryPort,
    operation: string,
    requestId?: string
  ): { ok: true; context: ApplicationRequestContext; application: ExternalApplication } | { ok: false; code: string; reason: string } {
    if (!securityContext || !securityContext.authenticated || !securityContext.principal) {
      return {
        ok: false,
        code: "SECURITY_UNAUTHENTICATED",
        reason: "Request is not authenticated",
      };
    }

    const principal = securityContext.principal;
    // Determine applicationId from principal metadata, principal ID, or tenant mapping
    const metadataAppId = typeof principal.metadata?.applicationId === "string" ? principal.metadata.applicationId.trim() : undefined;
    const directAppId = principal.id.startsWith("service-") ? principal.id.substring("service-".length) : principal.id;
    const targetAppId = metadataAppId || directAppId;

    const application = applicationRegistry.findEntityById(targetAppId);
    if (!application) {
      return {
        ok: false,
        code: "APPLICATION_NOT_REGISTERED",
        reason: `Caller represents principal '${principal.id}', but no registered external application matches '${targetAppId}'`,
      };
    }

    // Default Deny capability check
    if (!application.hasCapability(operation)) {
      return {
        ok: false,
        code: "APPLICATION_SCOPE_FORBIDDEN",
        reason: `Application '${application.id}' does not have the required capability/scope '${operation}'`,
      };
    }

    const appCtx = ApplicationRequestContext.create({
      applicationId: application.id,
      principalId: principal.id,
      tenantId: principal.tenantId || application.tenantId,
      capabilities: application.allowedCapabilities,
      correlationId: securityContext.correlationId,
      requestId: requestId || securityContext.requestId,
      operation,
      authenticated: true,
      metadata: {
        applicationName: application.name,
        implementationStatus: application.implementationStatus,
        runtimeStatus: application.runtimeStatus,
      },
    });

    return { ok: true, context: appCtx, application };
  }
}
