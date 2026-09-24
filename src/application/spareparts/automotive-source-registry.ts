import {
  AutomotiveSource,
  AutomotiveSourceNotFoundError,
  AutomotiveSourceValidationError,
  AutomotiveSourceStatus,
  AutomotiveSourceType,
  AutomotiveAccessMethod,
} from "../../domain/spareparts/automotive-source.js";

export interface SourceQueryCriteria {
  readonly region?: string | undefined;
  readonly vehicleMake?: string | undefined;
  readonly partCategory?: string | undefined;
  readonly sourceType?: AutomotiveSourceType | undefined;
  readonly accessMethod?: AutomotiveAccessMethod | undefined;
  readonly status?: AutomotiveSourceStatus | undefined;
  readonly minReliability?: number | undefined;
  readonly requiresFitment?: boolean | undefined;
  readonly requiresPrice?: boolean | undefined;
}

export interface AutomotiveSourceRegistryPort {
  register(source: AutomotiveSource): Promise<AutomotiveSource>;
  update(source: AutomotiveSource): Promise<AutomotiveSource>;
  get(sourceId: string): Promise<AutomotiveSource | undefined>;
  list(criteria?: SourceQueryCriteria): Promise<readonly AutomotiveSource[]>;
  findByRegion(region: string): Promise<readonly AutomotiveSource[]>;
  findByCapability(capabilityKey: keyof AutomotiveSource["capabilities"]): Promise<readonly AutomotiveSource[]>;
}

export class InMemoryAutomotiveSourceRegistry implements AutomotiveSourceRegistryPort {
  private readonly sources: Map<string, AutomotiveSource> = new Map();

  constructor(initialSources?: readonly AutomotiveSource[]) {
    if (initialSources) {
      for (const s of initialSources) {
        this.sources.set(s.sourceId, s);
      }
    }
  }

  async register(source: AutomotiveSource): Promise<AutomotiveSource> {
    if (!source.sourceId || !source.sourceId.trim()) {
      throw new AutomotiveSourceValidationError("sourceId is required");
    }
    if (this.sources.has(source.sourceId)) {
      throw new AutomotiveSourceValidationError(`Source '${source.sourceId}' already exists`);
    }
    this.sources.set(source.sourceId, source);
    return source;
  }

  async update(source: AutomotiveSource): Promise<AutomotiveSource> {
    if (!this.sources.has(source.sourceId)) {
      throw new AutomotiveSourceNotFoundError(source.sourceId);
    }
    this.sources.set(source.sourceId, source);
    return source;
  }

  async get(sourceId: string): Promise<AutomotiveSource | undefined> {
    return this.sources.get(sourceId);
  }

  async list(criteria?: SourceQueryCriteria): Promise<readonly AutomotiveSource[]> {
    let result = Array.from(this.sources.values());

    if (!criteria) {
      return Object.freeze(result);
    }

    if (criteria.region) {
      const regionUpper = criteria.region.toUpperCase();
      result = result.filter(
        (s) => s.coverage.regions.includes(regionUpper) || s.coverage.regions.includes("GLOBAL")
      );
    }

    if (criteria.vehicleMake) {
      const makeUpper = criteria.vehicleMake.toUpperCase();
      result = result.filter(
        (s) =>
          s.coverage.vehicleMakes.some((m) => m.toUpperCase() === makeUpper) ||
          s.coverage.vehicleMakes.includes("ALL")
      );
    }

    if (criteria.partCategory) {
      const catLower = criteria.partCategory.toLowerCase();
      result = result.filter(
        (s) =>
          s.coverage.partCategories.some((c) => c.toLowerCase() === catLower) ||
          s.coverage.partCategories.includes("ALL")
      );
    }

    if (criteria.sourceType) {
      result = result.filter((s) => s.sourceType === criteria.sourceType);
    }

    if (criteria.accessMethod) {
      result = result.filter((s) => s.accessMethod === criteria.accessMethod);
    }

    if (criteria.status) {
      result = result.filter((s) => s.status === criteria.status);
    }

    if (criteria.minReliability !== undefined) {
      result = result.filter((s) => s.trustRating.sourceReliability >= (criteria.minReliability ?? 0));
    }

    if (criteria.requiresFitment) {
      result = result.filter(
        (s) =>
          s.capabilities.getFitmentMatrix === "SUPPORTED" ||
          s.capabilities.searchByVehicle === "SUPPORTED"
      );
    }

    if (criteria.requiresPrice) {
      result = result.filter((s) => s.capabilities.getPrice === "SUPPORTED");
    }

    return Object.freeze(result);
  }

  async findByRegion(region: string): Promise<readonly AutomotiveSource[]> {
    return this.list({ region });
  }

  async findByCapability(capabilityKey: keyof AutomotiveSource["capabilities"]): Promise<readonly AutomotiveSource[]> {
    const list = Array.from(this.sources.values()).filter((s) => s.capabilities[capabilityKey] === "SUPPORTED");
    return Object.freeze(list);
  }
}
