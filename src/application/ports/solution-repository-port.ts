/**
 * AI Operating Platform - AI Solutions Repository Ports
 * 
 * Port definitions for persisting and querying AI Solutions, versions, and instances.
 */

import { AISolution, SolutionLifecycleState } from "../../domain/solution/ai-solution.js";
import { SolutionInstance } from "../../domain/solution/solution-instance.js";

export interface SolutionFilter {
  readonly tenantId: string;
  readonly lifecycleState?: SolutionLifecycleState | undefined;
  readonly ownerPrincipalId?: string | undefined;
  readonly search?: string | undefined;
}

export interface AISolutionRepositoryPort {
  save(solution: AISolution): Promise<void>;
  findById(id: string, tenantId: string): Promise<AISolution | undefined>;
  findByIdAndVersion(id: string, version: number, tenantId: string): Promise<AISolution | undefined>;
  listVersions(id: string, tenantId: string): Promise<readonly AISolution[]>;
  list(filter: SolutionFilter, limit?: number, offset?: number): Promise<readonly AISolution[]>;
  count(filter: SolutionFilter): Promise<number>;
}

export interface AISolutionInstanceRepositoryPort {
  save(instance: SolutionInstance): Promise<void>;
  findById(id: string, tenantId: string): Promise<SolutionInstance | undefined>;
  listBySolution(solutionId: string, tenantId: string): Promise<readonly SolutionInstance[]>;
}
