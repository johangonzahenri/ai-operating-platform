import { Principal } from "../../domain/security/security.js";
import { Role, RoleRepository } from "../../domain/security/authorization.js";

export class InMemoryRoleRepository implements RoleRepository {
  private readonly roles = new Map<string, Role>();

  constructor(initialRoles: readonly Role[] = []) {
    this.bootstrapStandardRoles();
    for (const role of initialRoles) {
      this.roles.set(role.id, role);
    }
  }

  private bootstrapStandardRoles(): void {
    const standardRoles: Role[] = [
      Role.create({
        id: "anonymous",
        name: "Anonymous User",
        permissions: ["public.read", "health.check"],
        description: "Default role for unauthenticated requests accessing public endpoints",
      }),
      Role.create({
        id: "user",
        name: "Standard User",
        permissions: [
          "public.read",
          "health.check",
          "task.read",
          "task.create",
          "task.cancel",
          "agent.read",
          "model.read",
          "tool.read",
        ],
        description: "Standard platform user with task creation and read access",
      }),
      Role.create({
        id: "operator",
        name: "Platform Operator",
        permissions: [
          "public.read",
          "health.check",
          "task.*",
          "agent.*",
          "model.*",
          "tool.*",
          "memory.read",
          "coordination.*",
        ],
        description: "Platform operator with broad operational access",
      }),
      Role.create({
        id: "agent",
        name: "Autonomous Agent",
        permissions: [
          "tool.invoke",
          "tool.read",
          "model.invoke",
          "model.read",
          "memory.read",
          "memory.write",
          "handoff.transfer",
        ],
        description: "Default execution role for autonomous agents",
      }),
      Role.create({
        id: "service",
        name: "Service Integration",
        permissions: [
          "public.read",
          "health.check",
          "task.create",
          "task.read",
          "task.cancel",
          "task.execute",
          "agent.read",
          "tool.read",
          "model.read",
          "coordination.*",
          "orchestrate",
        ],
        description: "Internal and external service integration role",
      }),
      Role.create({
        id: "application",
        name: "External Application Integration",
        permissions: [
          "public.read",
          "health.check",
          "task.create",
          "task.read",
          "task.cancel",
          "task.execute",
          "agent.read",
          "tool.read",
          "model.read",
          "coordination.*",
          "orchestrate",
        ],
        description: "Registered external application integration role",
      }),
      Role.create({
        id: "system-admin",
        name: "System Internal Administrator",
        permissions: ["*"],
        description: "Internal system supervisor role with unrestricted access",
      }),
    ];

    for (const role of standardRoles) {
      this.roles.set(role.id, role);
    }
  }

  async saveRole(role: Role): Promise<void> {
    this.roles.set(role.id, role);
  }

  async findRoleById(id: string): Promise<Role | null> {
    return this.roles.get(id) ?? null;
  }

  async findAllRoles(): Promise<readonly Role[]> {
    return Object.freeze(Array.from(this.roles.values()));
  }

  async getRolesForPrincipal(principal: Principal): Promise<readonly Role[]> {
    if (!principal || !Array.isArray(principal.roles)) {
      return Object.freeze([]);
    }

    const resolved: Role[] = [];
    for (const roleId of principal.roles) {
      const role = this.roles.get(roleId);
      if (role) {
        resolved.push(role);
      }
    }

    return Object.freeze(resolved);
  }
}
