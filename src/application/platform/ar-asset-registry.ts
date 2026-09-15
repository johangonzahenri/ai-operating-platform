export type ArAssetCategory = "apparel" | "footwear" | "accessories" | "eyewear" | "furniture" | "props";
export type ArFormat = "glb" | "gltf" | "usdz" | "webp" | "png" | "mp4";

export interface ArAssetLOD {
  readonly level: "low" | "medium" | "high" | "ultra";
  readonly polygonCount: number;
  readonly uri: string;
  readonly fileSizeMb: number;
}

export interface ArBoundingBox {
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly depthMeters: number;
}

export interface ArAssetDefinition {
  readonly urn: string; // e.g. urn:tentaciones:ar:apparel:silk-evening-dress
  readonly version: string; // SemVer e.g. 1.0.0
  readonly name: string;
  readonly category: ArAssetCategory;
  readonly formats: readonly ArFormat[];
  readonly primaryUri: string;
  readonly usdzUri?: string | undefined;
  readonly thumbnailUri: string;
  readonly boundingBox: ArBoundingBox;
  readonly lods: readonly ArAssetLOD[];
  readonly sha256Checksum: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

export class ArAssetRegistry {
  private readonly assets: Map<string, ArAssetDefinition> = new Map();

  constructor() {
    this.seedDefaultAssets();
  }

  private seedDefaultAssets(): void {
    this.register({
      urn: "urn:tentaciones:ar:apparel:silk-evening-dress",
      version: "1.0.0",
      name: "Vestido de Seda Tentaciones Gala",
      category: "apparel",
      formats: ["glb", "usdz", "webp"],
      primaryUri: "/assets/ar/apparel/silk-evening-dress.glb",
      usdzUri: "/assets/ar/apparel/silk-evening-dress.usdz",
      thumbnailUri: "/assets/ar/apparel/silk-evening-dress-thumb.webp",
      boundingBox: { widthMeters: 0.45, heightMeters: 1.35, depthMeters: 0.32 },
      lods: [
        { level: "high", polygonCount: 45000, uri: "/assets/ar/apparel/silk-evening-dress-lod0.glb", fileSizeMb: 8.4 },
        { level: "low", polygonCount: 8500, uri: "/assets/ar/apparel/silk-evening-dress-lod2.glb", fileSizeMb: 1.6 },
      ],
      sha256Checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      metadata: { fabric: "silk", stretch: 0.15, drapeIndex: 0.88 },
      tags: ["evening", "silk", "dress", "gala"],
    });

    this.register({
      urn: "urn:tentaciones:ar:footwear:leather-derby-black",
      version: "1.0.0",
      name: "Zapatos Derby Cuero Artesanal",
      category: "footwear",
      formats: ["glb", "usdz", "webp"],
      primaryUri: "/assets/ar/footwear/derby-black.glb",
      usdzUri: "/assets/ar/footwear/derby-black.usdz",
      thumbnailUri: "/assets/ar/footwear/derby-black-thumb.webp",
      boundingBox: { widthMeters: 0.22, heightMeters: 0.14, depthMeters: 0.31 },
      lods: [
        { level: "high", polygonCount: 32000, uri: "/assets/ar/footwear/derby-black-lod0.glb", fileSizeMb: 4.2 },
      ],
      sha256Checksum: "ca978112ca1bbdcaf064278e4a1f2c4510228022685712e1700757f519574d54",
      metadata: { material: "genuine_leather", sole: "vibram" },
      tags: ["formal", "leather", "shoes"],
    });

    this.register({
      urn: "urn:tentaciones:ar:eyewear:aviator-gold",
      version: "1.0.0",
      name: "Gafas de Sol Aviator Gold",
      category: "eyewear",
      formats: ["glb", "usdz", "webp"],
      primaryUri: "/assets/ar/eyewear/aviator-gold.glb",
      usdzUri: "/assets/ar/eyewear/aviator-gold.usdz",
      thumbnailUri: "/assets/ar/eyewear/aviator-gold-thumb.webp",
      boundingBox: { widthMeters: 0.14, heightMeters: 0.05, depthMeters: 0.15 },
      lods: [
        { level: "high", polygonCount: 18000, uri: "/assets/ar/eyewear/aviator-gold-lod0.glb", fileSizeMb: 2.1 },
      ],
      sha256Checksum: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      metadata: { uvProtection: "UV400", frame: "titanium" },
      tags: ["sunglasses", "gold", "aviator"],
    });
  }

  register(asset: ArAssetDefinition): void {
    if (!asset.urn || !asset.urn.startsWith("urn:tentaciones:ar:")) {
      throw new Error(`Invalid AR Asset URN format: ${asset.urn}. Must start with 'urn:tentaciones:ar:'`);
    }
    if (!asset.version || !/^\d+\.\d+\.\d+/.test(asset.version)) {
      throw new Error(`Invalid AR Asset version format: ${asset.version}. Must follow SemVer.`);
    }
    const key = `${asset.urn}@${asset.version}`;
    this.assets.set(key, asset);
    this.assets.set(asset.urn, asset); // Default to latest version
  }

  get(urnOrKey: string): ArAssetDefinition | undefined {
    return this.assets.get(urnOrKey);
  }

  listByCategory(category: ArAssetCategory): readonly ArAssetDefinition[] {
    const seen = new Set<string>();
    const results: ArAssetDefinition[] = [];
    for (const [key, asset] of this.assets.entries()) {
      if (!key.includes("@") && asset.category === category) {
        if (!seen.has(asset.urn)) {
          seen.add(asset.urn);
          results.push(asset);
        }
      }
    }
    return results;
  }

  listAll(): readonly ArAssetDefinition[] {
    const seen = new Set<string>();
    const results: ArAssetDefinition[] = [];
    for (const [key, asset] of this.assets.entries()) {
      if (!key.includes("@")) {
        if (!seen.has(asset.urn)) {
          seen.add(asset.urn);
          results.push(asset);
        }
      }
    }
    return results;
  }
}
