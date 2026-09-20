import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiCredential,
  ApiCredentialValidationError,
} from "../../src/domain/security/api-credential.js";

describe("ApiCredential Domain Aggregate", () => {
  it("creates a valid active ApiCredential", () => {
    const rawSecret = "aop_live_cred123_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const keyHash = ApiCredential.hashSecret(rawSecret);

    const cred = ApiCredential.create({
      id: "cred123",
      principalId: "srv-order-svc",
      principalType: "SERVICE",
      tenantId: "tenant-tentaciones",
      applicationId: "tentaciones-commerce",
      name: "Tentaciones Order Service Key",
      keyPrefix: "aop_live_cred123",
      keyHash,
      scopes: ["tasks.read", "tasks.create", "executions.read"],
    });

    assert.equal(cred.id, "cred123");
    assert.equal(cred.principalId, "srv-order-svc");
    assert.equal(cred.principalType, "SERVICE");
    assert.equal(cred.tenantId, "tenant-tentaciones");
    assert.equal(cred.applicationId, "tentaciones-commerce");
    assert.equal(cred.name, "Tentaciones Order Service Key");
    assert.equal(cred.status, "ACTIVE");
    assert.equal(cred.keyPrefix, "aop_live_cred123");
    assert.equal(cred.version, 1);
    assert.equal(cred.isActive(), true);
    assert.equal(cred.isRevoked(), false);
  });

  it("throws validation error on invalid or missing fields", () => {
    assert.throws(
      () =>
        ApiCredential.create({
          id: "",
          principalId: "srv-1",
          tenantId: "t1",
          applicationId: "a1",
          name: "Test",
          keyPrefix: "pre",
          keyHash: "hash",
          scopes: ["tasks.read"],
        }),
      ApiCredentialValidationError
    );

    assert.throws(
      () =>
        ApiCredential.create({
          id: "cred1",
          principalId: "",
          tenantId: "t1",
          applicationId: "a1",
          name: "Test",
          keyPrefix: "pre",
          keyHash: "hash",
          scopes: ["tasks.read"],
        }),
      ApiCredentialValidationError
    );

    assert.throws(
      () =>
        ApiCredential.create({
          id: "cred1",
          principalId: "srv-1",
          tenantId: "",
          applicationId: "a1",
          name: "Test",
          keyPrefix: "pre",
          keyHash: "hash",
          scopes: ["tasks.read"],
        }),
      ApiCredentialValidationError
    );
  });

  it("verifies secrets using timing-safe comparison", () => {
    const rawSecret = "aop_live_cred999_secretentropy1234567890abcdef1234567890";
    const keyHash = ApiCredential.hashSecret(rawSecret);

    const cred = ApiCredential.create({
      id: "cred999",
      principalId: "srv-diag",
      tenantId: "tenant-auto",
      applicationId: "vehicle-parts",
      name: "Diag Key",
      keyPrefix: "aop_live_cred999",
      keyHash,
      scopes: ["tasks.read"],
    });

    assert.equal(cred.verifySecret(rawSecret), true);
    assert.equal(cred.verifySecret("wrong_secret_123"), false);
    assert.equal(cred.verifySecret(""), false);
  });

  it("evaluates scopes with exact match and wildcard support", () => {
    const cred = ApiCredential.create({
      id: "cred-scoped",
      principalId: "srv-worker",
      tenantId: "tenant-demo",
      applicationId: "demo-app",
      name: "Worker Key",
      keyPrefix: "aop_live_cred-scoped",
      keyHash: ApiCredential.hashSecret("aop_live_cred-scoped_secret"),
      scopes: ["tasks.*", "devices.print", "autonomous.operations.execute"],
    });

    assert.equal(cred.hasScope("tasks.read"), true);
    assert.equal(cred.hasScope("tasks.create"), true);
    assert.equal(cred.hasScope("devices.print"), true);
    assert.equal(cred.hasScope("devices.delete"), false);
    assert.equal(cred.hasScope("credentials.manage"), false);

    const wildcardCred = ApiCredential.create({
      id: "cred-admin",
      principalId: "srv-admin",
      tenantId: "tenant-demo",
      applicationId: "admin-app",
      name: "Admin Key",
      keyPrefix: "aop_live_cred-admin",
      keyHash: ApiCredential.hashSecret("aop_live_cred-admin_secret"),
      scopes: ["*"],
    });

    assert.equal(wildcardCred.hasScope("any.random.action"), true);
  });

  it("handles expiration correctly", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10000);
    const future = new Date(now.getTime() + 10000);

    const expiredCred = ApiCredential.create({
      id: "cred-exp",
      principalId: "srv-1",
      tenantId: "t1",
      applicationId: "a1",
      name: "Expired Key",
      keyPrefix: "aop_live_cred-exp",
      keyHash: ApiCredential.hashSecret("secret"),
      scopes: ["tasks.read"],
      createdAt: new Date(now.getTime() - 20000),
      expiresAt: past,
    });

    assert.equal(expiredCred.isExpired(now), true);
    assert.equal(expiredCred.isActive(now), false);

    const activeCred = ApiCredential.create({
      id: "cred-act",
      principalId: "srv-1",
      tenantId: "t1",
      applicationId: "a1",
      name: "Active Key",
      keyPrefix: "aop_live_cred-act",
      keyHash: ApiCredential.hashSecret("secret"),
      scopes: ["tasks.read"],
      expiresAt: future,
    });

    assert.equal(activeCred.isExpired(now), false);
    assert.equal(activeCred.isActive(now), true);
  });

  it("records usage immutably", () => {
    const cred = ApiCredential.create({
      id: "cred-usage",
      principalId: "srv-1",
      tenantId: "t1",
      applicationId: "a1",
      name: "Usage Key",
      keyPrefix: "aop_live_cred-usage",
      keyHash: ApiCredential.hashSecret("secret"),
      scopes: ["tasks.read"],
    });

    assert.equal(cred.lastUsedAt, undefined);
    const usedAt = new Date();
    const updated = cred.recordUsage(usedAt);

    assert.notEqual(cred, updated);
    assert.equal(updated.lastUsedAt?.toISOString(), usedAt.toISOString());
    assert.equal(updated.version, cred.version + 1);
  });

  it("revokes credential with reason and timestamp", () => {
    const cred = ApiCredential.create({
      id: "cred-rev",
      principalId: "srv-1",
      tenantId: "t1",
      applicationId: "a1",
      name: "Revokable Key",
      keyPrefix: "aop_live_cred-rev",
      keyHash: ApiCredential.hashSecret("secret"),
      scopes: ["tasks.read"],
    });

    const revoked = cred.revoke("Security breach detected");
    assert.equal(revoked.status, "REVOKED");
    assert.equal(revoked.isRevoked(), true);
    assert.equal(revoked.isActive(), false);
    assert.equal(revoked.metadata?.revocationReason, "Security breach detected");
    assert.ok(revoked.revokedAt instanceof Date);
  });

  it("converts to safe DTO without leaking keyHash or raw secret", () => {
    const cred = ApiCredential.create({
      id: "cred-dto",
      principalId: "srv-dto",
      principalType: "SERVICE",
      tenantId: "tenant-dto",
      applicationId: "app-dto",
      name: "DTO Test Key",
      keyPrefix: "aop_live_cred-dto",
      keyHash: ApiCredential.hashSecret("raw_secret_value"),
      scopes: ["tasks.read"],
    });

    const dto = cred.toSafeDTO();
    assert.equal(dto.id, "cred-dto");
    assert.equal(dto.keyPrefix, "aop_live_cred-dto");
    assert.equal("keyHash" in dto, false);
    assert.equal("rawSecret" in dto, false);
  });

  it("maps to Principal accurately", () => {
    const cred = ApiCredential.create({
      id: "cred-princ",
      principalId: "srv-order",
      principalType: "SERVICE",
      tenantId: "tenant-commerce",
      applicationId: "tentaciones",
      name: "Order Service",
      keyPrefix: "aop_live_cred-princ",
      keyHash: ApiCredential.hashSecret("secret"),
      scopes: ["tasks.read", "tasks.create"],
    });

    const principal = cred.toPrincipal();
    assert.equal(principal.id, "srv-order");
    assert.equal(principal.type, "SERVICE");
    assert.equal(principal.tenantId, "tenant-commerce");
    assert.deepEqual(principal.permissions, ["tasks.read", "tasks.create"]);
  });
});
