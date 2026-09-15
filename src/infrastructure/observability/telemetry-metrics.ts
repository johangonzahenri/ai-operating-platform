export interface MetricLabels {
  readonly [key: string]: string;
}

export interface MetricSnapshot {
  readonly name: string;
  readonly type: "counter" | "gauge" | "histogram";
  readonly value: number;
  readonly labels: MetricLabels;
  readonly timestamp: string;
}

export interface HistogramQuantiles {
  readonly count: number;
  readonly sum: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export class TelemetryMetricsRegistry {
  private readonly counters: Map<string, number> = new Map();
  private readonly gauges: Map<string, number> = new Map();
  private readonly histogramSamples: Map<string, number[]> = new Map();

  private buildKey(name: string, labels: MetricLabels = {}): string {
    const sorted = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return sorted ? `${name}{${sorted}}` : name;
  }

  incrementCounter(name: string, amount = 1, labels: MetricLabels = {}): void {
    const key = this.buildKey(name, labels);
    const curr = this.counters.get(key) ?? 0;
    this.counters.set(key, curr + amount);
  }

  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  getGauge(name: string, labels: MetricLabels = {}): number {
    const key = this.buildKey(name, labels);
    return this.gauges.get(key) ?? 0;
  }

  recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.buildKey(name, labels);
    if (!this.histogramSamples.has(key)) {
      this.histogramSamples.set(key, []);
    }
    const samples = this.histogramSamples.get(key)!;
    if (samples.length >= 1000) {
      samples.shift(); // retain fixed rolling window
    }
    samples.push(value);
  }

  getHistogramQuantiles(name: string, labels: MetricLabels = {}): HistogramQuantiles {
    const key = this.buildKey(name, labels);
    const samples = [...(this.histogramSamples.get(key) ?? [])].sort((a, b) => a - b);
    if (samples.length === 0) {
      return { count: 0, sum: 0, p50: 0, p95: 0, p99: 0 };
    }
    const sum = samples.reduce((acc, v) => acc + v, 0);
    const getP = (p: number) => {
      const idx = Math.min(samples.length - 1, Math.max(0, Math.ceil(samples.length * p) - 1));
      return samples[idx] ?? 0;
    };
    return {
      count: samples.length,
      sum,
      p50: getP(0.5),
      p95: getP(0.95),
      p99: getP(0.99),
    };
  }

  toPrometheusFormat(): string {
    const lines: string[] = [];
    for (const [key, val] of this.counters.entries()) {
      lines.push(`${key} ${val}`);
    }
    for (const [key, val] of this.gauges.entries()) {
      lines.push(`${key} ${val}`);
    }
    for (const [key] of this.histogramSamples.entries()) {
      const name = key.split("{")[0] || key;
      const q = this.getHistogramQuantiles(name);
      lines.push(`${name}_count ${q.count}`);
      lines.push(`${name}_sum ${q.sum}`);
    }
    return lines.join("\n");
  }
}
