import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ApiCredentialService,
  CredentialNotFoundError,
  CredentialTenantMismatchError,
} from "../../src/application/security/api-credential-service.js";
import { InMemoryApiCredentialRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-api-credential-repository.js";
import { DomainEvent, EventPublisher } from "../../src/domain/events/events.js";

describe("ApiCredentialService", () => {
  let repository: InMemoryApiCredentialRepository;
  let publishedEvents: DomainEvent[];
  let eventPublisher: EventPublisher;
  let service: ApiCredentialService;

  beforeEach(() => {
    repository = new InMemoryApiCredentialRepository();
    publishedEvents = [];
    eventPublisher = {
      publish: (event: DomainEvent) => {
        publishedEvents.push(event);
      },
    };
    service = new ApiCredentialService(repository, eventPublisher);
  });

  it("creates credential, returns rawKey once, and saves hashed credential", async () => {
    const result = await service.createCredential({
      principalId: "srv-order-svc",
      principalType: "SERVICE",
      tenantId: "tenant-tentaciones",
      applicationId: "tentaciones-commerce",
      name: "Order Processing Service",
      scopes: ["tasks.create", "tasks.read", "executions.read"],
      expiresInMs: 3600000,
    });

    assert.ok(result.rawKey.startsWith("aop_live_"));
    assert.equal(result.credential.principalId, "srv-order-svc");
    assert.equal(result.credential.status, "ACTIVE");

    // Verify stored entity does not have rawKey
    const stored = await repository.findById(result.credential.id);
    assert.ok(stored);
    assert.notEqual(stored.keyHash, result.rawKey);

    // Verify event emission
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0]?.type, "auth.credential.created");
    assert.equal(publishedEvents[0]?.payload.principalId, "srv-order-svc");
  });

  it("verifies valid rawKey and creates SecurityContext", async () => {
    const created = await service.createCredential({
      principalId: "srv-parts-diag",
      tenantId: "tenant-automotive",
      applicationId: "vehicle-parts",
      name: "Parts Diagnostics Gateway",
      scopes: ["tasks.create", "devices.print"],
    });

    const verifyResult = await service.verifyCredential(created.rawKey, {
      requestId: "req-101",
      correlationId: "corr-202",
    });

    assert.equal(verifyResult.authenticated, true);
    assert.ok(verifyResult.context);
    assert.equal(verifyResult.context.tenantId, "tenant-automotive");
    assert.equal(verifyResult.context.requestId, "req-101");
    assert.equal(verifyResult.context.correlationId, "corr-202");
    assert.equal(verifyResult.principal?.id, "srv-parts-diag");

    // Verify usage event and lastUsedAt update
    const usedEvents = publishedEvents.filter(e => e.type === "auth.credential.used");
    assert.equal(usedEvents.length, 1);

    const updated = await repository.findById(created.credential.id);
    assert.ok(updated?.lastUsedAt);
  });

  it("rejects unknown API key fail-closed", async () => {
    const result = await service.verifyCredential("aop_live_cred999_invalidsecretvalue");
    assert.equal(result.authenticated, false);
    assert.equal(result.code, "KEY_NOT_FOUND");
  });

  it("rejects invalid secret for existing credential ID", async () => {
    const created = await service.createCredential({
      principalId: "srv-test",
      tenantId: "t1",
      applicationId: "a1",
      name: "Test Key",
    });

    // Construct valid key ID prefix with wrong secret entropy
    const forgedKey = `aop_live_${created.credential.id}_00000000000000000000000000000000`;
    const result = await service.verifyCredential(forgedKey);

    assert.equal(result.authenticated, false);
    assert.equal(result.code, "INVALID_SECRET");
  });

  it("rejects expired credential", async () => {
    const created = await service.createCredential({
      principalId: "srv-exp",
      tenantId: "t1",
      applicationId: "a1",
      name: "Expiring Key",
      expiresInMs: 1, // 1 millisecond
    });

    // Wait for key to expire
    await new Promise((r) => setTimeout(r, 20));

    const result = await service.verifyCredential(created.rawKey);
    assert.equal(result.authenticated, false);
    assert.equal(result.code, "KEY_EXPIRED");
  });

  it("rotates credential with grace period and returns new raw key", async () => {
    const initial = await service.createCredential({
      principalId: "srv-rotate-test",
      tenantId: "tenant-demo",
      applicationId: "demo-app",
      name: "Original Key",
      scopes: ["tasks.read"],
    });

    const rotated = await service.rotateCredential({
      credentialId: initial.credential.id,
      tenantId: "tenant-demo",
      gracePeriodMs: 60000,
      reason: "Routine quarterly rotation",
    });

    assert.notEqual(rotated.newCredential.id, initial.credential.id);
    assert.ok(rotated.newRawKey.startsWith("aop_live_"));

    // Old key remains valid during grace period
    const oldVerify = await service.verifyCredential(initial.rawKey);
    assert.equal(oldVerify.authenticated, true);

    // New key is also valid
    const newVerify = await service.verifyCredential(rotated.newRawKey);
    assert.equal(newVerify.authenticated, true);
  });

  it("rotates credential with immediate revocation when gracePeriodMs is 0", async () => {
    const initial = await service.createCredential({
      principalId: "srv-immed",
      tenantId: "tenant-demo",
      applicationId: "demo-app",
      name: "Immediate Rotate",
    });

    const rotated = await service.rotateCredential({
      credentialId: initial.credential.id,
      tenantId: "tenant-demo",
      gracePeriodMs: 0,
      reason: "Suspected key leak",
    });

    // Old key is revoked immediately
    const oldVerify = await service.verifyCredential(initial.rawKey);
    assert.equal(oldVerify.authenticated, false);
    assert.equal(oldVerify.code, "KEY_REVOKED");

    // New key is valid
    const newVerify = await service.verifyCredential(rotated.newRawKey);
    assert.equal(newVerify.authenticated, true);
  });

  it("revokes credential immediately", async () => {
    const initial = await service.createCredential({
      principalId: "srv-rev-test",
      tenantId: "tenant-demo",
      applicationId: "demo-app",
      name: "To Revoke",
    });

    const revoked = await service.revokeCredential(initial.credential.id, "tenant-demo", "Compromised key");
    assert.equal(revoked.status, "REVOKED");

    const verify = await service.verifyCredential(initial.rawKey);
    assert.equal(verify.authenticated, false);
    assert.equal(verify.code, "KEY_REVOKED");
  });

  it("enforces tenant boundary isolation fail-closed", async () => {
    const credA = await service.createCredential({
      principalId: "srv-tenant-a",
      tenantId: "tenant-a",
      applicationId: "app-a",
      name: "Tenant A Key",
    });

    // Listing for tenant-a returns only tenant-a credentials
    const listA = await service.listCredentials("tenant-a");
    assert.equal(listA.length, 1);
    assert.equal(listA[0]?.id, credA.credential.id);

    // Listing for tenant-b returns empty list
    const listB = await service.listCredentials("tenant-b");
    assert.equal(listB.length, 0);

    // Accessing credential across tenant boundary throws CredentialTenantMismatchError
    await assert.rejects(
      () => service.getCredentialById(credA.credential.id, "tenant-b"),
      CredentialTenantMismatchError
    );

    await assert.rejects(
      () => service.revokeCredential(credA.credential.id, "tenant-b", "Attempted cross-tenant revoke"),
      CredentialTenantMismatchError
    );
  });
});
