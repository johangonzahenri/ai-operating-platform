import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import {
  ApiKeyRecord,
  ApiKeyValidationError,
  BearerTokenClaims,
  BearerTokenVerifier,
} from "../../src/domain/security/authentication.js";
import {
  ApiKeyAuthenticationProvider,
  BearerTokenAuthenticationProvider,
  AuthenticationService,
} from "../../src/application/security/authentication-service.js";
import { InMemoryApiKeyRepository } from "../../src/infrastructure/security/in-memory-api-key-repository.js";
import { EventPublisher, DomainEvent } from "../../src/domain/events/events.js";
import { evaluateFailClosedAuthorization } from "../../src/domain/security/security.js";

class MockEventPublisher implements EventPublisher {
  readonly publishedEvents: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publishedEvents.push(event);
  }
}

// Test adapter fixture simulating a trusted JWT verifier (e.g. jose/jsonwebtoken adapter)
class MockTrustedJwtVerifier implements BearerTokenVerifier {
  constructor(
    private readonly validTokens: Map<string, BearerTokenClaims> = new Map(),
    private readonly shouldThrow: boolean = false
  ) {}

  async verifyToken(token: string): Promise<BearerTokenClaims | null> {
    if (this.shouldThrow) {
      throw new Error("Simulated internal cryptographic verification crash with raw token " + token);
    }
    return this.validTokens.get(token) ?? null;
  }
}

test("1. ApiKeyRecord: creates valid record with hashed secret and timing-safe verification", () => {
  const secret = "secret_key_1234567890";
  const keyHash = ApiKeyRecord.hashSecret(secret);

  const record = ApiKeyRecord.create({
    id: "key_abc",
    principalId: "service_worker_1",
    principalType: "SERVICE",
    keyHash,
    roles: ["service", "data_reader"],
    tenantId: "tenant-1",
  });

  assert.equal(record.id, "key_abc");
  assert.equal(record.principalId, "service_worker_1");
  assert.equal(record.principalType, "SERVICE");
  assert.equal(record.verifySecret(secret), true);
  assert.equal(record.verifySecret("wrong_secret"), false);
  assert.equal(record.isExpired(), false);
  assert.equal(Object.isFrozen(record), true);
});

test("2. ApiKeyRecord: rejects SYSTEM principal type and invalid fields", () => {
  const secret = "some_secret";
  const keyHash = ApiKeyRecord.hashSecret(secret);

  assert.throws(
    () => ApiKeyRecord.create({ id: "key1", principalId: "p1", principalType: "SYSTEM", keyHash }),
    (err: Error) => err instanceof ApiKeyValidationError && err.message.includes("SYSTEM"),
  );

  assert.throws(
    () => ApiKeyRecord.create({ id: "", principalId: "p1", keyHash }),
    (err: Error) => err instanceof ApiKeyValidationError,
  );
});

test("3. ApiKeyAuthenticationProvider: authenticates valid key in keyId.secret and ak_ formats", async () => {
  const repo = new InMemoryApiKeyRepository();
  const provider = new ApiKeyAuthenticationProvider(repo);

  const secret = "valid_secret_xyz";
  const record = ApiKeyRecord.create({
    id: "client1",
    principalId: "agent_007",
    principalType: "AGENT",
    keyHash: ApiKeyRecord.hashSecret(secret),
    roles: ["agent"],
  });
  await repo.save(record);

  const res1 = await provider.authenticate("client1." + secret);
  assert.equal(res1.authenticated, true);
  assert.equal(res1.principal?.id, "agent_007");
  assert.equal(res1.principal?.type, "AGENT");
  assert.equal(res1.context?.authenticated, true);

  const res2 = await provider.authenticate("ak_client1_" + secret);
  assert.equal(res2.authenticated, true);
  assert.equal(res2.principal?.id, "agent_007");
});

test("4. ApiKeyAuthenticationProvider: rejects invalid secret, unknown key, revoked key, and expired key", async () => {
  const repo = new InMemoryApiKeyRepository();
  const provider = new ApiKeyAuthenticationProvider(repo);

  const secret = "secret_123";
  const activeRecord = ApiKeyRecord.create({
    id: "k_active",
    principalId: "user_1",
    keyHash: ApiKeyRecord.hashSecret(secret),
  });
  const revokedRecord = ApiKeyRecord.create({
    id: "k_revoked",
    principalId: "user_2",
    keyHash: ApiKeyRecord.hashSecret(secret),
    status: "REVOKED",
  });
  const expiredRecord = ApiKeyRecord.create({
    id: "k_expired",
    principalId: "user_3",
    keyHash: ApiKeyRecord.hashSecret(secret),
    createdAt: new Date(Date.now() - 20000),
    expiresAt: new Date(Date.now() - 10000),
  });

  await repo.save(activeRecord);
  await repo.save(revokedRecord);
  await repo.save(expiredRecord);

  const invalidSecret = await provider.authenticate("k_active.wrong");
  assert.equal(invalidSecret.authenticated, false);
  assert.equal(invalidSecret.code, "INVALID_SECRET");

  const unknownKey = await provider.authenticate("k_unknown.secret");
  assert.equal(unknownKey.authenticated, false);
  assert.equal(unknownKey.code, "KEY_NOT_FOUND");

  const revoked = await provider.authenticate("k_revoked." + secret);
  assert.equal(revoked.authenticated, false);
  assert.equal(revoked.code, "KEY_REVOKED");

  const expired = await provider.authenticate("k_expired." + secret);
  assert.equal(expired.authenticated, false);
  assert.equal(expired.code, "KEY_EXPIRED");
});

