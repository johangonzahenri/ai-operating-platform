import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { JwtTokenVerifier } from "../../src/infrastructure/security/jwt-token-verifier.js";

function createJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signer: (data: string) => string
): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signatureB64 = signer(`${headerB64}.${payloadB64}`);
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

test("JwtTokenVerifier: verifies RS256 asymmetric token", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const verifier = new JwtTokenVerifier({
    issuer: "https://auth.ai-platform.internal",
    audience: "ai-platform-api",
  });
  verifier.registerKey("rsa-key-1", publicKey, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const token = createJwt(
    { alg: "RS256", kid: "rsa-key-1", typ: "JWT" },
    {
      sub: "usr_operator_01",
      iss: "https://auth.ai-platform.internal",
      aud: "ai-platform-api",
      exp: now + 3600,
      nbf: now - 10,
      roles: ["admin", "operator"],
      tenantId: "enterprise-tenant-1",
    },
    (data) => {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(data);
      return sign.sign(privateKey, "base64url");
    }
  );

  const claims = await verifier.verifyToken(token);
  assert.ok(claims);
  assert.equal(claims?.sub, "usr_operator_01");
  assert.deepEqual(claims?.roles, ["admin", "operator"]);
  assert.equal(claims?.tenantId, "enterprise-tenant-1");
});

test("JwtTokenVerifier: verifies ES256 ECDSA token", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const verifier = new JwtTokenVerifier();
  verifier.registerKey("ec-key-1", publicKey, "ES256");

  const token = createJwt(
    { alg: "ES256", kid: "ec-key-1" },
    { sub: "service-agent-42", roles: ["service"] },
    (data) => {
      const sign = crypto.createSign("SHA256");
      sign.update(data);
      return sign.sign(privateKey, "base64url");
    }
  );

  const claims = await verifier.verifyToken(token);
  assert.ok(claims);
  assert.equal(claims?.sub, "service-agent-42");
  assert.deepEqual(claims?.roles, ["service"]);
});

test("JwtTokenVerifier: handles key rotation and revocation", async () => {
  const rsa1 = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const rsa2 = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const verifier = new JwtTokenVerifier();
  verifier.registerKey("key-v1", rsa1.publicKey, "RS256");
  verifier.registerKey("key-v2", rsa2.publicKey, "RS256");

  const token1 = createJwt(
    { alg: "RS256", kid: "key-v1" },
    { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 1000 },
    (data) => {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(data);
      return sign.sign(rsa1.privateKey, "base64url");
    }
  );

  const token2 = createJwt(
    { alg: "RS256", kid: "key-v2" },
    { sub: "user-2", exp: Math.floor(Date.now() / 1000) + 1000 },
    (data) => {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(data);
      return sign.sign(rsa2.privateKey, "base64url");
    }
  );

  // Both tokens valid initially
  assert.ok(await verifier.verifyToken(token1));
  assert.ok(await verifier.verifyToken(token2));

  // Revoke key-v1
  verifier.revokeKey("key-v1");

  // Token signed with key-v1 must now fail
  assert.equal(await verifier.verifyToken(token1), null);

  // Token signed with key-v2 continues to succeed
  assert.ok(await verifier.verifyToken(token2));
});

