export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly component: string;
  readonly operation: string;
  readonly correlationId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly message: string;
  readonly outcome?: "SUCCESS" | "FAILURE" | "DENIED" | "TIMEOUT" | "RETRY" | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

const REDACTED_KEYS = new Set([
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "privatekey",
  "private_key",
  "credential",
  "credentials",
]);

export function sanitizeLogMetadata(data: unknown, depth = 0): unknown {
  if (depth > 5) return "[MaxDepthReached]";
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Redact Bearer tokens or obvious secret patterns
    if (/bearer\s+[a-zA-Z0-9_.-]{10,}/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_.-]{10,}/gi, "Bearer [REDACTED]");
    }
    return data;
  }
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogMetadata(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[_-]/g, "");
    if (REDACTED_KEYS.has(lowerKey) || lowerKey.includes("secret") || lowerKey.includes("token")) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeLogMetadata(value, depth + 1);
    }
  }
  return sanitized;
}

export class ProductionStructuredLogger {
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly levelWeights: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  constructor(service = "ai-operating-platform", minLevel: LogLevel = "info") {
    this.service = service;
    this.minLevel = minLevel;
  }

  public log(entry: Omit<LogEntry, "timestamp" | "service">): LogEntry {
    const fullEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level: entry.level,
      component: entry.component,
      operation: entry.operation,
      message: entry.message,
      ...(entry.correlationId && { correlationId: entry.correlationId }),
      ...(entry.requestId && { requestId: entry.requestId }),
      ...(entry.applicationId && { applicationId: entry.applicationId }),
      ...(entry.taskId && { taskId: entry.taskId }),
      ...(entry.executionId && { executionId: entry.executionId }),
      ...(entry.outcome && { outcome: entry.outcome }),
      ...(entry.metadata && { metadata: sanitizeLogMetadata(entry.metadata) as Record<string, unknown> }),
    };

    if (this.levelWeights[entry.level] >= this.levelWeights[this.minLevel]) {
      const serialized = JSON.stringify(fullEntry);
      if (entry.level === "error") {
        console.error(serialized);
      } else if (entry.level === "warn") {
        console.warn(serialized);
      } else {
        console.info(serialized);
      }
    }

    return fullEntry;
  }

  public info(component: string, operation: string, message: string, meta?: Record<string, unknown>): LogEntry {
    return this.log({ level: "info", component, operation, message, metadata: meta });
  }

  public warn(component: string, operation: string, message: string, meta?: Record<string, unknown>): LogEntry {
    return this.log({ level: "warn", component, operation, message, metadata: meta });
  }

  public error(component: string, operation: string, message: string, meta?: Record<string, unknown>): LogEntry {
    return this.log({ level: "error", component, operation, message, metadata: meta, outcome: "FAILURE" });
  }
}