test("5. BearerTokenAuthenticationProvider: safely fails closed when unconfigured (pending trusted adapter)", async () => {
  const provider = new BearerTokenAuthenticationProvider(); // no verifier

  const res = await provider.authenticate("some.jwt.token");
  assert.equal(res.authenticated, false);
  assert.equal(res.code, "UNTRUSTED_BEARER_PROVIDER");
  assert.equal(res.reason, "JWT verification pending trusted adapter/dependency");
});

test("6. BearerTokenAuthenticationProvider: verifies token via trusted adapter and enforces canonical PrincipalType", async () => {
  const tokenStore = new Map<string, BearerTokenClaims>();
  tokenStore.set("valid-jwt-token-123", {
    sub: "agent_planner_01",
    principalType: "AGENT",
    name: "Planner Agent",
    roles: ["planner"],
    tenantId: "tenant-ai",
  });

  const verifier = new MockTrustedJwtVerifier(tokenStore);
  const provider = new BearerTokenAuthenticationProvider({ verifier });

  const res = await provider.authenticate("valid-jwt-token-123");
  assert.equal(res.authenticated, true);
  assert.equal(res.principal?.id, "agent_planner_01");
  assert.equal(res.principal?.type, "AGENT");
  assert.equal(res.principal?.name, "Planner Agent");
  assert.equal(res.context?.authenticated, true);
  assert.equal(res.context?.tenantId, "tenant-ai");

  const invalidRes = await provider.authenticate("unregistered-token");
  assert.equal(invalidRes.authenticated, false);
  assert.equal(invalidRes.code, "INVALID_TOKEN");
});

test("7. BearerTokenAuthenticationProvider: strictly rejects SYSTEM escalation, missing subject, and sanitizes verifier crashes", async () => {
  const tokenStore = new Map<string, BearerTokenClaims>();
  tokenStore.set("system-escalation-token", {
    sub: "system-internal",
    principalType: "SYSTEM",
  });
  tokenStore.set("missing-sub-token", {
    sub: "",
    principalType: "HUMAN",
  });

  const verifier = new MockTrustedJwtVerifier(tokenStore);
  const provider = new BearerTokenAuthenticationProvider({ verifier });

  const systemRes = await provider.authenticate("system-escalation-token");
  assert.equal(systemRes.authenticated, false);
  assert.equal(systemRes.code, "PRIVILEGE_ESCALATION_BLOCKED");

  const missingSubRes = await provider.authenticate("missing-sub-token");
  assert.equal(missingSubRes.authenticated, false);
  assert.equal(missingSubRes.code, "MISSING_SUBJECT");

  const crashingVerifier = new MockTrustedJwtVerifier(new Map(), true);
  const crashingProvider = new BearerTokenAuthenticationProvider({ verifier: crashingVerifier });
  const crashRes = await crashingProvider.authenticate("crash-token-secret-data");
  assert.equal(crashRes.authenticated, false);
  assert.equal(crashRes.code, "TOKEN_VERIFICATION_FAILED");
  assert.equal(crashRes.reason, "Bearer token verification failed");
  // Ensure the raw error message containing crash-token-secret-data did NOT leak into reason
  assert.equal(crashRes.reason?.includes("crash-token-secret-data"), false);
});

