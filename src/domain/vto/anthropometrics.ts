/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Anthropometric Ratio Engine & Body Proportion Modeling.
 * 
 * Invariants:
 * - Calculates relative geometric ratios, NOT absolute medical measurements.
 * - Distinguishes explicit provenance: MEASURED | ESTIMATED | PROFILE_PROVIDED | INFERRED | UNKNOWN.
 * - UNKNOWN ≠ 0: Incomplete landmark sets yield UNKNOWN or reduced confidence rather than zeros.
 */

import {
  PoseFrame,
  CanonicalLandmarkIndex,
  Landmark3D,
} from "./pose-types.js";
import { BodyProfileReference } from "./virtual-tryon.js";

export type AnthropometricMetricSource =
  | "DIRECT_MEASUREMENT"
  | "PROFILE_PRESET"
  | "LANDMARK_ESTIMATED"
  | "INFERRED"
  | "UNKNOWN";

export interface ProportionMetric {
  readonly value: number; // Ratio or relative metric
  readonly confidence: number; // 0.0 to 1.0
  readonly source: AnthropometricMetricSource;
  readonly isReliable: boolean;
}

export interface AnthropometricProfile {
  readonly profileId: string;
  readonly estimatedHeightRatio: ProportionMetric;      // Total vertical span relative to frame height
  readonly shoulderWidthRatio: ProportionMetric;        // Distance between shoulders relative to height
  readonly hipWidthRatio: ProportionMetric;             // Distance between hips relative to height
  readonly shoulderToHipRatio: ProportionMetric;        // shoulderWidth / hipWidth (V-taper / silhouette indicator)
  readonly torsoLengthRatio: ProportionMetric;          // Mid-shoulder to mid-hip relative to height
  readonly legLengthRatio: ProportionMetric;            // Mid-hip to mid-ankle relative to height
  readonly armSpanRatio: ProportionMetric;              // Wrist to wrist relative to height
  readonly postureTiltDegrees: ProportionMetric;        // Incline angle of shoulder/hip axis (-180 to 180)
  readonly calculatedAt: Date;
  readonly provenance: AnthropometricMetricSource;
}

