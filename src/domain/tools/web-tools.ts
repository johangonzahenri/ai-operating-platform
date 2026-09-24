import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";
import { PolicyDeniedError } from "../policy/policy.js";

export interface WebAccessPolicy {
  readonly allowedDomains?: readonly string[] | undefined;
  readonly blockedDomains?: readonly string[] | undefined;
  readonly maxRequestsPerMinute?: number | undefined;
  readonly maxPayloadSizeBytes?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly allowRedirects?: boolean | undefined;
  readonly userAgentIdentifier?: string | undefined;
}

export const DEFAULT_WEB_ACCESS_POLICY: WebAccessPolicy = Object.freeze({
  maxRequestsPerMinute: 60,
  maxPayloadSizeBytes: 1024 * 1024, // 1MB
  timeoutMs: 15000, // 15s
  allowRedirects: false,
  userAgentIdentifier: "AI-Operating-Platform-WebAgent/1.4.0 (+https://ai-operating-platform.local/robot)",
});

export interface WebSearchResultItem {
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly snippet: string;
  readonly sourceReliabilityScore: number; // 0.0 to 1.0
  readonly publishedDate?: string | undefined;
}

export interface WebSearchQuery {
  readonly query: string;
  readonly domainFilter?: readonly string[] | undefined;
  readonly maxResults?: number | undefined;
  readonly targetLanguage?: string | undefined;
}

export interface WebExtractionRequest {
  readonly url: string;
  readonly extractionSchema?: Readonly<Record<string, string>> | undefined;
  readonly selectors?: readonly string[] | undefined;
  readonly maxCharacters?: number | undefined;
}

export interface WebExtractionResult {
  readonly url: string;
  readonly domain: string;
  readonly extractedAt: Date;
  readonly title?: string | undefined;
  readonly textContent: string;
  readonly structuredAttributes: Readonly<Record<string, unknown>>;
  readonly evidenceClaims: readonly StructuredClaimEvidence[];
}

export class WebDomainAccessDeniedError extends PolicyDeniedError {
  readonly code = "WEB_DOMAIN_ACCESS_DENIED";
  constructor(readonly domain: string, message: string) {
    super("web-domain-access-denied", domain, message);
    this.name = "WebDomainAccessDeniedError";
  }
}

export class WebRateLimitExceededError extends Error {
  readonly code = "WEB_RATE_LIMIT_EXCEEDED";
  constructor(readonly domain: string, message = `Rate limit exceeded for domain '${domain}'`) {
    super(message);
    this.name = "WebRateLimitExceededError";
  }
}

export class WebExtractionError extends Error {
  readonly code = "WEB_EXTRACTION_FAILED";
  constructor(readonly url: string, message: string) {
    super(`Web extraction failed for URL '${url}': ${message}`);
    this.name = "WebExtractionError";
  }
}