test("JwtTokenVerifier: rejects expired, malformed, and tampered tokens", async () => {
  const secret = "super-secret-hmac-key-for-test-32bytes!";
  const verifier = new JwtTokenVerifier({ clockToleranceSec: 5 });
  verifier.registerKey("hs-key", secret, "HS256");

  const now = Math.floor(Date.now() / 1000);

  // Expired token
  const expiredToken = createJwt(
    { alg: "HS256", kid: "hs-key" },
    { sub: "user-exp", exp: now - 30 },
    (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url")
  );
  assert.equal(await verifier.verifyToken(expiredToken), null);

  // Not yet valid token (nbf)
  const futureToken = createJwt(
    { alg: "HS256", kid: "hs-key" },
    { sub: "user-fut", nbf: now + 300 },
    (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url")
  );
  assert.equal(await verifier.verifyToken(futureToken), null);

  // Tampered payload
  const validToken = createJwt(
    { alg: "HS256", kid: "hs-key" },
    { sub: "regular-user" },
    (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url")
  );
  const parts = validToken.split(".");
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: "root-admin" })).toString("base64url");
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  assert.equal(await verifier.verifyToken(tamperedToken), null);

  // Algorithm "none" attack rejected
  const noneToken = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${parts[1]}.`;
  assert.equal(await verifier.verifyToken(noneToken), null);
});

test("JwtTokenVerifier: resolves keys dynamically from JWKS with caching and key rotation", async () => {
  const rsaKey1 = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const rsaKey2 = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const jwk1 = crypto.createPublicKey(rsaKey1.publicKey).export({ format: "jwk" });
  const jwk2 = crypto.createPublicKey(rsaKey2.publicKey).export({ format: "jwk" });

  let jwksKeys: any[] = [{ ...jwk1, kid: "jwks-key-1", alg: "RS256", use: "sig" }];
  let fetchCount = 0;

  const mockFetcher = async (url: string) => {
    fetchCount++;
    assert.equal(url, "https://idp.example.com/.well-known/jwks.json");
    return {
      ok: true,
      status: 200,
      json: async () => ({ keys: jwksKeys }),
    };
  };

  const verifier = new JwtTokenVerifier({
    issuer: "https://idp.example.com",
    audience: "api://ai-platform",
    jwksUri: "https://idp.example.com/.well-known/jwks.json",
    jwksCacheTtlMs: 5000,
    fetcher: mockFetcher,
  });

  const now = Math.floor(Date.now() / 1000);

  // 1. First token signed with jwks-key-1
  const token1 = createJwt(
    { alg: "RS256", kid: "jwks-key-1", typ: "JWT" },
    {
      sub: "service-user-1",
      iss: "https://idp.example.com",
      aud: "api://ai-platform",
      exp: now + 3600,
      roles: ["operator"],
      tenantId: "tenant-enterprise-1",
    },
    (data) => {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(data);
      return sign.sign(rsaKey1.privateKey, "base64url");
    }
  );

  const claims1 = await verifier.verifyToken(token1);
  assert.ok(claims1);
  assert.equal(claims1?.sub, "service-user-1");
  assert.equal(claims1?.tenantId, "tenant-enterprise-1");
  assert.equal(fetchCount, 1, "JWKS should be fetched on initial unknown key");

  // 2. Second verification with same key uses cache (no additional fetch)
  const claims1Cached = await verifier.verifyToken(token1);
  assert.ok(claims1Cached);
  assert.equal(fetchCount, 1, "Cached key should not trigger another fetch");

  // 3. IdP rotates keys: adds jwks-key-2
  jwksKeys = [
    { ...jwk1, kid: "jwks-key-1", alg: "RS256", use: "sig" },
    { ...jwk2, kid: "jwks-key-2", alg: "RS256", use: "sig" },
  ];

  const token2 = createJwt(
    { alg: "RS256", kid: "jwks-key-2", typ: "JWT" },
    {
      sub: "service-user-2",
      iss: "https://idp.example.com",
      aud: "api://ai-platform",
      exp: now + 3600,
      roles: ["admin"],
      tenantId: "tenant-enterprise-2",
    },
    (data) => {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(data);
      return sign.sign(rsaKey2.privateKey, "base64url");
    }
  );

  // Verifier encounters unknown kid 'jwks-key-2', forces JWKS refresh, discovers key-2 and succeeds
  const claims2 = await verifier.verifyToken(token2);
  assert.ok(claims2);
  assert.equal(claims2?.sub, "service-user-2");
  assert.equal(fetchCount, 2, "Unknown kid should trigger forced JWKS refresh");
});

test("JwtTokenVerifier: fails closed when JWKS endpoint is unreachable or returns malformed response", async () => {
  const failingFetcher = async () => {
    return {
      ok: false,
      status: 503,
      json: async () => ({ error: "Service Unavailable" }),
    };
  };

  const verifier = new JwtTokenVerifier({
    issuer: "https://idp.failing.com",
    audience: "api://ai-platform",
    jwksUri: "https://idp.failing.com/.well-known/jwks.json",
    fetcher: failingFetcher,
  });

  const now = Math.floor(Date.now() / 1000);
  const token = createJwt(
    { alg: "RS256", kid: "unknown-key", typ: "JWT" },
    {
      sub: "adversary",
      iss: "https://idp.failing.com",
      aud: "api://ai-platform",
      exp: now + 3600,
    },
    () => "invalidsignature"
  );

  // Must fail closed (return null) without throwing uncaught errors
  const claims = await verifier.verifyToken(token);
  assert.equal(claims, null);
});

