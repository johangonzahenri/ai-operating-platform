/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Neutral Tensor Domain Model & Numerical Validation.
 * 
 * Invariants:
 * - Pure mathematical and numerical contracts: ZERO dependencies on WebGPU, DOM, Node, or third parties.
 * - Explicit typed shapes: rank, dimensions, total element count, byte length.
 * - Supported datatypes: Float32 initially (can be extended to Int32/Uint8).
 * - Fail-closed validation: NaN, Infinity, negative dimensions, shape mismatch rejected deterministically.
 */

export type TensorDataType = "FLOAT32" | "INT32" | "UINT8";

export type TensorShape = readonly number[];

export interface TensorDescriptor {
  readonly name: string;
  readonly dataType: TensorDataType;
  readonly shape: TensorShape;
}

export interface TensorValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

export interface TensorResourceLimits {
  readonly maxRank: number;
  readonly maxDimensions: readonly number[];
  readonly maxTotalElements: number;
  readonly maxBufferBytes: number;
}

export const DEFAULT_TENSOR_RESOURCE_LIMITS: TensorResourceLimits = {
  maxRank: 4,
  maxDimensions: [2048, 2048, 512, 512],
  maxTotalElements: 1_000_000,
  maxBufferBytes: 4 * 1_000_000, // 4MB
};

export class Tensor {
  public readonly shape: TensorShape;
  public readonly dataType: TensorDataType;
  public readonly data: Float32Array;
  public readonly rank: number;
  public readonly elementCount: number;

  constructor(shape: TensorShape, data: Float32Array, dataType: TensorDataType = "FLOAT32") {
    Tensor.validateRaw(shape, data, dataType);
    this.shape = Object.freeze([...shape]);
    this.dataType = dataType;
    this.data = data;
    this.rank = shape.length;
    this.elementCount = Tensor.calculateElementCount(shape);
  }

  public static calculateElementCount(shape: TensorShape): number {
    if (shape.length === 0) return 0;
    return shape.reduce((acc, dim) => acc * dim, 1);
  }

  public static getBytesPerElement(dataType: TensorDataType): number {
    switch (dataType) {
      case "FLOAT32":
      case "INT32":
        return 4;
      case "UINT8":
        return 1;
      default:
        return 4;
    }
  }

  public get byteLength(): number {
    return this.data.byteLength;
  }

  public static validateRaw(
    shape: TensorShape,
    data: Float32Array,
    dataType: TensorDataType = "FLOAT32",
    limits: TensorResourceLimits = DEFAULT_TENSOR_RESOURCE_LIMITS
  ): void {
    const errors: string[] = [];

    if (!Array.isArray(shape) || shape.length === 0) {
      throw new Error("TENSOR_INVALID_SHAPE: Shape must be a non-empty array of positive integers");
    }

    if (shape.length > limits.maxRank) {
      throw new Error(`TENSOR_RANK_EXCEEDED: Tensor rank ${shape.length} exceeds maximum limit ${limits.maxRank}`);
    }

    let expectedElements = 1;
    for (let i = 0; i < shape.length; i++) {
      const dim = shape[i];
      if (!Number.isInteger(dim) || dim <= 0) {
        throw new Error(`TENSOR_INVALID_DIMENSION: Dimension at index ${i} must be a positive integer, got ${dim}`);
      }
      expectedElements *= dim;
    }

    if (expectedElements > limits.maxTotalElements) {
      throw new Error(
        `TENSOR_ELEMENT_COUNT_EXCEEDED: Element count ${expectedElements} exceeds limit ${limits.maxTotalElements}`
      );
    }

    if (!(data instanceof Float32Array)) {
      throw new Error("TENSOR_INVALID_DATA_BUFFER: Data must be an instance of Float32Array");
    }

    if (data.length !== expectedElements) {
      throw new Error(
        `TENSOR_BUFFER_MISMATCH: Data buffer length ${data.length} does not match expected elements ${expectedElements} for shape [${shape.join(", ")}]`
      );
    }

    const byteLen = data.length * Tensor.getBytesPerElement(dataType);
    if (byteLen > limits.maxBufferBytes) {
      throw new Error(`TENSOR_BUFFER_BYTES_EXCEEDED: Buffer bytes ${byteLen} exceeds limit ${limits.maxBufferBytes}`);
    }

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      if (Number.isNaN(val)) {
        throw new Error(`TENSOR_NON_FINITE_VALUE: Found NaN at index ${i}`);
      }
      if (!Number.isFinite(val)) {
        throw new Error(`TENSOR_NON_FINITE_VALUE: Found Infinity at index ${i}`);
      }
    }
  }

  public static validate(
    shape: TensorShape,
    data: Float32Array,
    dataType: TensorDataType = "FLOAT32",
    limits: TensorResourceLimits = DEFAULT_TENSOR_RESOURCE_LIMITS
  ): TensorValidationResult {
    try {
      Tensor.validateRaw(shape, data, dataType, limits);
      return { isValid: true, errors: [] };
    } catch (err) {
      return { isValid: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  public static zeros(shape: TensorShape, dataType: TensorDataType = "FLOAT32"): Tensor {
    const count = Tensor.calculateElementCount(shape);
    const data = new Float32Array(count);
    return new Tensor(shape, data, dataType);
  }

  public static fromArray(shape: TensorShape, values: readonly number[], dataType: TensorDataType = "FLOAT32"): Tensor {
    const data = new Float32Array(values);
    return new Tensor(shape, data, dataType);
  }

  public toArray(): number[] {
    return Array.from(this.data);
  }

  public clone(): Tensor {
    const copy = new Float32Array(this.data.length);
    copy.set(this.data);
    return new Tensor(this.shape, copy, this.dataType);
  }
}
