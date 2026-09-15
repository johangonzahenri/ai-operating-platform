import { ArAssetDefinition } from "../../application/platform/ar-asset-registry.js";

export type BodyProfilePreset = "Nova" | "Sora" | "Mateo" | "Custom";

export interface AnatomicalMeasurements {
  readonly heightCm: number;
  readonly chestBustCm: number;
  readonly waistCm: number;
  readonly hipsCm: number;
  readonly inseamCm: number;
  readonly shoulderWidthCm: number;
  readonly headCircumferenceCm?: number | undefined;
  readonly footLengthCm?: number | undefined;
}

export interface BodyFitAnalysis {
  readonly preset: BodyProfilePreset;
  readonly recommendedSize: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  readonly fitIndex: number; // 0.0 (too tight) to 1.0 (perfect) to 2.0 (too loose)
  readonly tensionScore: number; // 0.0 (no tension) to 1.0 (critical stretch)
  readonly drapeComfort: number; // 0.0 to 1.0
  readonly fitVerdict: "PERFECT_FIT" | "SLIGHTLY_TIGHT" | "SLIGHTLY_LOOSE" | "RECOMMEND_SIZE_UP" | "RECOMMEND_SIZE_DOWN";
  readonly landmarkDeltas: Readonly<Record<string, number>>;
}

export type WebXrExperienceMode = "WebXR_AR_Session" | "QuickLook_USDZ" | "SceneViewer_GLB" | "Interactive_3D_Canvas" | "HighRes_2D_Fallback";

export interface DeviceXrCapabilities {
  readonly userAgent: string;
  readonly isAppleIos: boolean;
  readonly isAndroid: boolean;
  readonly hasWebXrAr: boolean;
  readonly hasWebGL2: boolean;
}

export class VirtualTryonEngine {
  private static readonly BODY_PRESETS: Record<BodyProfilePreset, AnatomicalMeasurements> = {
    Nova: {
      heightCm: 172,
      chestBustCm: 88,
      waistCm: 68,
      hipsCm: 94,
      inseamCm: 80,
      shoulderWidthCm: 39,
      headCircumferenceCm: 55,
      footLengthCm: 24.5,
    },
    Sora: {
      heightCm: 168,
      chestBustCm: 84,
      waistCm: 64,
      hipsCm: 90,
      inseamCm: 78,
      shoulderWidthCm: 37,
      headCircumferenceCm: 54,
      footLengthCm: 23.5,
    },
    Mateo: {
      heightCm: 182,
      chestBustCm: 102,
      waistCm: 84,
      hipsCm: 100,
      inseamCm: 84,
      shoulderWidthCm: 46,
      headCircumferenceCm: 58,
      footLengthCm: 27.5,
    },
    Custom: {
      heightCm: 170,
      chestBustCm: 90,
      waistCm: 72,
      hipsCm: 96,
      inseamCm: 79,
      shoulderWidthCm: 40,
      headCircumferenceCm: 56,
      footLengthCm: 25.0,
    },
  };

  static getPresetMeasurements(preset: BodyProfilePreset): AnatomicalMeasurements {
    return this.BODY_PRESETS[preset] ?? this.BODY_PRESETS.Custom;
  }

  static analyzeFit(measurements: AnatomicalMeasurements, asset: ArAssetDefinition): BodyFitAnalysis {
    const chestRatio = measurements.chestBustCm / 90.0;
    const waistRatio = measurements.waistCm / 70.0;
    const hipRatio = measurements.hipsCm / 95.0;

    const avgRatio = (chestRatio + waistRatio + hipRatio) / 3.0;

    let recommendedSize: "XS" | "S" | "M" | "L" | "XL" | "XXL" = "M";
    if (avgRatio < 0.85) recommendedSize = "XS";
    else if (avgRatio < 0.95) recommendedSize = "S";
    else if (avgRatio <= 1.05) recommendedSize = "M";
    else if (avgRatio <= 1.15) recommendedSize = "L";
    else if (avgRatio <= 1.25) recommendedSize = "XL";
    else recommendedSize = "XXL";

    const stretchFactor = (asset.metadata?.stretch as number) ?? 0.1;
    const tensionScore = Math.max(0, Math.min(1, (avgRatio - 1.0) / (0.3 + stretchFactor)));
    const fitIndex = Math.max(0.1, Math.min(1.9, 1.0 + (avgRatio - 1.0) * 0.8));
    const drapeComfort = Math.max(0.1, 1.0 - Math.abs(avgRatio - 1.0) * 0.5);

    let fitVerdict: BodyFitAnalysis["fitVerdict"] = "PERFECT_FIT";
    if (tensionScore > 0.6) fitVerdict = "RECOMMEND_SIZE_UP";
    else if (tensionScore > 0.3) fitVerdict = "SLIGHTLY_TIGHT";
    else if (fitIndex > 1.2) fitVerdict = "RECOMMEND_SIZE_DOWN";
    else if (fitIndex > 1.08) fitVerdict = "SLIGHTLY_LOOSE";

    let closestPreset: BodyProfilePreset = "Custom";
    if (Math.abs(measurements.heightCm - 172) < 4 && Math.abs(measurements.chestBustCm - 88) < 5) closestPreset = "Nova";
    else if (Math.abs(measurements.heightCm - 168) < 4 && Math.abs(measurements.chestBustCm - 84) < 5) closestPreset = "Sora";
    else if (Math.abs(measurements.heightCm - 182) < 4 && Math.abs(measurements.chestBustCm - 102) < 5) closestPreset = "Mateo";

    return {
      preset: closestPreset,
      recommendedSize,
      fitIndex,
      tensionScore,
      drapeComfort,
      fitVerdict,
      landmarkDeltas: {
        chestDeltaCm: measurements.chestBustCm - 90,
        waistDeltaCm: measurements.waistCm - 70,
        hipsDeltaCm: measurements.hipsCm - 95,
      },
    };
  }

  static resolveXrExperienceMode(caps: DeviceXrCapabilities, asset: ArAssetDefinition): WebXrExperienceMode {
    if (caps.hasWebXrAr) {
      return "WebXR_AR_Session";
    }
    if (caps.isAppleIos && asset.usdzUri) {
      return "QuickLook_USDZ";
    }
    if (caps.isAndroid && asset.primaryUri.endsWith(".glb")) {
      return "SceneViewer_GLB";
    }
    if (caps.hasWebGL2) {
      return "Interactive_3D_Canvas";
    }
    return "HighRes_2D_Fallback";
  }
}
