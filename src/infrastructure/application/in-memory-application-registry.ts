import { ExternalApplication } from "../../domain/application/external-application.js";
import { ApplicationRegistryPort } from "../../application/ports/application-registry-port.js";
import { ApplicationProjection } from "../../application/ports/query-ports.js";

export const DEFAULT_EXTERNAL_APPLICATIONS: readonly ExternalApplication[] = Object.freeze([
  ExternalApplication.create({
    id: "tentaciones-commerce",
    name: "Tentaciones AI Commerce",
    category: "Fashion / Footwear / Virtual AR Fitting Room",
    role: "External Consumer",
    implementationStatus: "IMPLEMENTED",
    runtimeStatus: "HEALTHY",
    authenticationMode: "API_KEY",
    sourceOfTruth: "Platform API",
    allowedCapabilities: [
      "product.discovery",
      "product.recommendation",
      "product.compare",
      "cart.assistance",
      "ar.fitting_room",
      "orchestrate",
      "tasks.read",
      "tasks.create",
      "tasks.execute",
      "tasks.cancel",
      "agents.read",
      "tools.read",
      "models.read",
      "events.read",
      "health.check",
    ],
    endpoints: [
      "POST /api/v1/tasks",
      "POST /api/v1/tasks/:id/execute",
      "POST /api/v1/orchestrate",
      "GET /api/v1/health",
    ],
    description:
      "Enterprise AI Fashion & Footwear commerce platform consuming the AI Operating Platform for intelligent catalog search, outfit generation, cart resolution, and virtual 3D/AR fitting room styling. Live integration verified via authenticated Platform API.",
    tags: ["E-Commerce", "Virtual Fitting Room", "AR / 3D", "Multi-Step Cart"],
    architecture: {
      client: "TentacionesPlatformAdapter",
      protocol: "HTTP REST / 127.0.0.1:3000",
      coupling: "Zero domain imports / Hexagonal Port Isolation",
      telemetry: "Full trace ID correlation across tasks & events",
    },
    tenantId: "tenant-tentaciones",
  }),
  ExternalApplication.create({
    id: "vehicle-parts-platform",
    name: "Vehicle Parts & Diagnostics Platform",
    category: "Industrial Automotive / Diagnostics",
    role: "External Consumer",
    implementationStatus: "IMPLEMENTED",
    runtimeStatus: "HEALTHY",
    authenticationMode: "API_KEY",
    sourceOfTruth: "Platform API",
    allowedCapabilities: [
      "product.discovery",
      "product.recommendation",
      "product.compare",
      "cart.assistance",
      "tasks.create",
      "tasks.read",
      "tasks.execute",
      "agents.read",
      "health.check",
    ],
    endpoints: [
      "POST /api/v1/tasks",
      "POST /api/v1/tasks/:id/execute",
      "POST /api/v1/orchestrate",
      "GET /api/v1/health",
    ],
    description:
      "Heavy machinery and vehicle parts diagnostics assistant consuming the AI Operating Platform for intelligent parts search, vehicle model compatibility verification, and workshop cart assistance.",
    tags: ["Automotive", "Industrial Diagnostics", "Parts Hierarchy", "Compatibility Engine"],
    architecture: {
      client: "VehiclePartsPlatformAdapter",
      protocol: "HTTP REST / 127.0.0.1:3000",
      coupling: "Zero domain imports / Hexagonal Port Isolation",
      telemetry: "Trace ID correlation across tasks & events",
    },
    tenantId: "tenant-automotive",
  }),
  ExternalApplication.create({
    id: "enterprise-support-agent",
    name: "Enterprise Support & Knowledge Assistant",
    category: "Customer Experience / Tier-1 Automation",
    role: "External Consumer",
    implementationStatus: "DESIGNED",
    runtimeStatus: "NOT_CONNECTED",
    authenticationMode: "API_KEY",
    allowedCapabilities: ["tasks.create", "tasks.read"],
    endpoints: ["POST /api/v1/tasks"],
    description:
      "Automated ticket resolution and knowledge base semantic retrieval assistant designed to consume the AI Operating Platform.",
    tags: ["Customer Support", "Knowledge Base", "Ticket Routing"],
    architecture: {
      client: "SupportDeskPlatformAdapter (Planned)",
      protocol: "HTTP REST / Platform API v1",
      coupling: "Zero domain imports",
      telemetry: "Audit log correlation",
    },
    tenantId: "tenant-support",
  }),
]);

export class InMemoryApplicationRegistry implements ApplicationRegistryPort {
  private readonly applications: Map<string, ExternalApplication>;

  constructor(initialApps: readonly ExternalApplication[] = DEFAULT_EXTERNAL_APPLICATIONS) {
    this.applications = new Map();
    for (const app of initialApps) {
      this.applications.set(app.id, app);
    }
  }

  register(application: ExternalApplication): ExternalApplication {
    if (this.applications.has(application.id)) {
      throw new Error(`Application with id '${application.id}' already exists`);
    }
    this.applications.set(application.id, application);
    return application;
  }

  update(application: ExternalApplication): ExternalApplication {
    if (!this.applications.has(application.id)) {
      throw new Error(`Application with id '${application.id}' not found`);
    }
    this.applications.set(application.id, application);
    return application;
  }

  delete(id: string): boolean {
    return this.applications.delete(id);
  }

  findById(id: string): ApplicationProjection | undefined {
    const app = this.applications.get(id);
    if (!app) return undefined;
    return this.toProjection(app);
  }

  findEntityById(id: string): ExternalApplication | undefined {
    return this.applications.get(id);
  }

  list(): readonly ApplicationProjection[] {
    return Array.from(this.applications.values()).map((app) => this.toProjection(app));
  }

  findByTenant(tenantId: string): readonly ExternalApplication[] {
    return Array.from(this.applications.values()).filter((app) => app.tenantId === tenantId);
  }

  private toProjection(app: ExternalApplication): ApplicationProjection {
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      category: app.category,
      role: app.role,
      implementationStatus: app.implementationStatus,
      runtimeStatus: app.runtimeStatus,
      sourceOfTruth: app.sourceOfTruth,
      allowedCapabilities: app.allowedCapabilities,
      authenticationMode: app.authenticationMode,
      endpoints: app.endpoints,
      architecture: app.architecture,
      tags: app.tags,
      tenantId: app.tenantId,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}
