/**
 * AI Operating Platform - InMemoryAISolutionRepository
 * 
 * In-memory persistence adapter for AISolution and SolutionInstance with OCC support.
 */

import {
  AISolutionRepositoryPort,
  AISolutionInstanceRepositoryPort,
  SolutionFilter,
} from "../../../application/ports/solution-repository-port.js";
import { AISolution } from "../../../domain/solution/ai-solution.js";
import { SolutionInstance } from "../../../domain/solution/solution-instance.js";
import { SolutionConcurrencyConflictError } from "../../../domain/solution/solution-errors.js";

export class InMemoryAISolutionRepository implements AISolutionRepositoryPort {
  // Key: `${tenantId}:${id}:${version}`
  private readonly solutions = new Map<string, AISolution>();

  public async save(solution: AISolution): Promise<void> {
    const key = `${solution.tenantId}:${solution.id}:${solution.version}`;
    const existing = this.solutions.get(key);

    if (existing && existing.concurrencyVersion !== solution.concurrencyVersion - 1 && existing.concurrencyVersion !== solution.concurrencyVersion) {
      // If version is not an exact match or sequential update, throw concurrency conflict
      if (existing.concurrencyVersion >= solution.concurrencyVersion) {
        throw new SolutionConcurrencyConflictError(
          solution.id,
          solution.concurrencyVersion - 1,
          existing.concurrencyVersion
        );
      }
    }

    this.solutions.set(key, solution);
  }

  public async findById(id: string, tenantId: string): Promise<AISolution | undefined> {
    const matching: AISolution[] = [];
    for (const sol of this.solutions.values()) {
      if (sol.id === id && sol.tenantId === tenantId) {
        matching.push(sol);
      }
    }

    if (matching.length === 0) return undefined;

    // Return the latest version or active published version
    matching.sort((a, b) => b.version - a.version);
    return matching[0];
  }

  public async findByIdAndVersion(
    id: string,
    version: number,
    tenantId: string
  ): Promise<AISolution | undefined> {
    const key = `${tenantId}:${id}:${version}`;
    return this.solutions.get(key);
  }

  public async listVersions(id: string, tenantId: string): Promise<readonly AISolution[]> {
    const results: AISolution[] = [];
    for (const sol of this.solutions.values()) {
      if (sol.id === id && sol.tenantId === tenantId) {
        results.push(sol);
      }
    }
    return Object.freeze(results.sort((a, b) => a.version - b.version));
  }

  public async list(
    filter: SolutionFilter,
    limit: number = 50,
    offset: number = 0
  ): Promise<readonly AISolution[]> {
    // Map of id -> latest version
    const latestById = new Map<string, AISolution>();

    for (const sol of this.solutions.values()) {
      if (sol.tenantId !== filter.tenantId) continue;
      if (filter.lifecycleState && sol.lifecycleState !== filter.lifecycleState) continue;
      if (filter.ownerPrincipalId && sol.ownerPrincipalId !== filter.ownerPrincipalId) continue;
      if (filter.search) {
        const query = filter.search.toLowerCase();
        if (
          !sol.name.toLowerCase().includes(query) &&
          !sol.description.toLowerCase().includes(query) &&
          !sol.id.toLowerCase().includes(query)
        ) {
          continue;
        }
      }

      const existing = latestById.get(sol.id);
      if (!existing || sol.version > existing.version) {
        latestById.set(sol.id, sol);
      }
    }

    const all = Array.from(latestById.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    return Object.freeze(all.slice(offset, offset + limit));
  }

  public async count(filter: SolutionFilter): Promise<number> {
    const list = await this.list(filter, 100000, 0);
    return list.length;
  }

  public clear(): void {
    this.solutions.clear();
  }
}

export class InMemoryAISolutionInstanceRepository implements AISolutionInstanceRepositoryPort {
  private readonly instances = new Map<string, SolutionInstance>();

  public async save(instance: SolutionInstance): Promise<void> {
    const key = `${instance.tenantId}:${instance.id}`;
    this.instances.set(key, instance);
  }

  public async findById(id: string, tenantId: string): Promise<SolutionInstance | undefined> {
    const key = `${tenantId}:${id}`;
    return this.instances.get(key);
  }

  public async listBySolution(
    solutionId: string,
    tenantId: string
  ): Promise<readonly SolutionInstance[]> {
    const results: SolutionInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.solutionId === solutionId && inst.tenantId === tenantId) {
        results.push(inst);
      }
    }
    return Object.freeze(results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }

  public clear(): void {
    this.instances.clear();
  }
}