test("8. Mandatory Control Test: Authentication != Authorization (authenticated credential does not grant implicit admin or wildcard permissions)", async () => {
  const tokenStore = new Map<string, BearerTokenClaims>();
  tokenStore.set("user-jwt", {
    sub: "regular_user_42",
    principalType: "HUMAN",
    roles: ["user", "viewer"],
  });

  const verifier = new MockTrustedJwtVerifier(tokenStore);
  const provider = new BearerTokenAuthenticationProvider({ verifier });

  const authResult = await provider.authenticate("user-jwt");
  assert.equal(authResult.authenticated, true);
  assert.ok(authResult.principal);
  assert.ok(authResult.context);

  // Assert: NOT implicit admin and NOT implicit "*"
  assert.equal(authResult.principal.hasRole("admin"), false);
  assert.equal(authResult.principal.hasPermission("*"), false);
  assert.equal(authResult.principal.hasPermission("admin.execute"), false);
  assert.equal(authResult.principal.permissions.length, 0);

  // Assert: Policy Gateway / Authorization fails-closed for protected action requiring privileged permission
  const decision = evaluateFailClosedAuthorization({
    context: authResult.context,
    action: "system.reboot",
    resourceType: "API",
    resourceId: "platform-kernel",
    requiredPermission: "system.reboot",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "SECURITY_PERMISSION_DENIED");
});

test("9. AuthenticationService: extracts and authenticates from Authorization, X-API-Key, X-Agent-Token headers and handles anonymous", async () => {
  const repo = new InMemoryApiKeyRepository();
  const apiKeySecret = "api_secret_12345";
  await repo.save(
    ApiKeyRecord.create({
      id: "key10",
      principalId: "service_logger",
      keyHash: ApiKeyRecord.hashSecret(apiKeySecret),
    }),
  );

  const tokenStore = new Map<string, BearerTokenClaims>();
  tokenStore.set("jwt-agent-token", {
    sub: "agent_alpha",
    principalType: "AGENT",
  });
  const verifier = new MockTrustedJwtVerifier(tokenStore);

  const service = new AuthenticationService(undefined, [
    new ApiKeyAuthenticationProvider(repo),
    new BearerTokenAuthenticationProvider({ verifier }),
  ]);

  const xApiKeyRes = await service.authenticateFromHeaders({ "x-api-key": "key10." + apiKeySecret });
  assert.equal(xApiKeyRes.authenticated, true);
  assert.equal(xApiKeyRes.principal?.id, "service_logger");

  const authApiKeyRes = await service.authenticateFromHeaders({ authorization: "ApiKey key10." + apiKeySecret });
  assert.equal(authApiKeyRes.authenticated, true);
  assert.equal(authApiKeyRes.principal?.id, "service_logger");

  const authBearerRes = await service.authenticateFromHeaders({ authorization: "Bearer jwt-agent-token" });
  assert.equal(authBearerRes.authenticated, true);
  assert.equal(authBearerRes.principal?.id, "agent_alpha");

  const xAgentTokenRes = await service.authenticateFromHeaders({ "x-agent-token": "jwt-agent-token" });
  assert.equal(xAgentTokenRes.authenticated, true);
  assert.equal(xAgentTokenRes.principal?.id, "agent_alpha");

  const anonRes = await service.authenticateFromHeaders({});
  assert.equal(anonRes.authenticated, false);
  assert.equal(anonRes.code, "NO_CREDENTIALS_PROVIDED");
  assert.equal(anonRes.principal?.id, "anonymous");
  assert.equal(anonRes.principal?.hasRole("anonymous"), true);
  assert.equal(anonRes.context?.authenticated, false);
});

test("10. Secret Handling & Event Security: secrets/tokens/keys are never exposed in events or errors", async () => {
  const repo = new InMemoryApiKeyRepository();
  const sensitiveKeySecret = "SUPER_SECRET_API_KEY_DO_NOT_EXPOSE_9999";
  const sensitiveJwt = "SUPER_SECRET_JWT_BEARER_TOKEN_HEADER_DATA_1111";

  await repo.save(
    ApiKeyRecord.create({
      id: "sec_key",
      principalId: "worker_secure",
      keyHash: ApiKeyRecord.hashSecret(sensitiveKeySecret),
    }),
  );

  const eventPublisher = new MockEventPublisher();
  const service = new AuthenticationService(eventPublisher, [
    new ApiKeyAuthenticationProvider(repo),
  ]);

  // Successful auth
  await service.authenticate({
    credentialType: "API_KEY",
    credential: "sec_key." + sensitiveKeySecret,
    correlationId: "corr-success-1",
  });

  // Failed auth
  await service.authenticate({
    credentialType: "API_KEY",
    credential: "sec_key.WRONG_SECRET_TRY",
    correlationId: "corr-fail-1",
  });

  // Unsupported type
  await service.authenticate({
    credentialType: "BEARER_TOKEN",
    credential: sensitiveJwt,
    correlationId: "corr-unsupported-1",
  });

  assert.equal(eventPublisher.publishedEvents.length, 3);

  const allEventsJson = JSON.stringify(eventPublisher.publishedEvents);
  assert.equal(allEventsJson.includes(sensitiveKeySecret), false, "Raw API secret must not appear in events");
  assert.equal(allEventsJson.includes("WRONG_SECRET_TRY"), false, "Failed attempt secret must not appear in events");
  assert.equal(allEventsJson.includes(sensitiveJwt), false, "JWT token must not appear in events");
});
