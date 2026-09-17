import crypto from "node:crypto";
import { BearerTokenClaims, BearerTokenVerifier } from "../../domain/security/authentication.js";

export type SupportedJwtAlgorithm = "RS256" | "ES256" | "HS256";

export interface KeyDefinition {
  readonly kid: string;
  readonly key: string | crypto.KeyObject;
  readonly alg: SupportedJwtAlgorithm;
  readonly status: "ACTIVE" | "REVOKED";
}

export interface JwtVerifierOptions {
  readonly issuer?: string | undefined;
  readonly audience?: string | undefined;
  readonly clockToleranceSec?: number | undefined;
  readonly allowedAlgorithms?: readonly SupportedJwtAlgorithm[] | undefined;
}

export class JwtTokenVerifier implements BearerTokenVerifier {
  private readonly keys = new Map<string, KeyDefinition>();
  private readonly issuer?: string | undefined;
  private readonly audience?: string | undefined;
  private readonly clockToleranceSec: number;
  private readonly allowedAlgorithms: readonly SupportedJwtAlgorithm[];

  constructor(options: JwtVerifierOptions = {}) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.clockToleranceSec = options.clockToleranceSec ?? 60;
    this.allowedAlgorithms = options.allowedAlgorithms ?? ["RS256", "ES256", "HS256"];
  }

  registerKey(kid: string, key: string | crypto.KeyObject, alg: SupportedJwtAlgorithm): void {
    if (!kid || typeof kid !== "string") {
      throw new Error("Key ID (kid) must be a non-empty string");
    }
    if (!["RS256", "ES256", "HS256"].includes(alg)) {
      throw new Error(`Unsupported algorithm '${alg}'`);
    }
    this.keys.set(kid, {
      kid,
      key,
      alg,
      status: "ACTIVE",
    });
  }

  revokeKey(kid: string): void {
    const existing = this.keys.get(kid);
    if (existing) {
      this.keys.set(kid, {
        ...existing,
        status: "REVOKED",
      });
    }
  }

  getKey(kid?: string): KeyDefinition | undefined {
    if (kid) {
      return this.keys.get(kid);
    }
    // Return first active key if kid omitted and only one exists
    for (const k of this.keys.values()) {
      if (k.status === "ACTIVE") return k;
    }
    return undefined;
  }

  async verifyToken(token: string): Promise<BearerTokenClaims | null> {
    if (!token || typeof token !== "string") return null;

    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    let header: any;
    let payload: any;
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
      return null;
    }

    if (!header || typeof header !== "object" || !header.alg || header.alg === "none") {
      return null;
    }

    const alg = header.alg as SupportedJwtAlgorithm;
    if (!this.allowedAlgorithms.includes(alg)) {
      return null;
    }

    const kid = header.kid;
    const keyDef = this.getKey(kid);
    if (!keyDef || keyDef.status !== "ACTIVE" || keyDef.alg !== alg) {
      return null;
    }

    const signedData = `${headerB64}.${payloadB64}`;
    const signatureBuffer = Buffer.from(signatureB64, "base64url");

    let isSignatureValid = false;
    try {
      if (alg === "HS256") {
        const expectedSig = crypto
          .createHmac("sha256", keyDef.key as string | Buffer)
          .update(signedData)
          .digest("base64url");
        const expectedSigBuffer = Buffer.from(expectedSig, "base64url");
        if (signatureBuffer.length === expectedSigBuffer.length &&
            crypto.timingSafeEqual(signatureBuffer, expectedSigBuffer)) {
          isSignatureValid = true;
        }
      } else if (alg === "RS256" || alg === "ES256") {
        const verifier = crypto.createVerify(alg === "RS256" ? "RSA-SHA256" : "SHA256");
        verifier.update(signedData);
        isSignatureValid = verifier.verify(
          keyDef.key,
          signatureBuffer
        );
      }
    } catch {
      return null;
    }

    if (!isSignatureValid) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Validate exp
    if (typeof payload.exp === "number") {
      if (payload.exp + this.clockToleranceSec < nowSec) {
        return null; // Expired
      }
    }

    // Validate nbf
    if (typeof payload.nbf === "number") {
      if (payload.nbf - this.clockToleranceSec > nowSec) {
        return null; // Not active yet
      }
    }

    // Validate iss
    if (this.issuer && payload.iss !== this.issuer) {
      return null;
    }

    // Validate aud
    if (this.audience) {
      if (Array.isArray(payload.aud)) {
        if (!payload.aud.includes(this.audience)) return null;
      } else if (payload.aud !== this.audience) {
        return null;
      }
    }

    // Validate sub
    if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim() === "") {
      return null;
    }

    return Object.freeze({
      ...payload,
      sub: payload.sub.trim(),
      roles: Array.isArray(payload.roles)
        ? Object.freeze([...payload.roles.map((r: unknown) => String(r).trim())])
        : undefined,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    });
  }
}
