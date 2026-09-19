/**
 * AI Operating Platform - Business Repository Ports
 */

import { Enterprise } from "../../domain/business/enterprise.js";
import { BusinessObjective } from "../../domain/business/business-objective.js";
import { BusinessInitiative } from "../../domain/business/business-initiative.js";
import { BusinessMetric } from "../../domain/business/business-metric.js";
import { ExecutiveDecisionRecord } from "../../domain/business/executive-decision-record.js";

export interface EnterpriseRepositoryPort {
  save(enterprise: Enterprise): Promise<void>;
  findById(id: string, tenantId: string): Promise<Enterprise | undefined>;
  listByTenant(tenantId: string): Promise<readonly Enterprise[]>;
}

export interface BusinessObjectiveRepositoryPort {
  save(objective: BusinessObjective): Promise<void>;
  findById(id: string, tenantId: string): Promise<BusinessObjective | undefined>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessObjective[]>;
  listByTenant(tenantId: string): Promise<readonly BusinessObjective[]>;
}

export interface BusinessInitiativeRepositoryPort {
  save(initiative: BusinessInitiative): Promise<void>;
  findById(id: string, tenantId: string): Promise<BusinessInitiative | undefined>;
  listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessInitiative[]>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessInitiative[]>;
  listByTenant(tenantId: string): Promise<readonly BusinessInitiative[]>;
}

export interface BusinessMetricRepositoryPort {
  save(metric: BusinessMetric): Promise<void>;
  findById(id: string, tenantId: string): Promise<BusinessMetric | undefined>;
  listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessMetric[]>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessMetric[]>;
  listByTenant(tenantId: string): Promise<readonly BusinessMetric[]>;
}

export interface ExecutiveDecisionRepositoryPort {
  save(decision: ExecutiveDecisionRecord): Promise<void>;
  findById(id: string, tenantId: string): Promise<ExecutiveDecisionRecord | undefined>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]>;
  listByTarget(targetId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]>;
  listByTenant(tenantId: string): Promise<readonly ExecutiveDecisionRecord[]>;
}