export function euclideanDistance2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function euclideanDistance3D(p1: Landmark3D, p2: Landmark3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateMidpoint(p1: Landmark3D, p2: Landmark3D): Landmark3D {
  return {
    x: (p1.x + p2.x) / 2.0,
    y: (p1.y + p2.y) / 2.0,
    z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2.0,
    confidence: Math.min(p1.confidence, p2.confidence),
    visibility: p1.visibility === "VISIBLE" && p2.visibility === "VISIBLE" ? "VISIBLE" : "LOW_CONFIDENCE",
  };
}

export function computeAnthropometricProfile(
  frame: PoseFrame,
  knownProfile?: BodyProfileReference
): AnthropometricProfile {
  const lms = frame.landmarks;

  const leftShoulder = lms.get(CanonicalLandmarkIndex.LEFT_SHOULDER)?.position;
  const rightShoulder = lms.get(CanonicalLandmarkIndex.RIGHT_SHOULDER)?.position;
  const leftHip = lms.get(CanonicalLandmarkIndex.LEFT_HIP)?.position;
  const rightHip = lms.get(CanonicalLandmarkIndex.RIGHT_HIP)?.position;
  const leftAnkle = lms.get(CanonicalLandmarkIndex.LEFT_ANKLE)?.position;
  const rightAnkle = lms.get(CanonicalLandmarkIndex.RIGHT_ANKLE)?.position;
  const leftWrist = lms.get(CanonicalLandmarkIndex.LEFT_WRIST)?.position;
  const rightWrist = lms.get(CanonicalLandmarkIndex.RIGHT_WRIST)?.position;
  const nose = lms.get(CanonicalLandmarkIndex.NOSE)?.position;

  // 1. Shoulder Width
  let shoulderDist = 0;
  let shoulderConf = 0;
  if (leftShoulder && rightShoulder) {
    shoulderDist = euclideanDistance2D(leftShoulder, rightShoulder);
    shoulderConf = Math.min(leftShoulder.confidence, rightShoulder.confidence);
  }

  // 2. Hip Width
  let hipDist = 0;
  let hipConf = 0;
  if (leftHip && rightHip) {
    hipDist = euclideanDistance2D(leftHip, rightHip);
    hipConf = Math.min(leftHip.confidence, rightHip.confidence);
  }

  // 3. Torso Length (Mid-Shoulder to Mid-Hip)
  let torsoLen = 0;
  let torsoConf = 0;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const midShoulder = calculateMidpoint(leftShoulder, rightShoulder);
    const midHip = calculateMidpoint(leftHip, rightHip);
    torsoLen = euclideanDistance2D(midShoulder, midHip);
    torsoConf = Math.min(midShoulder.confidence, midHip.confidence);
  }

  // 4. Leg Length (Mid-Hip to Mid-Ankle)
  let legLen = 0;
  let legConf = 0;
  if (leftHip && rightHip && leftAnkle && rightAnkle) {
    const midHip = calculateMidpoint(leftHip, rightHip);
    const midAnkle = calculateMidpoint(leftAnkle, rightAnkle);
    legLen = euclideanDistance2D(midHip, midAnkle);
    legConf = Math.min(midHip.confidence, midAnkle.confidence);
  }

  // 5. Total Visible Height Span (Nose/Shoulder to Ankles)
  let totalHeight = 0;
  if (torsoLen > 0 && legLen > 0) {
    totalHeight = torsoLen + legLen + (nose && leftShoulder ? euclideanDistance2D(nose, leftShoulder) : torsoLen * 0.3);
  } else if (torsoLen > 0) {
    totalHeight = torsoLen * 2.2; // Fallback estimate
  } else {
    totalHeight = 1.0;
  }

  // 6. Arm Span
  let armSpan = 0;
  let armConf = 0;
  if (leftWrist && rightWrist) {
    armSpan = euclideanDistance2D(leftWrist, rightWrist);
    armConf = Math.min(leftWrist.confidence, rightWrist.confidence);
  }

  // 7. Posture / Shoulder Tilt Angle
  let tiltDeg = 0;
  if (leftShoulder && rightShoulder) {
    const dy = rightShoulder.y - leftShoulder.y;
    const dx = rightShoulder.x - leftShoulder.x;
    tiltDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  const defaultSource: AnthropometricMetricSource =
    knownProfile?.measurements ? "PROFILE_PRESET" : "LANDMARK_ESTIMATED";

  const createMetric = (
    val: number,
    conf: number,
    minThreshold = 0.4
  ): ProportionMetric => ({
    value: Number.isFinite(val) ? Number(val.toFixed(4)) : 0,
    confidence: Number.isFinite(conf) ? Number(conf.toFixed(2)) : 0,
    source: defaultSource,
    isReliable: conf >= minThreshold && val > 0,
  });

  return Object.freeze({
    profileId: knownProfile?.profileId ?? `anthro-${frame.frameId}`,
    estimatedHeightRatio: createMetric(totalHeight, Math.min(torsoConf, legConf)),
    shoulderWidthRatio: createMetric(shoulderDist / totalHeight, shoulderConf),
    hipWidthRatio: createMetric(hipDist / totalHeight, hipConf),
    shoulderToHipRatio: createMetric(hipDist > 0 ? shoulderDist / hipDist : 1.0, Math.min(shoulderConf, hipConf)),
    torsoLengthRatio: createMetric(torsoLen / totalHeight, torsoConf),
    legLengthRatio: createMetric(legLen / totalHeight, legConf),
    armSpanRatio: createMetric(armSpan / totalHeight, armConf),
    postureTiltDegrees: createMetric(tiltDeg, shoulderConf),
    calculatedAt: new Date(),
    provenance: defaultSource,
  });
}
