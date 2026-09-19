/**
 * AI Operating Platform - In-Memory Executive Repositories
 */

import { ExecutiveCycle } from "../../../domain/executive/executive-cycle.js";
import { ExecutiveContextSnapshot } from "../../../domain/executive/executive-context-snapshot.js";
import { ExecutiveAnalysis } from "../../../domain/executive/executive-analysis.js";
import { ExecutivePlan } from "../../../domain/executive/executive-plan.js";
import {
  ExecutiveCycleRepositoryPort,
  ExecutiveContextSnapshotRepositoryPort,
  ExecutiveAnalysisRepositoryPort,
  ExecutivePlanRepositoryPort,
} from "../../../application/ports/executive-repository-port.js";
import { ExecutiveConcurrencyConflictError } from "../../../domain/executive/executive-errors.js";

export class InMemoryExecutiveCycleRepository implements ExecutiveCycleRepositoryPort {
  private readonly cycles = new Map<string, ExecutiveCycle>();

  async save(cycle: ExecutiveCycle): Promise<void> {
    const key = `${cycle.tenantId}:${cycle.id}`;
    const existing = this.cycles.get(key);
    if (existing && existing.concurrencyVersion >= cycle.concurrencyVersion) {
      throw new ExecutiveConcurrencyConflictError(cycle.id, existing.concurrencyVersion, cycle.concurrencyVersion);
    }
    this.cycles.set(key, cycle);
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveCycle | undefined> {
    return this.cycles.get(`${tenantId}:${id}`);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveCycle[]> {
    const results: ExecutiveCycle[] = [];
    for (const cycle of this.cycles.values()) {
      if (cycle.tenantId === tenantId && cycle.enterpriseId === enterpriseId) {
        results.push(cycle);
      }
    }
    return Object.freeze(results);
  }

  async listByTenant(tenantId: string): Promise<readonly ExecutiveCycle[]> {
    const results: ExecutiveCycle[] = [];
    for (const cycle of this.cycles.values()) {
      if (cycle.tenantId === tenantId) {
        results.push(cycle);
      }
    }
    return Object.freeze(results);
  }
}

export class InMemoryExecutiveContextSnapshotRepository implements ExecutiveContextSnapshotRepositoryPort {
  private readonly snapshots = new Map<string, ExecutiveContextSnapshot>();

  async save(snapshot: ExecutiveContextSnapshot): Promise<void> {
    this.snapshots.set(`${snapshot.tenantId}:${snapshot.id}`, snapshot);
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined> {
    return this.snapshots.get(`${tenantId}:${id}`);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined> {
    for (const snap of this.snapshots.values()) {
      if (snap.tenantId === tenantId && snap.cycleId === cycleId) {
        return snap;
      }
    }
    return undefined;
  }
}

export class InMemoryExecutiveAnalysisRepository implements ExecutiveAnalysisRepositoryPort {
  private readonly analyses = new Map<string, ExecutiveAnalysis>();

  async save(analysis: ExecutiveAnalysis): Promise<void> {
    this.analyses.set(`${analysis.tenantId}:${analysis.id}`, analysis);
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveAnalysis | undefined> {
    return this.analyses.get(`${tenantId}:${id}`);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveAnalysis | undefined> {
    for (const a of this.analyses.values()) {
      if (a.tenantId === tenantId && a.cycleId === cycleId) {
        return a;
      }
    }
    return undefined;
  }
}

export class InMemoryExecutivePlanRepository implements ExecutivePlanRepositoryPort {
  private readonly plans = new Map<string, ExecutivePlan>();

  async save(plan: ExecutivePlan): Promise<void> {
    const key = `${plan.tenantId}:${plan.id}`;
    const existing = this.plans.get(key);
    if (existing && existing.concurrencyVersion >= plan.concurrencyVersion) {
      throw new ExecutiveConcurrencyConflictError(plan.id, existing.concurrencyVersion, plan.concurrencyVersion);
    }
    this.plans.set(key, plan);
  }

  async findById(id: string, tenantId: string): Promise<ExecutivePlan | undefined> {
    return this.plans.get(`${tenantId}:${id}`);
  }

  async findByCycleId(cycleId: string, tenantId: string): Promise<ExecutivePlan | undefined> {
    for (const p of this.plans.values()) {
      if (p.tenantId === tenantId && p.cycleId === cycleId) {
        return p;
      }
    }
    return undefined;
  }
}
