/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Preprocessed Virtual Try-On Pipeline & Prepared Input Assembly.
 * 
 * Glues:
 * - Raw Pose Validation & Coordinate Normalization
 * - One-Euro Temporal Smoothing
 * - Anthropometric Ratio Analysis
 * - Garment Geometric Alignment
 * - Assembles PreparedVirtualTryOnInput ready for VirtualTryOnService
 */

import {
  PoseFrame,
  PoseLandmark,
  CanonicalLandmarkIndex,
  getLandmarkCanonicalName,
  getLandmarkSemanticGroup,
  validateLandmark,
  normalizePixelCoordinates,
} from "./pose-types.js";
import { Point3DSmoother, OneEuroFilterConfig } from "./one-euro-filter.js";
import {
  AnthropometricProfile,
  computeAnthropometricProfile,
} from "./anthropometrics.js";
import {
  GarmentAlignmentResult,
  computeGarmentAlignment,
} from "./garment-alignment.js";
import {
  GarmentReference,
  BodyProfileReference,
  VirtualTryOnRequest,
} from "./virtual-tryon.js";

export interface RawPoseInput {
  readonly frameId: string;
  readonly timestampMs: number;
  readonly isPixelCoordinates: boolean;
  readonly imageDimensions?: { readonly widthPx: number; readonly heightPx: number };
  readonly isMirrored?: boolean;
  readonly rawLandmarks: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly z?: number | undefined;
    readonly confidence: number;
  }[];
}

export interface PreparedVirtualTryOnInput {
  readonly preparedInputId: string;
  readonly normalizedPose: PoseFrame;
  readonly smoothedPose: PoseFrame;
  readonly anthropometricProfile: AnthropometricProfile;
  readonly garmentAlignment: GarmentAlignmentResult;
  readonly isReadyForInference: boolean;
  readonly preparationDurationMs: number;
  readonly validationIssues: readonly string[];
}

export class PosePreprocessingPipeline {
  private _smoothers = new Map<number, Point3DSmoother>();
  private _filterConfig?: OneEuroFilterConfig;

  constructor(filterConfig?: OneEuroFilterConfig) {
    this._filterConfig = filterConfig;
  }

  public processPoseFrame(
    input: RawPoseInput,
    garment: GarmentReference,
    bodyProfile?: BodyProfileReference
  ): PreparedVirtualTryOnInput {
    const startTime = Date.now();
    const validationIssues: string[] = [];
    const normalizedLandmarks = new Map<number, PoseLandmark>();
    const smoothedLandmarks = new Map<number, PoseLandmark>();

    const widthPx = input.imageDimensions?.widthPx ?? 1920;
    const heightPx = input.imageDimensions?.heightPx ?? 1080;

    let totalConfidence = 0;
    let validCount = 0;

    // 1. Validation & Coordinate Normalization
    for (const raw of input.rawLandmarks) {
      let normX = raw.x;
      let normY = raw.y;
      let normZ = raw.z ?? 0;

      if (input.isPixelCoordinates) {
        const norm = normalizePixelCoordinates(raw.x, raw.y, raw.z, widthPx, heightPx, { clampToBounds: false });
        normX = norm.x;
        normY = norm.y;
        normZ = norm.z;
      }

      const landmarkObj: PoseLandmark = {
        id: raw.id,
        name: getLandmarkCanonicalName(raw.id),
        group: getLandmarkSemanticGroup(raw.id),
        position: {
          x: normX,
          y: normY,
          z: normZ,
          confidence: raw.confidence,
          visibility: raw.confidence >= 0.5 ? "VISIBLE" : "LOW_CONFIDENCE",
        },
        isValid: true,
      };

      const val = validateLandmark(landmarkObj, 0.4);
      if (!val.isValid && val.reason) {
        validationIssues.push(`Landmark ${raw.id} (${landmarkObj.name}): ${val.reason}`);
      }

      normalizedLandmarks.set(raw.id, {
        ...landmarkObj,
        isValid: val.isValid,
        position: {
          ...landmarkObj.position,
          visibility: val.visibility,
        },
      });

      // 2. Temporal Smoothing via One-Euro Filter
      if (!this._smoothers.has(raw.id)) {
        this._smoothers.set(raw.id, new Point3DSmoother(this._filterConfig));
      }
      const smoother = this._smoothers.get(raw.id)!;
      const smoothedPos = smoother.smooth(normX, normY, normZ, input.timestampMs);

      smoothedLandmarks.set(raw.id, {
        ...landmarkObj,
        isValid: val.isValid,
        position: {
          x: smoothedPos.x,
          y: smoothedPos.y,
          z: smoothedPos.z,
          confidence: raw.confidence,
          visibility: val.visibility,
        },
      });

      totalConfidence += raw.confidence;
      if (val.isValid) validCount++;
    }

    const overallConfidence = input.rawLandmarks.length > 0 ? totalConfidence / input.rawLandmarks.length : 0;

    const normalizedPoseFrame: PoseFrame = {
      frameId: `norm-${input.frameId}`,
      timestampMs: input.timestampMs,
      coordinateSystem: "NORMALIZED_3D",
      imageDimensions: input.imageDimensions,
      landmarks: normalizedLandmarks,
      overallConfidence: Number(overallConfidence.toFixed(2)),
      isMirrored: input.isMirrored ?? false,
    };

    const smoothedPoseFrame: PoseFrame = {
      frameId: `smooth-${input.frameId}`,
      timestampMs: input.timestampMs,
      coordinateSystem: "NORMALIZED_3D",
      imageDimensions: input.imageDimensions,
      landmarks: smoothedLandmarks,
      overallConfidence: Number(overallConfidence.toFixed(2)),
      isMirrored: input.isMirrored ?? false,
    };

    // 3. Anthropometric Analysis
    const anthropometrics = computeAnthropometricProfile(smoothedPoseFrame, bodyProfile);

    // 4. Garment Alignment Engine
    const garmentAlignment = computeGarmentAlignment(garment, smoothedPoseFrame, anthropometrics);

    const isReadyForInference =
      validCount >= 6 &&
      garmentAlignment.quality !== "INSUFFICIENT_DATA" &&
      overallConfidence >= 0.35;

    const durationMs = Date.now() - startTime;

    return Object.freeze({
      preparedInputId: `prep-${input.frameId}-${Date.now()}`,
      normalizedPose: normalizedPoseFrame,
      smoothedPose: smoothedPoseFrame,
      anthropometricProfile: anthropometrics,
      garmentAlignment,
      isReadyForInference,
      preparationDurationMs: durationMs,
      validationIssues: Object.freeze(validationIssues),
    });
  }

  public resetTemporalState(): void {
    for (const smoother of this._smoothers.values()) {
      smoother.reset();
    }
    this._smoothers.clear();
  }
}
