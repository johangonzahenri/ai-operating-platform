import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";

export type ApplicationImplementationStatus = "IMPLEMENTED" | "PARTIAL" | "DESIGNED" | "PLANNED";
export type ApplicationRuntimeStatus =
  | "HEALTHY"
  | "OPERATIONAL"
  | "AVAILABLE"
  | "ENFORCED"
  | "WAL_ACTIVE"
  | "NOT_CONNECTED"
  | "OFFLINE"
  | "DEGRADED";

export type AuthenticationMode = "API_KEY" | "BEARER_TOKEN" | "MUTUAL_TLS";

export type ApplicationCapability =
  | "orchestrate"
  | "tasks.read"
  | "tasks.create"
  | "tasks.execute"
  | "tasks.cancel"
  | "agents.read"
  | "tools.read"
  | "models.read"
  | "events.read";

export const KNOWN_APPLICATION_CAPABILITIES: readonly ApplicationCapability[] = Object.freeze([
  "orchestrate",
  "tasks.read",
  "tasks.create",
  "tasks.execute",
  "tasks.cancel",
  "agents.read",
  "tools.read",
  "models.read",
  "events.read",
]);

export interface ExternalApplicationProps {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category?: string | undefined;
  readonly role?: string | undefined;
  readonly implementationStatus?: ApplicationImplementationStatus | undefined;
  readonly runtimeStatus?: ApplicationRuntimeStatus | undefined;
  readonly sourceOfTruth?: string | undefined;
  readonly integrationTarget?: string | undefined;
  readonly integrationType?: string | undefined;
  readonly allowedCapabilities: readonly (ApplicationCapability | string)[];
  readonly authenticationMode?: AuthenticationMode | undefined;
  readonly endpoints?: readonly string[] | undefined;
  readonly architecture?: Readonly<Record<string, string>> | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly tenantId?: string | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationValidationError";
  }
}

export const ExternalApplicationValidationError = ApplicationValidationError;
export type ExternalApplicationValidationError = ApplicationValidationError;

