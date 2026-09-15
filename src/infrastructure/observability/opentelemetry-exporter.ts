import crypto from "node:crypto";

export interface OpenTelemetrySpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
  readonly name: string;
  readonly kind: "SERVER" | "CLIENT" | "INTERNAL";
  readonly startTimeUnixNano: number;
  readonly endTimeUnixNano: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly status: { readonly code: "OK" | "ERROR" | "UNSET"; readonly message?: string | undefined };
}

export interface OpenTelemetryExporterConfig {
  readonly endpoint?: string | undefined; // e.g. http://localhost:4318/v1/traces
  readonly serviceName?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxQueueSize?: number | undefined;
  readonly fetchFn?: typeof fetch | undefined;
}

export class OpenTelemetryExporter {
  private readonly endpoint: string;
  private readonly serviceName: string;
  private readonly timeoutMs: number;
  private readonly maxQueueSize: number;
  private readonly fetchFn: typeof fetch;
  private readonly buffer: OpenTelemetrySpan[] = [];

  constructor(config?: OpenTelemetryExporterConfig) {
    this.endpoint = (config?.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces").replace(/\/+$/, "");
    this.serviceName = config?.serviceName || process.env.OTEL_SERVICE_NAME || "ai-operating-platform";
    this.timeoutMs = config?.timeoutMs ?? 5000;
    this.maxQueueSize = config?.maxQueueSize ?? 2048;
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  static generateSpanId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  recordSpan(span: OpenTelemetrySpan): void {
    if (this.buffer.length >= this.maxQueueSize) {
      this.buffer.shift(); // Drop oldest span to preserve memory bounds
    }
    this.buffer.push(span);
  }

  getBufferedSpans(): readonly OpenTelemetrySpan[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer.length = 0;
  }

  async flush(): Promise<{ exportedCount: number; success: boolean; error?: string | undefined }> {
    if (this.buffer.length === 0) {
      return { exportedCount: 0, success: true };
    }

    const spansToExport = [...this.buffer];
    this.clearBuffer();

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "ai-operating-platform-tracer", version: "1.1.0" },
              spans: spansToExport.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId,
                name: s.name,
                kind: s.kind === "SERVER" ? 1 : s.kind === "CLIENT" ? 2 : 0,
                startTimeUnixNano: String(s.startTimeUnixNano),
                endTimeUnixNano: String(s.endTimeUnixNano),
                attributes: Object.entries(s.attributes).map(([k, v]) => ({
                  key: k,
                  value:
                    typeof v === "string"
                      ? { stringValue: v }
                      : typeof v === "number"
                      ? { doubleValue: v }
                      : { boolValue: v },
                })),
                status: {
                  code: s.status.code === "OK" ? 1 : s.status.code === "ERROR" ? 2 : 0,
                  message: s.status.message,
                },
              })),
            },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return { exportedCount: spansToExport.length, success: true };
      }
      return {
        exportedCount: 0,
        success: false,
        error: `OTel Collector returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      return {
        exportedCount: 0,
        success: false,
        error: `OTel Collector unreachable: ${err.message || String(err)}`,
      };
    }
  }
}
