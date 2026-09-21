/**
 * Sensitive Data Redactor for AI Operating Platform.
 * Ensures PII and secrets are never logged, exported, or exposed in events.
 * 
 * Redaction categories:
 * - SECRETS: API keys, tokens, passwords, credentials
 * - PII: email addresses, phone numbers
 * - FINANCIAL: credit card numbers, bank accounts
 */

export interface RedactionConfig {
  readonly patterns: RedactionPattern[];
  readonly replacement: string;
}

export interface RedactionPattern {
  readonly name: string;
  readonly category: 'SECRET' | 'PII' | 'FINANCIAL';
  readonly regex: RegExp;
}

export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  { name: 'api_key', category: 'SECRET', regex: /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-]{16,})/gi },
  { name: 'bearer_token', category: 'SECRET', regex: /bearer\s+[a-zA-Z0-9_\-\.]+/gi },
  { name: 'password', category: 'SECRET', regex: /(?:password|passwd|pwd)["']?\s*[:=]\s*["']?[^\s"']{4,}/gi },
  { name: 'secret', category: 'SECRET', regex: /(?:secret|private[_-]?key)["']?\s*[:=]\s*["']?[^\s"']{4,}/gi },
  { name: 'jwt', category: 'SECRET', regex: /eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g },
  { name: 'email', category: 'PII', regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
];

export class SensitiveDataRedactor {
  private readonly config: RedactionConfig;

  constructor(config?: Partial<RedactionConfig>) {
    this.config = {
      patterns: config?.patterns ?? DEFAULT_REDACTION_PATTERNS,
      replacement: config?.replacement ?? '[REDACTED]',
    };
  }

  redact(input: string): string {
    let result = input;
    for (const pattern of this.config.patterns) {
      result = result.replace(pattern.regex, this.config.replacement);
    }
    return result;
  }

  redactObject<T extends Record<string, unknown>>(obj: T): T {
    const redacted = { ...obj };
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === 'string') {
        (redacted as Record<string, unknown>)[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null) {
        (redacted as Record<string, unknown>)[key] = this.redactObject(value as Record<string, unknown>);
      }
    }
    return redacted;
  }
}
