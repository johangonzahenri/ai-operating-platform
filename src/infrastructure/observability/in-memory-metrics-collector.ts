import { MetricDimensions, MetricsCollector } from "../../domain/observability/observability.js";
export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly counters = new Map<string, number>(); readonly samples: { name: string; value: number; dimensions?: MetricDimensions }[] = [];
  increment(name: string, dimensions: MetricDimensions = {}): void { const key = this.key(name, dimensions); this.counters.set(key, (this.counters.get(key) ?? 0) + 1); }
  record(name: string, value: number, dimensions?: MetricDimensions): void { this.samples.push({ name, value, ...(dimensions ? { dimensions } : {}) }); }
  value(name: string, dimensions: MetricDimensions = {}): number { return this.counters.get(this.key(name, dimensions)) ?? 0; }
  getAllCounters(): Readonly<Record<string, number>> { return Object.fromEntries(this.counters.entries()); }
  private key(name: string, dimensions: MetricDimensions): string { return `${name}:${Object.entries(dimensions).sort().map(([key, value]) => `${key}=${value}`).join(",")}`; }
}
