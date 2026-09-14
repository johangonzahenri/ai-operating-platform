import crypto from "node:crypto";
import { BearerTokenClaims, BearerTokenVerifier } from "../../domain/security/authentication.js";

export interface DevScaffoldVerifierOptions {
  readonly secret?: string | undefined;
  readonly issuer?: string | undefined;
  readonly audience?: string | undefined;
}

/**
 * DEVELOPMENT & TEST ONLY: Scaffolding token verifier.
 * Explicitly delimited for local integration and automated tests.
 * Production environments MUST inject an external OIDC / OAuth2 / JWKS TokenVerifier adapter.
 */
export class DevScaffoldTokenVerifier implements BearerTokenVerifier {
  private readonly secret: string;
  private readonly issuer?: string | undefined;
  private readonly audience?: string | undefined;

  constructor(options?: DevScaffoldVerifierOptions) {
    this.secret = options?.secret ?? "dev-insecure-scaffold-secret-do-not-use-in-production";
    this.issuer = options?.issuer;
    this.audience = options?.audience;
  }

  async verifyToken(token: string): Promise<BearerTokenClaims | null> {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    try {
      const headerStr = Buffer.from(headerB64, "base64url").toString("utf8");
      const header = JSON.parse(headerStr);
      if (header.alg !== "HS256") return null;

      const expectedSig = crypto
        .createHmac("sha256", this.secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest("base64url");

      if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
        return null;
      }

      const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf8");
      const payload = JSON.parse(payloadStr);

      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === "number" && payload.exp < nowSec) {
        return null; // Expired
      }
      if (typeof payload.nbf === "number" && payload.nbf > nowSec) {
        return null; // Not active yet
      }
      if (this.issuer && payload.iss !== this.issuer) {
        return null;
      }
      if (this.audience && payload.aud !== this.audience) {
        return null;
      }

      return {
        sub: String(payload.sub ?? ""),
        principalType: payload.principalType,
        name: payload.name,
        roles: Array.isArray(payload.roles) ? payload.roles : undefined,
        tenantId: payload.tenantId,
        metadata: typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata : undefined,
      };
    } catch {
      return null;
    }
  }

  createDevToken(claims: Partial<BearerTokenClaims> & { sub: string; expSeconds?: number }): string {
    const header = { alg: "HS256", typ: "JWT" };
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + (claims.expSeconds ?? 3600);

    const payload = {
      ...claims,
      iat: nowSec,
      exp,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
