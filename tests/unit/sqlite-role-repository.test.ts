import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteRoleRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-role-repository.js";
import { Role } from "../../src/domain/security/authorization.js";

describe("SqliteRoleRepository", () => {
  let db: SqliteDatabase;
  let repo: SqliteRoleRepository;

  beforeEach(() => {
    db = new SqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteRoleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should create and find a role by id", async () => {
    const role = Role.create({
      id: "admin",
      name: "Admin",
      permissions: ["*"],
    });

    await repo.createRole(role, "tenant-1");
    const found = await repo.findById("admin");
    assert.ok(found);
    assert.strictEqual(found.id, "admin");
    assert.strictEqual(found.name, "Admin");
    assert.deepStrictEqual(found.permissions, ["*"]);
  });

  it("should find roles by tenantId", async () => {
    const role1 = Role.create({ id: "r1", name: "R1", permissions: ["p1"] });
    const role2 = Role.create({ id: "r2", name: "R2", permissions: ["p2"] });
    
    await repo.createRole(role1, "t1");
    await repo.createRole(role2, "t2");

    const t1Roles = await repo.findByTenantId("t1");
    assert.strictEqual(t1Roles.length, 1);
    assert.strictEqual(t1Roles[0]?.id, "r1");
  });

  it("should handle role assignment and revocation", async () => {
    const role = Role.create({ id: "user", name: "User", permissions: ["read"] });
    await repo.createRole(role, "t1");

    await repo.assignRole("p1", "user", "t1");
    const assigned = await repo.findRolesForPrincipal("p1", "t1");
    assert.strictEqual(assigned.length, 1);
    assert.strictEqual(assigned[0]?.id, "user");

    await repo.revokeRole("p1", "user");
    const revoked = await repo.findRolesForPrincipal("p1", "t1");
    assert.strictEqual(revoked.length, 0);
  });

  it("should isolate tenants", async () => {
    const role = Role.create({ id: "t-role", name: "TRole", permissions: [] });
    await repo.createRole(role, "t1");
    await repo.assignRole("p1", "t-role", "t1");

    // Lookup with different tenant returns empty
    const otherTenantRoles = await repo.findRolesForPrincipal("p1", "t2");
    assert.strictEqual(otherTenantRoles.length, 0);
  });

  it("should handle concurrent role assignments gracefully", async () => {
    const role = Role.create({ id: "concurrent", name: "Concurrent", permissions: [] });
    await repo.createRole(role, "t1");

    // Assign multiple times
    await Promise.all([
      repo.assignRole("p1", "concurrent", "t1"),
      repo.assignRole("p1", "concurrent", "t1"),
      repo.assignRole("p1", "concurrent", "t1")
    ]);

    const roles = await repo.findRolesForPrincipal("p1", "t1");
    assert.strictEqual(roles.length, 1);
  });
});
