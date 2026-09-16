import { DomainEvent } from "../../domain/events/events.js";
import { RequestContext } from "../../domain/context/request-context.js";

export type DependencyState = "READY" | "DEGRADED" | "UNAVAILABLE" | "UNCONFIGURED" | "FAILED";

export interface DependencyStatus {
  readonly component: string;
  readonly state: DependencyState;
  readonly available: boolean;
  readonly configured: boolean;
  readonly latencyMs?: number | undefined;
  readonly message?: string | undefined;
  readonly lastChecked: Date;
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly message: string;
  readonly requestId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly deviceId?: string | undefined;
  readonly jobId?: string | undefined;
  readonly event?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly errorCode?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface MetricSnapshot {
  readonly name: string;
  readonly type: "COUNTER" | "GAUGE" | "HISTOGRAM";
  readonly value: number;
  readonly count?: number | undefined;
  readonly p50?: number | undefined;
  readonly p95?: number | undefined;
  readonly p99?: number | undefined;
  readonly dimensions?: Readonly<Record<string, string>> | undefined;
}

export class ObservabilityService {
  private readonly counters: Map<string, number> = new Map();
  private readonly gauges: Map<string, number> = new Map();
  private readonly histograms: Map<string, number[]> = new Map();
  private readonly logs: StructuredLogEntry[] = [];
  private readonly maxLogRetention: number = 1000;

  constructor() {
    this.initializeCoreMetrics();
  }

  private initializeCoreMetrics(): void {
    // Platform
    this.setGauge("platform.requests_total", 0);
    this.setGauge("platform.requests_failed", 0);
    // Tasks
    this.setGauge("tasks.created", 0);
    this.setGauge("tasks.completed", 0);
    this.setGauge("tasks.failed", 0);
    // Executions
    this.setGauge("executions.started", 0);
    this.setGauge("executions.completed", 0);
    this.setGauge("executions.failed", 0);
    // Models
    this.setGauge("models.calls", 0);
    this.setGauge("models.failures", 0);
    // Tools
    this.setGauge("tools.calls", 0);
    this.setGauge("tools.failures", 0);
    // Devices & Printing
    this.setGauge("devices.registered", 0);
    this.setGauge("devices.available", 0);
    this.setGauge("devices.unavailable", 0);
    this.setGauge("printing.jobs_created", 0);
    this.setGauge("printing.jobs_completed", 0);
    this.setGauge("printing.jobs_failed", 0);
  }

  // --- Metrics Engine ---

  public increment(name: string, by: number = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + by);
  }

  public setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  public recordHistogram(name: string, value: number): void {
    let samples = this.histograms.get(name);
    if (!samples) {
      samples = [];
      this.histograms.set(name, samples);
    }
    samples.push(value);
    if (samples.length > 500) {
      samples.shift();
    }
  }

  public getMetricValue(name: string): number {
    if (this.counters.has(name)) return this.counters.get(name)!;
    if (this.gauges.has(name)) return this.gauges.get(name)!;
    return 0;
  }

