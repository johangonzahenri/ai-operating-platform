export type TenantPlan = "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface TenantLimits {
  readonly maxTasksPerMonth: number;
  readonly maxExecutionsPerMonth: number;
  readonly maxTokensPerMonth: number;
  readonly maxApplications: number;
  readonly maxUsers: number;
  readonly allowedCapabilities: readonly string[];
  readonly maxStorageMb: number;
}

export interface TenantProps {
  readonly id: string;
  readonly name: string;
  readonly plan: TenantPlan;
  readonly status: TenantStatus;
  readonly limits: TenantLimits;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;
}

export const DEFAULT_PLAN_LIMITS: Record<TenantPlan, TenantLimits> = {
  FREE: {
    maxTasksPerMonth: 500,
    maxExecutionsPerMonth: 1000,
    maxTokensPerMonth: 100000,
    maxApplications: 2,
    maxUsers: 3,
    allowedCapabilities: ["commerce.catalog", "commerce.recommendation", "ar.fitting.basic"],
    maxStorageMb: 500,
  },
  PRO: {
    maxTasksPerMonth: 5000,
    maxExecutionsPerMonth: 10000,
    maxTokensPerMonth: 2000000,
    maxApplications: 10,
    maxUsers: 20,
    allowedCapabilities: ["commerce.catalog", "commerce.recommendation", "ar.fitting", "automation.webhooks", "agents.custom"],
    maxStorageMb: 5000,
  },
  BUSINESS: {
    maxTasksPerMonth: 50000,
    maxExecutionsPerMonth: 100000,
    maxTokensPerMonth: 20000000,
    maxApplications: 50,
    maxUsers: 100,
    allowedCapabilities: ["*"],
    maxStorageMb: 50000,
  },
  ENTERPRISE: {
    maxTasksPerMonth: 1000000,
    maxExecutionsPerMonth: 2000000,
    maxTokensPerMonth: 500000000,
    maxApplications: 500,
    maxUsers: 1000,
    allowedCapabilities: ["*"],
    maxStorageMb: 500000,
  },
};

export class Tenant {
  readonly id: string;
  readonly name: string;
  readonly plan: TenantPlan;
  readonly status: TenantStatus;
  readonly limits: TenantLimits;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;

  constructor(props: TenantProps) {
    if (!props.id || typeof props.id !== "string" || props.id.trim() === "") {
      throw new Error("Tenant requires a non-empty string ID");
    }
    if (!props.name || typeof props.name !== "string" || props.name.trim() === "") {
      throw new Error("Tenant requires a valid non-empty name");
    }
    this.id = props.id.trim();
    this.name = props.name.trim();
    this.plan = props.plan;
    this.status = props.status;
    this.limits = props.limits;
    this.metadata = props.metadata ?? {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(id: string, name: string, plan: TenantPlan = "FREE", metadata?: Record<string, unknown>): Tenant {
    return new Tenant({
      id,
      name,
      plan,
      status: "ACTIVE",
      limits: DEFAULT_PLAN_LIMITS[plan],
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  isCapabilityAllowed(capability: string): boolean {
    if (this.status !== "ACTIVE") return false;
    if (this.limits.allowedCapabilities.includes("*")) return true;
    return this.limits.allowedCapabilities.includes(capability);
  }
}
