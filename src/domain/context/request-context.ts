import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS } from "./bounded-data.js";
import { SecurityContext } from "../security/security.js";
import { randomUUID } from "node:crypto";

export type RequestSource = "HTTP_API" | "PLATFORM_CONSOLE" | "SDK" | "AUTOMATION" | "INTERNAL";

export interface RequestPrincipal {
  readonly id: string;
  readonly type: "USER" | "SERVICE" | "SYSTEM" | "DEVICE";
  readonly roles: readonly string[];
}

export interface RequestContextProps {
  readonly requestId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly principal?: RequestPrincipal | undefined;
  readonly source?: RequestSource | undefined;
  readonly apiVersion?: string | undefined;
  readonly timestamp?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class RequestContext {
  public readonly requestId: string;
  public readonly correlationId: string;
  public readonly tenantId: string;
  public readonly applicationId: string;
  public readonly principal: Readonly<RequestPrincipal>;
  public readonly source: RequestSource;
  public readonly apiVersion: string;
  public readonly timestamp: Date;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: {
    readonly requestId: string;
    readonly correlationId: string;
    readonly tenantId: string;
    readonly applicationId: string;
    readonly principal: RequestPrincipal;
    readonly source: RequestSource;
    readonly apiVersion: string;
    readonly timestamp: Date;
    readonly metadata: Readonly<Record<string, unknown>>;
  }) {
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.tenantId = props.tenantId;
    this.applicationId = props.applicationId;
    this.principal = Object.freeze({
      id: props.principal.id,
      type: props.principal.type,
      roles: Object.freeze([...props.principal.roles]),
    });
    this.source = props.source;
    this.apiVersion = props.apiVersion;
    this.timestamp = new Date(props.timestamp.getTime());
    this.metadata = sanitizeBoundedValue(props.metadata, DEFAULT_BOUNDED_DATA_LIMITS, 0) as Readonly<Record<string, unknown>>;
    deepFreeze(this);
  }

  public static create(props?: RequestContextProps): RequestContext {
    const requestId = props?.requestId?.trim() || randomUUID();
    const correlationId = props?.correlationId?.trim() || `corr-${requestId}`;
    const tenantId = props?.tenantId?.trim() || "tenant-default";
    const applicationId = props?.applicationId?.trim() || "platform-core";
    const principal: RequestPrincipal = props?.principal ?? {
      id: "anonymous",
      type: "USER",
      roles: ["anonymous"],
    };
    const source: RequestSource = props?.source ?? "HTTP_API";
    const apiVersion = props?.apiVersion?.trim() || "v1";
    const timestamp = props?.timestamp ?? new Date();
    const metadata = props?.metadata ?? {};

    return new RequestContext({
      requestId,
      correlationId,
      tenantId,
      applicationId,
      principal,
      source,
      apiVersion,
      timestamp,
      metadata,
    });
  }

  public static fromSecurityContext(
    secCtx: SecurityContext,
    options?: {
      readonly requestId?: string | undefined;
      readonly correlationId?: string | undefined;
      readonly applicationId?: string | undefined;
      readonly source?: RequestSource | undefined;
      readonly apiVersion?: string | undefined;
      readonly metadata?: Readonly<Record<string, unknown>> | undefined;
    }
  ): RequestContext {
    const requestId = options?.requestId?.trim() || randomUUID();
    const correlationId = options?.correlationId?.trim() || `corr-${requestId}`;
    const tenantId = secCtx.tenantId || "tenant-default";
    const applicationId = options?.applicationId?.trim() || "platform-core";
    const principal: RequestPrincipal = {
      id: secCtx.principal?.id || "anonymous",
      type: (secCtx.principal?.type as any) || "USER",
      roles: secCtx.principal?.roles || [],
    };
    const source: RequestSource = options?.source ?? "HTTP_API";
    const apiVersion = options?.apiVersion ?? "v1";
    const timestamp = new Date();
    const metadata = options?.metadata ?? {};

    return new RequestContext({
      requestId,
      correlationId,
      tenantId,
      applicationId,
      principal,
      source,
      apiVersion,
      timestamp,
      metadata,
    });
  }

  public withCorrelationId(correlationId: string): RequestContext {
    return new RequestContext({
      requestId: this.requestId,
      correlationId: correlationId.trim() || this.correlationId,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      principal: this.principal,
      source: this.source,
      apiVersion: this.apiVersion,
      timestamp: this.timestamp,
      metadata: this.metadata,
    });
  }

  public withTenantId(tenantId: string): RequestContext {
    return new RequestContext({
      requestId: this.requestId,
      correlationId: this.correlationId,
      tenantId: tenantId.trim() || this.tenantId,
      applicationId: this.applicationId,
      principal: this.principal,
      source: this.source,
      apiVersion: this.apiVersion,
      timestamp: this.timestamp,
      metadata: this.metadata,
    });
  }
}

export function extractRequestContextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  extra?: { method?: string | undefined; path?: string | undefined }
): RequestContext {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(val)) return val[0]?.trim();
    if (typeof val === "string") return val.trim();
    return undefined;
  };

  const requestId = getHeader("x-request-id") || randomUUID();
  const correlationId = getHeader("x-correlation-id") || `corr-${requestId}`;
  const tenantId = getHeader("x-tenant-id") || "tenant-default";
  const applicationId = getHeader("x-application-id") || "platform-core";
  const principalId = getHeader("x-principal-id") || "anonymous";
  const apiVersion = getHeader("x-api-version") || "v1";

  return RequestContext.create({
    requestId,
    correlationId,
    tenantId,
    applicationId,
    principal: {
      id: principalId,
      type: "USER",
      roles: ["caller"],
    },
    source: "HTTP_API",
    apiVersion,
    metadata: {
      method: extra?.method,
      path: extra?.path,
    },
  });
}