  public getMetricSnapshots(): readonly MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const [name, val] of this.counters.entries()) {
      snapshots.push({ name, type: "COUNTER", value: val });
    }

    for (const [name, val] of this.gauges.entries()) {
      snapshots.push({ name, type: "GAUGE", value: val });
    }

    for (const [name, samples] of this.histograms.entries()) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

      snapshots.push({
        name,
        type: "HISTOGRAM",
        value: avg,
        count: samples.length,
        p50,
        p95,
        p99,
      });
    }

    return Object.freeze(snapshots);
  }

  public getMetricsSnapshot(): Record<string, unknown> {
    const snapshots = this.getMetricSnapshots();
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const histograms: Record<string, unknown> = {};

    for (const snap of snapshots) {
      if (snap.type === "COUNTER") counters[snap.name] = snap.value;
      if (snap.type === "GAUGE") gauges[snap.name] = snap.value;
      if (snap.type === "HISTOGRAM") {
        histograms[snap.name] = {
          avg: snap.value,
          count: snap.count,
          p50: snap.p50,
          p95: snap.p95,
          p99: snap.p99,
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      metrics: {
        counters,
        gauges,
        histograms,
      },
      summary: {
        totalCounters: Object.keys(counters).length,
        totalGauges: Object.keys(gauges).length,
        totalHistograms: Object.keys(histograms).length,
      },
    };
  }

  // --- Structured Logging Engine ---

  public log(
    level: LogLevel,
    message: string,
    context?: {
      readonly reqCtx?: RequestContext | undefined;
      readonly service?: string | undefined;
      readonly taskId?: string | undefined;
      readonly executionId?: string | undefined;
      readonly deviceId?: string | undefined;
      readonly jobId?: string | undefined;
      readonly event?: string | undefined;
      readonly durationMs?: number | undefined;
      readonly errorCode?: string | undefined;
      readonly metadata?: Record<string, unknown> | undefined;
    }
  ): void {
    try {
      const sanitizedMeta = this.scrubSecrets(context?.metadata);
      const entry: StructuredLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        service: context?.service || "ai-operating-platform",
        message,
        requestId: context?.reqCtx?.requestId,
        correlationId: context?.reqCtx?.correlationId,
        tenantId: context?.reqCtx?.tenantId,
        applicationId: context?.reqCtx?.applicationId,
        taskId: context?.taskId,
        executionId: context?.executionId,
        deviceId: context?.deviceId,
        jobId: context?.jobId,
        event: context?.event,
        durationMs: context?.durationMs,
        errorCode: context?.errorCode,
        metadata: Object.keys(sanitizedMeta).length > 0 ? sanitizedMeta : undefined,
      };

      this.logs.push(entry);
      if (this.logs.length > this.maxLogRetention) {
        this.logs.shift();
      }
    } catch {
      // Non-fatal logging protection
    }
  }

  public getRecentLogs(limit: number = 50): readonly StructuredLogEntry[] {
    return Object.freeze(this.logs.slice(-limit).reverse());
  }

  public getLogs(options?: { readonly limit?: number | undefined; readonly level?: LogLevel | undefined }): {
    readonly logs: readonly StructuredLogEntry[];
    readonly count: number;
    readonly total: number;
  } {
    const limit = options?.limit ?? 100;
    let filtered = this.logs;
    if (options?.level) {
      filtered = filtered.filter((l) => l.level === options.level);
    }
    const sliced = filtered.slice(-limit).reverse();
    return {
      logs: Object.freeze(sliced),
      count: sliced.length,
      total: filtered.length,
    };
  }

  private scrubSecrets(data?: unknown): Record<string, unknown> {
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const clean: Record<string, unknown> = {};
    const forbidden = ["password", "secret", "token", "apikey", "api_key", "bearer", "authorization", "privatekey"];

    for (const [k, v] of Object.entries(data)) {
      const lower = k.toLowerCase().replace(/[-_]/g, "");
      if (forbidden.some((f) => lower.includes(f))) {
        clean[k] = "[REDACTED]";
      } else if (typeof v === "object" && v !== null) {
        clean[k] = this.scrubSecrets(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  // --- Domain Event Ingestion ---

  public handleDomainEvent(event: DomainEvent): void {
    try {
      const type = event.type as string;
      this.increment(`events.total`);
      this.increment(`events.${type}`);

      if (type === "task.created") this.increment("tasks.created");
      if (type === "task.completed") this.increment("tasks.completed");
      if (type === "task.failed") this.increment("tasks.failed");

      if (type === "execution.started") this.increment("executions.started");
      if (type === "execution.completed") this.increment("executions.completed");
      if (type === "execution.failed") this.increment("executions.failed");

      if (type === "model.requested") this.increment("models.calls");
      if (type === "tool.execution.started") this.increment("tools.calls");

      if (type === "device.registered") this.increment("devices.registered");
      if (type === "print.job.created") this.increment("printing.jobs_created");
      if (type === "print.job.completed") this.increment("printing.jobs_completed");
      if (type === "print.job.failed") this.increment("printing.jobs_failed");

      this.log("INFO", `Domain event: ${type}`, {
        event: type,
        taskId: event.taskId,
        executionId: event.executionId,
        metadata: {
          aggregateId: event.aggregateId,
          traceId: event.traceId,
        },
      });
    } catch {
      // Non-fatal event handling
    }
  }
}
