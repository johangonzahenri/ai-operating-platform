import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { ApiKeyRecord, ApiKeyValidationError } from "../../src/domain/security/authentication.js";
import {
  ApiKeyAuthenticationProvider,
  BearerTokenAuthenticationProvider,
  AuthenticationService,
} from "../../src/application/security/authentication-service.js";
import { InMemoryApiKeyRepository } from "../../src/infrastructure/security/in-memory-api-key-repository.js";
import { EventPublisher, DomainEvent } from "../../src/domain/events/events.js";

class MockEventPublisher implements EventPublisher {
  readonly publishedEvents: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publishedEvents.push(event);
  }
}

function createJwt(header: object, payload: object, secret: string): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = headerB64 + "." + payloadB64;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return signingInput + "." + sig;
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
    permissions: ["data.read"],
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
    permissions: ["tool.execute"],
  });
  await repo.save(record);

  const res1 = await provider.authenticate("client1." + secret);
  assert.equal(res1.authenticated, true);
  assert.equal(res1.principal?.id, "agent_007");
  assert.equal(res1.principal?.type, "AGENT");
  assert.equal(res1.principal?.hasPermission("tool.execute"), true);
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

test("5. BearerTokenAuthenticationProvider: validates JWT with HS256 signature and claims", async () => {
  const jwtSecret = "super_jwt_secret_32_bytes_long_key_1234";
  const provider = new BearerTokenAuthenticationProvider({
    secretOrPublicKey: jwtSecret,
    algorithm: "HS256",
    issuer: "ai-platform-auth",
    audience: "ai-platform-runtime",
  });

  const validToken = createJwt(
    { alg: "HS256", typ: "JWT" },
    {
      sub: "agent_planner",
      principalType: "AGENT",
      iss: "ai-platform-auth",
      aud: "ai-platform-runtime",
      exp: Math.floor(Date.now() / 1000) + 3600,
      roles: ["planner"],
      permissions: ["plan.create"],
    },
    jwtSecret,
  );

  const res = await provider.authenticate(validToken);
  assert.equal(res.authenticated, true);
  assert.equal(res.principal?.id, "agent_planner");
  assert.equal(res.principal?.type, "AGENT");
  assert.equal(res.principal?.hasPermission("plan.create"), true);
  assert.equal(res.context?.authenticated, true);
});

test("6. BearerTokenAuthenticationProvider: strictly rejects alg: none and tampered payload", async () => {
  const jwtSecret = "super_jwt_secret_32_bytes_long_key_1234";
  const provider = new BearerTokenAuthenticationProvider({
    secretOrPublicKey: jwtSecret,
    algorithm: "HS256",
  });

  const noneHeaderB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify({ sub: "admin", principalType: "HUMAN" })).toString("base64url");
  const algNoneToken = noneHeaderB64 + "." + payloadB64 + ".";

  const algNoneRes = await provider.authenticate(algNoneToken);
  assert.equal(algNoneRes.authenticated, false);
  assert.equal(algNoneRes.code, "UNSUPPORTED_ALGORITHM");

  const validToken = createJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "user1" },
    jwtSecret,
  );
  const parts = validToken.split(".");
  const tamperedPayloadB64 = Buffer.from(JSON.stringify({ sub: "admin", roles: ["admin"] })).toString("base64url");
  const tamperedToken = parts[0] + "." + tamperedPayloadB64 + "." + parts[2];

  const tamperedRes = await provider.authenticate(tamperedToken);
  assert.equal(tamperedRes.authenticated, false);
  assert.equal(tamperedRes.code, "INVALID_SIGNATURE");
});

test("7. BearerTokenAuthenticationProvider: rejects expired token, issuer/audience mismatch, and SYSTEM escalation", async () => {
  const jwtSecret = "super_jwt_secret_32_bytes_long_key_1234";
  const provider = new BearerTokenAuthenticationProvider({
    secretOrPublicKey: jwtSecret,
    algorithm: "HS256",
    issuer: "expected-iss",
    audience: "expected-aud",
  });

  const expiredToken = createJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "u1", iss: "expected-iss", aud: "expected-aud", exp: Math.floor(Date.now() / 1000) - 100 },
    jwtSecret,
  );
  const expiredRes = await provider.authenticate(expiredToken);
  assert.equal(expiredRes.authenticated, false);
  assert.equal(expiredRes.code, "TOKEN_EXPIRED");

  const wrongIssToken = createJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "u1", iss: "wrong-iss", aud: "expected-aud" },
    jwtSecret,
  );
  const wrongIssRes = await provider.authenticate(wrongIssToken);
  assert.equal(wrongIssRes.authenticated, false);
  assert.equal(wrongIssRes.code, "INVALID_ISSUER");

  const systemEscalationToken = createJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "malicious", principalType: "SYSTEM", iss: "expected-iss", aud: "expected-aud" },
    jwtSecret,
  );
  const systemRes = await provider.authenticate(systemEscalationToken);
  assert.equal(systemRes.authenticated, false);
  assert.equal(systemRes.code, "PRIVILEGE_ESCALATION_BLOCKED");
});

