/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * One-Euro Filter for Low-Latency Adaptive Temporal Signal Smoothing.
 * 
 * Mathematical Formulation:
 * 1. \hat{x}_i = \alpha x_i + (1 - \alpha) \hat{x}_{i-1}
 * 2. \alpha = \frac{1}{1 + \frac{\tau}{T_e}} = \frac{1}{1 + \frac{1}{2 \pi f_c T_e}}
 * 3. f_c = f_{c,\min} + \beta |\dot{x}_i|
 * 
 * Invariants:
 * - Pure deterministic mathematical filter with zero external dependencies.
 * - Handles edge cases: first sample, out-of-order/zero dt timestamps, high noise, step signals.
 * - Prevents jitter during stationary poses while minimizing lag during high-velocity motions.
 */

export interface OneEuroFilterConfig {
  readonly minCutoffHz?: number; // Minimum cutoff frequency (f_c,min), default 1.0 Hz (reduces stationary jitter)
  readonly beta?: number;        // Speed coefficient (\beta), default 0.007 (reduces lag during quick motion)
  readonly dCutoffHz?: number;   // Cutoff frequency for derivative calculation, default 1.0 Hz
}

export class LowPassFilter {
  private _y: number | null = null;
  private _alpha = 1.0;

  constructor(alpha = 1.0) {
    this._alpha = alpha;
  }

  public filter(value: number, alpha: number): number {
    if (this._y === null) {
      this._y = value;
      return value;
    }
    this._alpha = alpha;
    this._y = alpha * value + (1.0 - alpha) * this._y;
    return this._y;
  }

  public filterWithAlpha(value: number): number {
    if (this._y === null) {
      this._y = value;
      return value;
    }
    this._y = this._alpha * value + (1.0 - this._alpha) * this._y;
    return this._y;
  }

  public hasLastValue(): boolean {
    return this._y !== null;
  }

  public lastValue(): number {
    return this._y ?? 0;
  }

  public reset(): void {
    this._y = null;
  }
}

export class OneEuroFilter {
  private _minCutoffHz: number;
  private _beta: number;
  private _dCutoffHz: number;

  private _xFilter: LowPassFilter;
  private _dxFilter: LowPassFilter;
  private _lastTimestampMs: number | null = null;

  constructor(config?: OneEuroFilterConfig) {
    this._minCutoffHz = config?.minCutoffHz ?? 1.0;
    this._beta = config?.beta ?? 0.007;
    this._dCutoffHz = config?.dCutoffHz ?? 1.0;

    this._xFilter = new LowPassFilter();
    this._dxFilter = new LowPassFilter();
  }

  public filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value)) {
      return this._xFilter.hasLastValue() ? this._xFilter.lastValue() : 0;
    }

    if (!Number.isFinite(timestampMs) || this._lastTimestampMs === null) {
      this._lastTimestampMs = Number.isFinite(timestampMs) ? timestampMs : Date.now();
      return this._xFilter.filter(value, 1.0);
    }

    let dt = (timestampMs - this._lastTimestampMs) / 1000.0; // Convert to seconds

    // Edge case handling: duplicate timestamp, negative dt or excessive gap (> 1s)
    if (dt <= 0.0001) {
      // Re-use previous sample or small fallback dt
      dt = 0.016; // Assume ~60fps
    } else if (dt > 1.0) {
      // Reset filter on large temporal gap
      this.reset();
      this._lastTimestampMs = timestampMs;
      return this._xFilter.filter(value, 1.0);
    }

    this._lastTimestampMs = timestampMs;

    // 1. Estimate filtered derivative (\dot{x})
    const prevX = this._xFilter.lastValue();
    const dx = (value - prevX) / dt;
    const alphaD = this.computeAlpha(dt, this._dCutoffHz);
    const edx = this._dxFilter.filter(dx, alphaD);

    // 2. Compute dynamic adaptive cutoff frequency (f_c)
    const cutoff = this._minCutoffHz + this._beta * Math.abs(edx);

    // 3. Filter main signal
    const alpha = this.computeAlpha(dt, cutoff);
    return this._xFilter.filter(value, alpha);
  }

  private computeAlpha(dt: number, cutoffHz: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoffHz);
    return 1.0 / (1.0 + tau / dt);
  }

  public reset(): void {
    this._xFilter.reset();
    this._dxFilter.reset();
    this._lastTimestampMs = null;
  }
}

export class Point3DSmoother {
  private _xFilter: OneEuroFilter;
  private _yFilter: OneEuroFilter;
  private _zFilter: OneEuroFilter;

  constructor(config?: OneEuroFilterConfig) {
    this._xFilter = new OneEuroFilter(config);
    this._yFilter = new OneEuroFilter(config);
    this._zFilter = new OneEuroFilter(config);
  }

  public smooth(
    x: number,
    y: number,
    z: number,
    timestampMs: number
  ): { x: number; y: number; z: number } {
    return {
      x: this._xFilter.filter(x, timestampMs),
      y: this._yFilter.filter(y, timestampMs),
      z: this._zFilter.filter(z, timestampMs),
    };
  }

  public reset(): void {
    this._xFilter.reset();
    this._yFilter.reset();
    this._zFilter.reset();
  }
}
