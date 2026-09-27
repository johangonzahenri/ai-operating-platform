/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * 2D Warp Field & Deformation Domain Model.
 * 
 * Invariants:
 * 1. Mathematical Determinism: Continuous grid representation with bilinear interpolation sampling.
 * 2. Hexagonal Purity: Pure geometry with zero OpenCV, WebGL, or Canvas bindings.
 * 3. Fail-Closed Validation: Invalid dimensions, non-finite offsets, or out-of-bound grid configurations fail closed.
 * 4. Backward Compatibility: Directly bridges Phase 154 2D affine transforms into continuous deformation fields.
 */

import { AffineTransform2D } from "./garment-alignment.js";

export type WarpFieldType =
  | "IDENTITY"
  | "TRANSLATION"
  | "SCALE"
  | "ROTATION"
  | "AFFINE"
  | "LOCALIZED_DEFORMATION";

export interface WarpField2D {
  readonly gridWidth: number;   // Number of control points along X axis (e.g. 16)
  readonly gridHeight: number;  // Number of control points along Y axis (e.g. 16)
  readonly dx: readonly number[]; // Normalized displacement along X (length gridWidth * gridHeight)
  readonly dy: readonly number[]; // Normalized displacement along Y (length gridWidth * gridHeight)
  readonly warpType: WarpFieldType;
  readonly maxDisplacement: number; // Maximum Euclidean displacement sqrt(dx^2 + dy^2)
  readonly isValid: boolean;
}

export interface WarpSampleResult {
  readonly uPrime: number; // Displaced coordinate X in range [0, 1]
  readonly vPrime: number; // Displaced coordinate Y in range [0, 1]
  readonly dx: number;     // Sampled displacement dx
  readonly dy: number;     // Sampled displacement dy
  readonly isValid: boolean;
}

/**
 * Validates a WarpField2D structure for numerical stability and dimensional consistency.
 */
export function validateWarpField(field: WarpField2D): { isValid: boolean; error?: string } {
  if (!field || typeof field !== "object") {
    return { isValid: false, error: "WarpField is null or undefined" };
  }

  if (!Number.isInteger(field.gridWidth) || field.gridWidth < 2 || !Number.isInteger(field.gridHeight) || field.gridHeight < 2) {
    return { isValid: false, error: `Invalid grid dimensions (min 2x2): ${field.gridWidth}x${field.gridHeight}` };
  }

  const expectedLength = field.gridWidth * field.gridHeight;
  if (!Array.isArray(field.dx) || field.dx.length !== expectedLength || !Array.isArray(field.dy) || field.dy.length !== expectedLength) {
    return { isValid: false, error: `Displacement array length mismatch: expected ${expectedLength}` };
  }

  for (let i = 0; i < expectedLength; i++) {
    if (!Number.isFinite(field.dx[i]) || !Number.isFinite(field.dy[i])) {
      return { isValid: false, error: `Non-finite displacement value at index ${i}` };
    }
  }

  if (!Number.isFinite(field.maxDisplacement) || field.maxDisplacement < 0) {
    return { isValid: false, error: `Invalid max displacement: ${field.maxDisplacement}` };
  }

  return { isValid: true };
}

/**
 * Creates an identity warp field (zero displacement across all grid points).
 */
export function createIdentityWarpField(gridWidth = 16, gridHeight = 16): WarpField2D {
  const size = gridWidth * gridHeight;
  const dx = new Array(size).fill(0);
  const dy = new Array(size).fill(0);

  return {
    gridWidth,
    gridHeight,
    dx,
    dy,
    warpType: "IDENTITY",
    maxDisplacement: 0,
    isValid: true,
  };
}

/**
 * Creates a continuous warp field from a Phase 154 2D affine transform.
 */