test("8. AuthenticationService: extracts and authenticates from Authorization, X-API-Key, X-Agent-Token headers and handles anonymous", async () => {
  const repo = new InMemoryApiKeyRepository();
  const apiKeySecret = "api_secret_12345";
  await repo.save(
    ApiKeyRecord.create({
      id: "key10",
      principalId: "service_logger",
      keyHash: ApiKeyRecord.hashSecret(apiKeySecret),
    }),
  );

  const jwtSecret = "jwt_secret_for_header_testing_12345";
  const service = new AuthenticationService(undefined, [
    new ApiKeyAuthenticationProvider(repo),
    new BearerTokenAuthenticationProvider({ secretOrPublicKey: jwtSecret }),
  ]);

  const xApiKeyRes = await service.authenticateFromHeaders({ "x-api-key": "key10." + apiKeySecret });
  assert.equal(xApiKeyRes.authenticated, true);
  assert.equal(xApiKeyRes.principal?.id, "service_logger");

  const authApiKeyRes = await service.authenticateFromHeaders({ authorization: "ApiKey key10." + apiKeySecret });
  assert.equal(authApiKeyRes.authenticated, true);
  assert.equal(authApiKeyRes.principal?.id, "service_logger");

  const token = createJwt({ alg: "HS256" }, { sub: "agent_alpha", principalType: "AGENT" }, jwtSecret);
  const authBearerRes = await service.authenticateFromHeaders({ authorization: "Bearer " + token });
  assert.equal(authBearerRes.authenticated, true);
  assert.equal(authBearerRes.principal?.id, "agent_alpha");

  const anonRes = await service.authenticateFromHeaders({});
  assert.equal(anonRes.authenticated, false);
  assert.equal(anonRes.code, "NO_CREDENTIALS_PROVIDED");
  assert.equal(anonRes.principal?.id, "anonymous");
  assert.equal(anonRes.principal?.hasRole("anonymous"), true);
  assert.equal(anonRes.context?.authenticated, false);
});

test("9. AuthenticationService: publishes domain events without leaking raw secrets/credentials", async () => {
  const repo = new InMemoryApiKeyRepository();
  const secret = "sensitive_secret_do_not_leak";
  await repo.save(
    ApiKeyRecord.create({
      id: "sec_key",
      principalId: "worker_secure",
      keyHash: ApiKeyRecord.hashSecret(secret),
    }),
  );

  const eventPublisher = new MockEventPublisher();
  const service = new AuthenticationService(eventPublisher, [
    new ApiKeyAuthenticationProvider(repo),
  ]);

  await service.authenticate({
    credentialType: "API_KEY",
    credential: "sec_key." + secret,
    correlationId: "corr-success-1",
  });

  assert.equal(eventPublisher.publishedEvents.length, 1);
  const successEvent = eventPublisher.publishedEvents[0]!;
  assert.equal(successEvent.type, "auth.succeeded");
  assert.equal(successEvent.traceId, "corr-success-1");
  assert.equal(successEvent.payload.principalId, "worker_secure");

  const eventJson = JSON.stringify(successEvent);
  assert.equal(eventJson.includes(secret), false);

  await service.authenticate({
    credentialType: "API_KEY",
    credential: "sec_key.wrong_secret_attempt",
    correlationId: "corr-fail-1",
  });

  assert.equal(eventPublisher.publishedEvents.length, 2);
  const failEvent = eventPublisher.publishedEvents[1]!;
  assert.equal(failEvent.type, "auth.failed");
  assert.equal(failEvent.traceId, "corr-fail-1");
  assert.equal(JSON.stringify(failEvent).includes("wrong_secret_attempt"), false);
});
