import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteApiCredentialRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-api-credential-repository.js";
import { ApiCredential } from "../../src/domain/security/api-credential.js";

test("SqliteApiCredentialRepository: In-memory CRUD and query indices", async () => {
  const db = new SqliteDatabase({ dbPath: ":memory:" });
  const repo = new SqliteApiCredentialRepository(db);

  const rawSecret1 = "aop_live_cred01_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const rawSecret2 = "aop_live_cred02_fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  const cred1 = ApiCredential.create({
    id: "cred01",
    principalId: "srv-order",
    principalType: "SERVICE",
    tenantId: "tenant-tentaciones",
    applicationId: "tentaciones-commerce",
    name: "Tentaciones Order Gateway",
    keyPrefix: "aop_live_cred01",
    keyHash: ApiCredential.hashSecret(rawSecret1),
    scopes: ["tasks.create", "tasks.read"],
  });

  const cred2 = ApiCredential.create({
    id: "cred02",
    principalId: "srv-parts",
    principalType: "SERVICE",
    tenantId: "tenant-auto",
    applicationId: "vehicle-parts",
    name: "Parts Diag Gateway",
    keyPrefix: "aop_live_cred02",
    keyHash: ApiCredential.hashSecret(rawSecret2),
    scopes: ["tasks.read", "devices.print"],
  });

  await repo.save(cred1);
  await repo.save(cred2);

  // Find by ID
  const foundById = await repo.findById("cred01");
  assert.ok(foundById);
  assert.equal(foundById.name, "Tentaciones Order Gateway");
  assert.equal(foundById.tenantId, "tenant-tentaciones");
  assert.equal(foundById.keyPrefix, "aop_live_cred01");

  // Find by keyHash
  const foundByHash = await repo.findByKeyHash(ApiCredential.hashSecret(rawSecret1));
  assert.ok(foundByHash);
  assert.equal(foundByHash.id, "cred01");

  // Find by keyPrefix
  const foundByPrefix = await repo.findByKeyPrefix("aop_live_cred02");
  assert.equal(foundByPrefix.length, 1);
  assert.equal(foundByPrefix[0]?.id, "cred02");

  // Find by TenantId
  const foundByTenant = await repo.findByTenantId("tenant-tentaciones");
  assert.equal(foundByTenant.length, 1);
  assert.equal(foundByTenant[0]?.id, "cred01");

  // Find by PrincipalId
  const foundByPrincipal = await repo.findByPrincipalId("srv-order", "tenant-tentaciones");
  assert.equal(foundByPrincipal.length, 1);
  assert.equal(foundByPrincipal[0]?.id, "cred01");

  // Update & Usage Tracking
  const used = cred1.recordUsage(new Date());
  await repo.save(used);

  const afterUsage = await repo.findById("cred01");
  assert.ok(afterUsage?.lastUsedAt);
  assert.equal(afterUsage.version, 2);

  // Delete
  await repo.delete("cred02", "tenant-auto");
  const afterDelete = await repo.findById("cred02");
  assert.equal(afterDelete, null);
});

test("SqliteApiCredentialRepository: Disk persistence across database re-opening", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aop-cred-test-"));
  const dbPath = path.join(tmpDir, "credentials.db");

  const rawSecret = "aop_live_cred_disk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  try {
    // 1. First DB session
    const db1 = new SqliteDatabase({ dbPath });
    const repo1 = new SqliteApiCredentialRepository(db1);

    const cred = ApiCredential.create({
      id: "cred-disk",
      principalId: "srv-durable",
      tenantId: "tenant-durable",
      applicationId: "durable-app",
      name: "Durable Disk Credential",
      keyPrefix: "aop_live_cred_disk",
      keyHash: ApiCredential.hashSecret(rawSecret),
      scopes: ["tasks.read", "credentials.manage"],
    });

    await repo1.save(cred);
    db1.close();

    // 2. Second DB session - verify durable recovery
    const db2 = new SqliteDatabase({ dbPath });
    const repo2 = new SqliteApiCredentialRepository(db2);

    const restored = await repo2.findById("cred-disk");
    assert.ok(restored);
    assert.equal(restored.name, "Durable Disk Credential");
    assert.equal(restored.tenantId, "tenant-durable");
    assert.equal(restored.verifySecret(rawSecret), true);

    db2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