export function createAffineWarpField(
  gridWidth: number,
  gridHeight: number,
  transform: AffineTransform2D
): WarpField2D {
  if (
    gridWidth < 2 ||
    gridHeight < 2 ||
    !transform ||
    !transform.translation ||
    !transform.scale ||
    !Number.isFinite(transform.rotationDegrees)
  ) {
    const fallback = createIdentityWarpField(Math.max(2, gridWidth), Math.max(2, gridHeight));
    return { ...fallback, isValid: false };
  }

  const size = gridWidth * gridHeight;
  const dx: number[] = new Array(size);
  const dy: number[] = new Array(size);

  let maxDisp = 0;
  const rad = (transform.rotationDegrees * Math.PI) / 180.0;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  const anchorX = transform.anchorOrigin?.x ?? 0.5;
  const anchorY = transform.anchorOrigin?.y ?? 0.5;

  for (let gy = 0; gy < gridHeight; gy++) {
    const v = gy / (gridHeight - 1); // 0.0 to 1.0
    for (let gx = 0; gx < gridWidth; gx++) {
      const u = gx / (gridWidth - 1); // 0.0 to 1.0
      const idx = gy * gridWidth + gx;

      // Coordinate relative to anchor center
      const relU = u - anchorX;
      const relV = v - anchorY;

      // Apply scale & rotation
      const rotU = relU * transform.scale.x * cosT - relV * transform.scale.y * sinT;
      const rotV = relU * transform.scale.x * sinT + relV * transform.scale.y * cosT;

      // Translate back and apply translation offset
      const uPrime = rotU + anchorX + transform.translation.x;
      const vPrime = rotV + anchorY + transform.translation.y;

      const dispX = uPrime - u;
      const dispY = vPrime - v;

      dx[idx] = dispX;
      dy[idx] = dispY;

      const dispDist = Math.hypot(dispX, dispY);
      if (dispDist > maxDisp) {
        maxDisp = dispDist;
      }
    }
  }

  let warpType: WarpFieldType = "AFFINE";
  if (
    Math.abs(transform.rotationDegrees) < 0.001 &&
    Math.abs(transform.scale.x - 1.0) < 0.001 &&
    Math.abs(transform.scale.y - 1.0) < 0.001
  ) {
    warpType =
      Math.abs(transform.translation.x) < 0.001 && Math.abs(transform.translation.y) < 0.001
        ? "IDENTITY"
        : "TRANSLATION";
  } else if (Math.abs(transform.rotationDegrees) < 0.001) {
    warpType = "SCALE";
  }

  return {
    gridWidth,
    gridHeight,
    dx,
    dy,
    warpType,
    maxDisplacement: maxDisp,
    isValid: true,
  };
}

/**
 * Samples the 2D warp field at normalized coordinates (u, v) using bilinear interpolation.
 * Parameters u and v must be in [0.0, 1.0].
 */
export function sampleWarpField(
  field: WarpField2D,
  u: number,
  v: number
): WarpSampleResult {
  if (!field || !field.isValid || !Number.isFinite(u) || !Number.isFinite(v)) {
    return { uPrime: u, vPrime: v, dx: 0, dy: 0, isValid: false };
  }

  // Clamp normalized coordinates to unit interval
  const clampedU = Math.max(0.0, Math.min(1.0, u));
  const clampedV = Math.max(0.0, Math.min(1.0, v));

  // Compute grid fractional coordinates
  const gx = clampedU * (field.gridWidth - 1);
  const gy = clampedV * (field.gridHeight - 1);

  const x0 = Math.floor(gx);
  const x1 = Math.min(field.gridWidth - 1, x0 + 1);
  const y0 = Math.floor(gy);
  const y1 = Math.min(field.gridHeight - 1, y0 + 1);

  const tx = gx - x0;
  const ty = gy - y0;

  // Grid node indices
  const i00 = y0 * field.gridWidth + x0;
  const i10 = y0 * field.gridWidth + x1;
  const i01 = y1 * field.gridWidth + x0;
  const i11 = y1 * field.gridWidth + x1;

  // Bilinear interpolation for dx
  const dx0 = field.dx[i00] * (1 - tx) + field.dx[i10] * tx;
  const dx1 = field.dx[i01] * (1 - tx) + field.dx[i11] * tx;
  const interpDx = dx0 * (1 - ty) + dx1 * ty;

  // Bilinear interpolation for dy
  const dy0 = field.dy[i00] * (1 - tx) + field.dy[i10] * tx;
  const dy1 = field.dy[i01] * (1 - tx) + field.dy[i11] * tx;
  const interpDy = dy0 * (1 - ty) + dy1 * ty;

  const uPrime = clampedU + interpDx;
  const vPrime = clampedV + interpDy;

  return {
    uPrime,
    vPrime,
    dx: interpDx,
    dy: interpDy,
    isValid: Number.isFinite(uPrime) && Number.isFinite(vPrime),
  };
}
