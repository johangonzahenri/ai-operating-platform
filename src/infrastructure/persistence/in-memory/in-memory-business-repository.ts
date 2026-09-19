/**
 * AI Operating Platform - In-Memory Business Repositories
 */

import { Enterprise } from "../../../domain/business/enterprise.js";
import { BusinessObjective } from "../../../domain/business/business-objective.js";
import { BusinessInitiative } from "../../../domain/business/business-initiative.js";
import { BusinessMetric } from "../../../domain/business/business-metric.js";
import { ExecutiveDecisionRecord } from "../../../domain/business/executive-decision-record.js";
import {
  EnterpriseRepositoryPort,
  BusinessObjectiveRepositoryPort,
  BusinessInitiativeRepositoryPort,
  BusinessMetricRepositoryPort,
  ExecutiveDecisionRepositoryPort,
} from "../../../application/ports/business-repository-port.js";
import { BusinessConcurrencyConflictError } from "../../../domain/business/business-errors.js";

export class InMemoryEnterpriseRepository implements EnterpriseRepositoryPort {
  private readonly items = new Map<string, Enterprise>();

  async save(enterprise: Enterprise): Promise<void> {
    const key = `${enterprise.tenantId}:${enterprise.id}`;
    const existing = this.items.get(key);
    if (existing && existing.concurrencyVersion !== enterprise.concurrencyVersion - 1 && existing.concurrencyVersion !== enterprise.concurrencyVersion) {
      // Allow re-saving same version or sequential increment
      if (enterprise.concurrencyVersion <= existing.concurrencyVersion && existing.version !== enterprise.version) {
        throw new BusinessConcurrencyConflictError(
          enterprise.id,
          existing.concurrencyVersion,
          enterprise.concurrencyVersion
        );
      }
    }
    this.items.set(key, enterprise);
  }

  async findById(id: string, tenantId: string): Promise<Enterprise | undefined> {
    return this.items.get(`${tenantId}:${id}`);
  }

  async listByTenant(tenantId: string): Promise<readonly Enterprise[]> {
    const results: Enterprise[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    return results;
  }
}

export class InMemoryBusinessObjectiveRepository implements BusinessObjectiveRepositoryPort {
  private readonly items = new Map<string, BusinessObjective>();

  async save(objective: BusinessObjective): Promise<void> {
    const key = `${objective.tenantId}:${objective.id}`;
    this.items.set(key, objective);
  }

  async findById(id: string, tenantId: string): Promise<BusinessObjective | undefined> {
    return this.items.get(`${tenantId}:${id}`);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessObjective[]> {
    const results: BusinessObjective[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.enterpriseId === enterpriseId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessObjective[]> {
    const results: BusinessObjective[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    return results;
  }
}

export class InMemoryBusinessInitiativeRepository implements BusinessInitiativeRepositoryPort {
  private readonly items = new Map<string, BusinessInitiative>();

  async save(initiative: BusinessInitiative): Promise<void> {
    const key = `${initiative.tenantId}:${initiative.id}`;
    this.items.set(key, initiative);
  }

  async findById(id: string, tenantId: string): Promise<BusinessInitiative | undefined> {
    return this.items.get(`${tenantId}:${id}`);
  }

  async listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessInitiative[]> {
    const results: BusinessInitiative[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.objectiveId === objectiveId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessInitiative[]> {
    const results: BusinessInitiative[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.enterpriseId === enterpriseId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessInitiative[]> {
    const results: BusinessInitiative[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    return results;
  }
}

export class InMemoryBusinessMetricRepository implements BusinessMetricRepositoryPort {
  private readonly items = new Map<string, BusinessMetric>();

  async save(metric: BusinessMetric): Promise<void> {
    const key = `${metric.tenantId}:${metric.id}`;
    this.items.set(key, metric);
  }

  async findById(id: string, tenantId: string): Promise<BusinessMetric | undefined> {
    return this.items.get(`${tenantId}:${id}`);
  }

  async listByObjective(objectiveId: string, tenantId: string): Promise<readonly BusinessMetric[]> {
    const results: BusinessMetric[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.objectiveId === objectiveId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly BusinessMetric[]> {
    const results: BusinessMetric[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.enterpriseId === enterpriseId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByTenant(tenantId: string): Promise<readonly BusinessMetric[]> {
    const results: BusinessMetric[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    return results;
  }
}

export class InMemoryExecutiveDecisionRepository implements ExecutiveDecisionRepositoryPort {
  private readonly items = new Map<string, ExecutiveDecisionRecord>();

  async save(decision: ExecutiveDecisionRecord): Promise<void> {
    const key = `${decision.tenantId}:${decision.id}`;
    this.items.set(key, decision);
  }

  async findById(id: string, tenantId: string): Promise<ExecutiveDecisionRecord | undefined> {
    return this.items.get(`${tenantId}:${id}`);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const results: ExecutiveDecisionRecord[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.enterpriseId === enterpriseId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByTarget(targetId: string, tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const results: ExecutiveDecisionRecord[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.targetId === targetId) {
        results.push(item);
      }
    }
    return results;
  }

  async listByTenant(tenantId: string): Promise<readonly ExecutiveDecisionRecord[]> {
    const results: ExecutiveDecisionRecord[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    return results;
  }
}