export class ExternalApplication {
  readonly id!: string;
  readonly name!: string;
  readonly description!: string;
  readonly category!: string;
  readonly role!: string;
  readonly implementationStatus!: ApplicationImplementationStatus;
  readonly runtimeStatus!: ApplicationRuntimeStatus;
  readonly sourceOfTruth!: string;
  readonly integrationTarget!: string;
  readonly integrationType!: string;
  readonly allowedCapabilities!: readonly string[];
  readonly authenticationMode!: AuthenticationMode;
  readonly endpoints!: readonly string[];
  readonly architecture!: Readonly<Record<string, string>>;
  readonly tags!: readonly string[];
  readonly tenantId?: string | undefined;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
  readonly metadata!: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    name: string;
    description: string;
    category: string;
    role: string;
    implementationStatus: ApplicationImplementationStatus;
    runtimeStatus: ApplicationRuntimeStatus;
    sourceOfTruth: string;
    integrationTarget: string;
    integrationType: string;
    allowedCapabilities: readonly string[];
    authenticationMode: AuthenticationMode;
    endpoints: readonly string[];
    architecture: Readonly<Record<string, string>>;
    tags: readonly string[];
    tenantId?: string | undefined;
    createdAt: Date;
    updatedAt: Date;
    metadata: Readonly<Record<string, unknown>>;
  }) {
    Object.assign(this, props);
    Object.freeze(this);
  }

  static create(props: ExternalApplicationProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): ExternalApplication {
    if (!props || typeof props.id !== "string" || props.id.trim() === "") {
      throw new ApplicationValidationError("Application id must be a non-empty string");
    }
    const id = props.id.trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new ApplicationValidationError(`Invalid application id format: '${id}'`);
    }

    if (typeof props.name !== "string" || props.name.trim() === "") {
      throw new ApplicationValidationError("Application name must be a non-empty string");
    }
    if (typeof props.description !== "string" || props.description.trim() === "") {
      throw new ApplicationValidationError("Application description must be a non-empty string");
    }

    const validImplStatuses: readonly ApplicationImplementationStatus[] = ["IMPLEMENTED", "PARTIAL", "DESIGNED", "PLANNED"];
    const implementationStatus: ApplicationImplementationStatus = props.implementationStatus ?? "DESIGNED";
    if (!validImplStatuses.includes(implementationStatus)) {
      throw new ApplicationValidationError(`Invalid implementation status: '${String(implementationStatus)}'`);
    }

    const validRuntimeStatuses: readonly ApplicationRuntimeStatus[] = [
      "HEALTHY",
      "OPERATIONAL",
      "AVAILABLE",
      "ENFORCED",
      "WAL_ACTIVE",
      "NOT_CONNECTED",
      "OFFLINE",
      "DEGRADED",
    ];
    const runtimeStatus: ApplicationRuntimeStatus = props.runtimeStatus ?? "NOT_CONNECTED";
    if (!validRuntimeStatuses.includes(runtimeStatus)) {
      throw new ApplicationValidationError(`Invalid runtime status: '${String(runtimeStatus)}'`);
    }

    const validAuthModes: readonly AuthenticationMode[] = ["API_KEY", "BEARER_TOKEN", "MUTUAL_TLS"];
    const authenticationMode: AuthenticationMode = props.authenticationMode ?? "API_KEY";
    if (!validAuthModes.includes(authenticationMode)) {
      throw new ApplicationValidationError(`Invalid authentication mode: '${String(authenticationMode)}'`);
    }

    if (!Array.isArray(props.allowedCapabilities)) {
      throw new ApplicationValidationError("allowedCapabilities must be an array of capability strings");
    }

    const state = { truncated: false };
    const sanitizedMetadata = deepFreeze(
      sanitizeBoundedValue(props.metadata ?? {}, limits, 0, state) as Readonly<Record<string, unknown>>
    );

    const allowedCapabilities = Object.freeze(
      [...new Set(props.allowedCapabilities.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean))]
    );

    const endpoints = Array.isArray(props.endpoints)
      ? Object.freeze([...props.endpoints.map((e) => String(e).trim()).filter(Boolean)])
      : Object.freeze([]);

    const architecture = props.architecture && typeof props.architecture === "object"
      ? deepFreeze({ ...props.architecture })
      : Object.freeze({});

    const tags = Array.isArray(props.tags)
      ? Object.freeze([...props.tags.map((t) => String(t).trim()).filter(Boolean)])
      : Object.freeze([]);

    const createdAt = props.createdAt instanceof Date && !Number.isNaN(props.createdAt.getTime())
      ? new Date(props.createdAt.getTime())
      : new Date();

    const updatedAt = props.updatedAt instanceof Date && !Number.isNaN(props.updatedAt.getTime())
      ? new Date(props.updatedAt.getTime())
      : new Date();

    return new ExternalApplication({
      id,
      name: props.name.trim(),
      description: props.description.trim(),
      category: props.category?.trim() || "General External Integration",
      role: props.role?.trim() || "External Consumer",
      implementationStatus,
      runtimeStatus,
      sourceOfTruth: props.sourceOfTruth?.trim() || "External Application Contract",
      integrationTarget: props.integrationTarget?.trim() || "Platform API (/api/v1/*)",
      integrationType: props.integrationType?.trim() || "Platform API Client (REST / HTTP)",
      allowedCapabilities,
      authenticationMode,
      endpoints,
      architecture,
      tags,
      ...(props.tenantId?.trim() ? { tenantId: props.tenantId.trim() } : {}),
      createdAt,
      updatedAt,
      metadata: sanitizedMetadata,
    });
  }

  isAvailable(): boolean {
    return (
      this.runtimeStatus === "HEALTHY" ||
      this.runtimeStatus === "OPERATIONAL" ||
      this.runtimeStatus === "AVAILABLE"
    );
  }

  hasCapability(capability: string): boolean {
    if (typeof capability !== "string" || capability.trim() === "") return false;
    const target = capability.trim();
    return this.allowedCapabilities.includes(target) || this.allowedCapabilities.includes("*");
  }

  withRuntimeStatus(status: ApplicationRuntimeStatus): ExternalApplication {
    return ExternalApplication.create({
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      role: this.role,
      implementationStatus: this.implementationStatus,
      runtimeStatus: status,
      sourceOfTruth: this.sourceOfTruth,
      integrationTarget: this.integrationTarget,
      integrationType: this.integrationType,
      allowedCapabilities: this.allowedCapabilities,
      authenticationMode: this.authenticationMode,
      endpoints: this.endpoints,
      architecture: this.architecture,
      tags: this.tags,
      tenantId: this.tenantId,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      metadata: this.metadata,
    });
  }
}
