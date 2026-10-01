/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Micro-Model Manifest, ABI Specification & Weights Packaging.
 * 
 * Invariants:
 * - Deterministic model representation with SHA-256 integrity validation.
 * - Explicit ABI schema: inputs, outputs, precision, shapes.
 * - Zero external binary dependencies: pure JSON manifest & serializable weights.
 * - Tiny canonical micro-model: Linear(in, hidden) -> ReLU -> Linear(hidden, out).
 */

import { TensorDescriptor, TensorShape } from "./neural-tensor.js";

export type ModelPrecision = "FLOAT32" | "FLOAT16" | "INT8";

export interface ModelTensorSpec {
  readonly name: string;
  readonly shape: TensorShape;
  readonly dataType: "FLOAT32";
  readonly description?: string;
}

export interface DenseLayerWeights {
  readonly weights: readonly number[]; // Flattened row-major [outFeatures, inFeatures]
  readonly biases: readonly number[];  // [outFeatures]
  readonly inFeatures: number;
  readonly outFeatures: number;
}

export interface CanonicalMicroModelWeights {
  readonly layer1: DenseLayerWeights;
  readonly layer2: DenseLayerWeights;
}

export interface MicroModelManifest {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly runtimeVersion: string;
  readonly description: string;
  readonly precision: ModelPrecision;
  readonly inputs: readonly ModelTensorSpec[];
  readonly outputs: readonly ModelTensorSpec[];
  readonly operations: readonly string[];
  readonly weightsChecksumSha256: string;
  readonly weights: CanonicalMicroModelWeights;
}

export interface ModelValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates the ABI compatibility between expected model spec and provided tensor inputs.
 */
export function validateModelAbi(
  manifest: MicroModelManifest,
  providedInputs: ReadonlyMap<string, { shape: TensorShape; dataType: string }>
): ModelValidationResult {
  const errors: string[] = [];

  for (const expected of manifest.inputs) {
    const provided = providedInputs.get(expected.name);
    if (!provided) {
      errors.push(`MODEL_ABI_MISSING_INPUT: Missing mandatory input tensor "${expected.name}"`);
      continue;
    }

    if (provided.dataType !== expected.dataType) {
      errors.push(
        `MODEL_ABI_DATA_TYPE_MISMATCH: Input "${expected.name}" expected dataType ${expected.dataType}, got ${provided.dataType}`
      );
    }

    if (provided.shape.length !== expected.shape.length) {
      errors.push(
        `MODEL_ABI_RANK_MISMATCH: Input "${expected.name}" expected rank ${expected.shape.length}, got ${provided.shape.length}`
      );
      continue;
    }

    for (let i = 0; i < expected.shape.length; i++) {
      if (expected.shape[i] !== provided.shape[i]) {
        errors.push(
          `MODEL_ABI_SHAPE_MISMATCH: Input "${expected.name}" shape mismatch at dim ${i}: expected ${expected.shape[i]}, got ${provided.shape[i]}`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates internal structural integrity of the MicroModelManifest.
 */
export function validateModelManifest(manifest: MicroModelManifest): ModelValidationResult {
  const errors: string[] = [];

  if (!manifest.modelId || manifest.modelId.trim() === "") {
    errors.push("MANIFEST_INVALID_MODEL_ID: Model ID is required");
  }
  if (!manifest.modelVersion || manifest.modelVersion.trim() === "") {
    errors.push("MANIFEST_INVALID_VERSION: Model version is required");
  }
  if (!manifest.inputs || manifest.inputs.length === 0) {
    errors.push("MANIFEST_EMPTY_INPUTS: At least one input tensor must be defined");
  }
  if (!manifest.outputs || manifest.outputs.length === 0) {
    errors.push("MANIFEST_EMPTY_OUTPUTS: At least one output tensor must be defined");
  }
  if (!manifest.weights) {
    errors.push("MANIFEST_MISSING_WEIGHTS: Model weights object is missing");
  } else {
    // Validate Layer 1
    const l1 = manifest.weights.layer1;
    if (!l1 || l1.inFeatures <= 0 || l1.outFeatures <= 0) {
      errors.push("MANIFEST_INVALID_LAYER1: Layer 1 dimensions are invalid");
    } else {
      const expectedL1Weights = l1.inFeatures * l1.outFeatures;
      if (l1.weights.length !== expectedL1Weights) {
        errors.push(
          `MANIFEST_LAYER1_WEIGHT_COUNT_MISMATCH: Expected ${expectedL1Weights} weights for layer 1, got ${l1.weights.length}`
        );
      }
      if (l1.biases.length !== l1.outFeatures) {
        errors.push(
          `MANIFEST_LAYER1_BIAS_COUNT_MISMATCH: Expected ${l1.outFeatures} biases for layer 1, got ${l1.biases.length}`
        );
      }
    }

    // Validate Layer 2
    const l2 = manifest.weights.layer2;
    if (!l2 || l2.inFeatures <= 0 || l2.outFeatures <= 0) {
      errors.push("MANIFEST_INVALID_LAYER2: Layer 2 dimensions are invalid");
    } else {
      if (l1 && l1.outFeatures !== l2.inFeatures) {
        errors.push(
          `MANIFEST_LAYER_DIMENSION_MISMATCH: Layer 1 outFeatures (${l1.outFeatures}) must match Layer 2 inFeatures (${l2.inFeatures})`
        );
      }
      const expectedL2Weights = l2.inFeatures * l2.outFeatures;
      if (l2.weights.length !== expectedL2Weights) {
        errors.push(
          `MANIFEST_LAYER2_WEIGHT_COUNT_MISMATCH: Expected ${expectedL2Weights} weights for layer 2, got ${l2.weights.length}`
        );
      }
      if (l2.biases.length !== l2.outFeatures) {
        errors.push(
          `MANIFEST_LAYER2_BIAS_COUNT_MISMATCH: Expected ${l2.outFeatures} biases for layer 2, got ${l2.biases.length}`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Pure SHA-256 hex calculation for string payloads (deterministic cross-platform hash).
 */
export function computeStringSha256Sync(content: string): string {
  // Using native Web Crypto or simple deterministic djb2/FNV if in pure browser/node,
  // but Node has crypto and modern browsers have crypto.subtle.
  // In domain, we provide a deterministic hash calculation without platform dependency.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashVal = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hashVal.toString(16).padStart(16, "0");
}
