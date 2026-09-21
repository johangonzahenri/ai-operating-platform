import { DatabaseSync } from "node:sqlite";
import { Role, RoleRepository } from "../../../domain/security/authorization.js";
import { Principal } from "../../../domain/security/security.js";
import { SqliteDatabase } from "./sqlite-database.js";

export class SqliteRoleRepository implements RoleRepository {
  constructor(private readonly db: SqliteDatabase) {
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.transaction(() => {
      const conn = this.db.getDatabase();
      conn.exec(`
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          tenant_id TEXT,
          description TEXT,
          permissions TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS role_assignments (
          principal_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          tenant_id TEXT,
          assigned_at TEXT NOT NULL,
          PRIMARY KEY (principal_id, role_id, tenant_id),
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_role_assignments_principal ON role_assignments(principal_id);
      `);
    });
  }

  async createRole(role: Role, tenantId?: string): Promise<void> {
    this.db.transaction(() => {
      const conn = this.db.getDatabase();
      const now = new Date().toISOString();
      const stmt = conn.prepare(`
        INSERT INTO roles (id, name, tenant_id, description, permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          tenant_id = COALESCE(excluded.tenant_id, roles.tenant_id),
          description = excluded.description,
          permissions = excluded.permissions,
          updated_at = excluded.updated_at
      `);
      stmt.run(
        role.id,
        role.name,
        tenantId || null,
        role.description || null,
        JSON.stringify(role.permissions),
        now,
        now
      );
    });
  }

  async findById(id: string): Promise<Role | null> {
    return this.findRoleById(id);
  }

  async findRoleById(id: string): Promise<Role | null> {
    const conn = this.db.getDatabase();
    const stmt = conn.prepare("SELECT * FROM roles WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapToRole(row);
  }

  async findByTenantId(tenantId: string): Promise<readonly Role[]> {
    const conn = this.db.getDatabase();
    const stmt = conn.prepare("SELECT * FROM roles WHERE tenant_id = ?");
    const rows = stmt.all(tenantId) as any[];
    return Object.freeze(rows.map(row => this.mapToRole(row)));
  }

  async findAllRoles(): Promise<readonly Role[]> {
    const conn = this.db.getDatabase();
    const stmt = conn.prepare("SELECT * FROM roles");
    const rows = stmt.all() as any[];
    return Object.freeze(rows.map(row => this.mapToRole(row)));
  }

  async getRolesForPrincipal(principal: Principal): Promise<readonly Role[]> {
    const conn = this.db.getDatabase();
    const stmt = conn.prepare(`
      SELECT r.* FROM roles r
      JOIN role_assignments ra ON r.id = ra.role_id
      WHERE ra.principal_id = ? AND (ra.tenant_id = ? OR ra.tenant_id IS NULL)
    `);
    const rows = stmt.all(principal.id, principal.tenantId || null) as any[];
    
    const allRoles = new Map<string, Role>();
    for (const row of rows) {
      allRoles.set(row.id, this.mapToRole(row));
    }

    if (principal.roles && Array.isArray(principal.roles)) {
      for (const roleId of principal.roles) {
        if (!allRoles.has(roleId)) {
          const role = await this.findRoleById(roleId);
          if (role) {
            allRoles.set(role.id, role);
          }
        }
      }
    }

    return Object.freeze(Array.from(allRoles.values()));
  }

  async assignRole(principalId: string, roleId: string, tenantId?: string): Promise<void> {
    this.db.transaction(() => {
      const conn = this.db.getDatabase();
      const now = new Date().toISOString();
      const stmt = conn.prepare(`
        INSERT INTO role_assignments (principal_id, role_id, tenant_id, assigned_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `);
      stmt.run(principalId, roleId, tenantId || 'default', now);
    });
  }

  async revokeRole(principalId: string, roleId: string): Promise<void> {
    this.db.transaction(() => {
      const conn = this.db.getDatabase();
      const stmt = conn.prepare(`
        DELETE FROM role_assignments
        WHERE principal_id = ? AND role_id = ?
      `);
      stmt.run(principalId, roleId);
    });
  }

  async findRolesForPrincipal(principalId: string, tenantId?: string): Promise<readonly Role[]> {
    const conn = this.db.getDatabase();
    const stmt = conn.prepare(`
      SELECT r.* FROM roles r
      JOIN role_assignments ra ON r.id = ra.role_id
      WHERE ra.principal_id = ? AND (ra.tenant_id = ? OR ra.tenant_id = 'default')
    `);
    const rows = stmt.all(principalId, tenantId || 'default') as any[];
    return Object.freeze(rows.map(row => this.mapToRole(row)));
  }

  private mapToRole(row: any): Role {
    return Role.create({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      permissions: JSON.parse(row.permissions),
    });
  }
}
