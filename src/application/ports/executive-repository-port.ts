/**
 * AI Operating Platform - Executive Repository Ports
 */

import { ExecutiveCycle } from "../../domain/executive/executive-cycle.js";
import { ExecutiveContextSnapshot } from "../../domain/executive/executive-context-snapshot.js";
import { ExecutiveAnalysis } from "../../domain/executive/executive-analysis.js";
import { ExecutivePlan } from "../../domain/executive/executive-plan.js";

export interface ExecutiveCycleRepositoryPort {
  save(cycle: ExecutiveCycle): Promise<void>;
  findById(id: string, tenantId: string): Promise<ExecutiveCycle | undefined>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveCycle[]>;
  listByTenant(tenantId: string): Promise<readonly ExecutiveCycle[]>;
}

export interface ExecutiveContextSnapshotRepositoryPort {
  save(snapshot: ExecutiveContextSnapshot): Promise<void>;
  findById(id: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined>;
  findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveContextSnapshot | undefined>;
}

export interface ExecutiveAnalysisRepositoryPort {
  save(analysis: ExecutiveAnalysis): Promise<void>;
  findById(id: string, tenantId: string): Promise<ExecutiveAnalysis | undefined>;
  findByCycleId(cycleId: string, tenantId: string): Promise<ExecutiveAnalysis | undefined>;
}

export interface ExecutivePlanRepositoryPort {
  save(plan: ExecutivePlan): Promise<void>;
  findById(id: string, tenantId: string): Promise<ExecutivePlan | undefined>;
  findByCycleId(cycleId: string, tenantId: string): Promise<ExecutivePlan | undefined>;
}
