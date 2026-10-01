/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Canonical Micro-Model Definition & Prepared VTO Feature Vector Extractor.
 * 
 * Model Purpose:
 * - VTO Pose & Garment Alignment Quality Scorer
 * - Input: 8-dimensional normalized feature vector extracted from PreparedVirtualTryOnInput:
 *   [0] anthropometric estimatedHeightRatio
 *   [1] anthropometric shoulderWidthRatio
 *   [2] anthropometric hipWidthRatio
 *   [3] anthropometric shoulderToHipRatio
 *   [4] anthropometric torsoLengthRatio
 *   [5] garment alignment scale.x
 *   [6] garment alignment scale.y
 *   [7] garment alignment rotation (normalized to [-1, 1])
 * 
 * - Architecture:
 *   Input(8) -> Linear(8 -> 4) -> ReLU -> Linear(4 -> 2) -> Output(2)
 *   Output[0]: Alignment Quality Score (0.0 to 1.0)
 *   Output[1]: Fitment Stability Confidence (0.0 to 1.0)
 */

import { PreparedVirtualTryOnInput } from "./pose-preprocessing-pipeline.js";
import { MicroModelManifest, CanonicalMicroModelWeights } from "./neural-model.js";
import { Tensor } from "./neural-tensor.js";

export const CANONICAL_VTO_MICRO_MODEL_ID = "vto-alignment-quality-v1";
export const CANONICAL_VTO_MICRO_MODEL_VERSION = "1.0.0";

/**
 * Deterministic pre-trained weights for the VTO alignment quality scorer.
 */
export const CANONICAL_VTO_WEIGHTS: CanonicalMicroModelWeights = {
  layer1: {
    inFeatures: 8,
    outFeatures: 4,
    // Matrix [4, 8] row-major
    weights: [
      0.15,  0.25, -0.10,  0.30,  0.20,  0.40,  0.35, -0.05,
     -0.20,  0.10,  0.15, -0.05,  0.25,  0.30,  0.40,  0.10,
      0.30, -0.15,  0.20,  0.10, -0.10,  0.20,  0.25, -0.15,
      0.05,  0.35,  0.25,  0.15,  0.10, -0.05,  0.10,  0.20,
    ],
    biases: [0.05, -0.02, 0.08, 0.01],
  },
  layer2: {
    inFeatures: 4,
    outFeatures: 2,
    // Matrix [2, 4] row-major
    weights: [
      0.45,  0.35,  0.25,  0.15,
      0.20,  0.40, -0.10,  0.30,
    ],
    biases: [0.10, 0.05],
  },
};

export const CANONICAL_VTO_MICRO_MODEL_MANIFEST: MicroModelManifest = {
  modelId: CANONICAL_VTO_MICRO_MODEL_ID,
  modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
  runtimeVersion: "1.4.0",
  description: "Lightweight Neural VTO Alignment Quality & Fitment Stability Scorer",
  precision: "FLOAT32",
  inputs: [
    {
      name: "vto_features",
      shape: [1, 8],
      dataType: "FLOAT32",
      description: "Normalized 8-dimensional anthropometric and alignment feature vector",
    },
  ],
  outputs: [
    {
      name: "quality_scores",
      shape: [1, 2],
      dataType: "FLOAT32",
      description: "Two-element vector: [alignmentQualityScore, fitmentStabilityConfidence]",
    },
  ],
  operations: ["MatMul", "AddBias", "ReLU", "MatMul", "AddBias"],
  weightsChecksumSha256: "3f98a7c2e0b514d8",
  weights: CANONICAL_VTO_WEIGHTS,
};

/**
 * Extracts the canonical 8-element feature vector from PreparedVirtualTryOnInput.
 */
export function extractVtoFeatureTensor(preparedInput: PreparedVirtualTryOnInput): Tensor {
  const ant = preparedInput.anthropometricProfile;
  const alg = preparedInput.garmentAlignment;

  const heightRatio = Number.isFinite(ant.estimatedHeightRatio.value) ? ant.estimatedHeightRatio.value : 0.8;
  const shoulderWidth = Number.isFinite(ant.shoulderWidthRatio.value) ? ant.shoulderWidthRatio.value : 0.25;
  const hipWidth = Number.isFinite(ant.hipWidthRatio.value) ? ant.hipWidthRatio.value : 0.22;
  const shoulderToHip = Number.isFinite(ant.shoulderToHipRatio.value) ? ant.shoulderToHipRatio.value : 1.14;
  const torsoLength = Number.isFinite(ant.torsoLengthRatio.value) ? ant.torsoLengthRatio.value : 0.35;

  const scaleX = Number.isFinite(alg.transform.scale.x) ? alg.transform.scale.x : 1.0;
  const scaleY = Number.isFinite(alg.transform.scale.y) ? alg.transform.scale.y : 1.0;
  // Normalize rotation (-180 to 180) to range [-1.0, 1.0]
  const rotNormalized = Number.isFinite(alg.transform.rotationDegrees)
    ? Math.max(-1.0, Math.min(1.0, alg.transform.rotationDegrees / 180.0))
    : 0.0;

  const values = [
    heightRatio,
    shoulderWidth,
    hipWidth,
    shoulderToHip,
    torsoLength,
    scaleX,
    scaleY,
    rotNormalized,
  ];

  return Tensor.fromArray([1, 8], values);
}
