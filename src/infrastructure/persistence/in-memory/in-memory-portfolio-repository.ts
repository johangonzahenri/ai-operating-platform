/**
 * AI Operating Platform - In-Memory Portfolio Repositories
 */

import { EnterprisePortfolio } from "../../../domain/portfolio/enterprise-portfolio.js";
import { EnterpriseGovernanceMandate } from "../../../domain/portfolio/governance-mandate.js";
import { PortfolioObjective } from "../../../domain/portfolio/portfolio-objective.js";
import {
  EnterprisePortfolioRepositoryPort,
  GovernanceMandateRepositoryPort,
  PortfolioObjectiveRepositoryPort,
} from "../../../application/ports/portfolio-repository-port.js";
import { PortfolioConcurrencyConflictError } from "../../../domain/portfolio/portfolio-errors.js";

export class InMemoryEnterprisePortfolioRepository implements EnterprisePortfolioRepositoryPort {
  private readonly portfolios = new Map<string, EnterprisePortfolio>();

  private makeKey(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async save(portfolio: EnterprisePortfolio): Promise<void> {
    const key = this.makeKey(portfolio.id, portfolio.tenantId);
    const existing = this.portfolios.get(key);
    if (existing && existing.concurrencyVersion !== portfolio.concurrencyVersion - 1 && existing.concurrencyVersion !== portfolio.concurrencyVersion) {
      if (portfolio.concurrencyVersion <= existing.concurrencyVersion && existing.version !== portfolio.version) {
        throw new PortfolioConcurrencyConflictError(
          portfolio.id,
          existing.concurrencyVersion,
          portfolio.concurrencyVersion
        );
      }
    }
    this.portfolios.set(key, portfolio);
  }

  async findById(id: string, tenantId: string): Promise<EnterprisePortfolio | null> {
    return this.portfolios.get(this.makeKey(id, tenantId)) ?? null;
  }

  async findAll(tenantId: string): Promise<readonly EnterprisePortfolio[]> {
    const results: EnterprisePortfolio[] = [];
    for (const p of this.portfolios.values()) {
      if (p.tenantId === tenantId) {
        results.push(p);
      }
    }
    return Object.freeze(results);
  }

  async findByEnterpriseId(enterpriseId: string, tenantId: string): Promise<readonly EnterprisePortfolio[]> {
    const results: EnterprisePortfolio[] = [];
    for (const p of this.portfolios.values()) {
      if (p.tenantId === tenantId && p.hasEnterprise(enterpriseId)) {
        results.push(p);
      }
    }
    return Object.freeze(results);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    return this.portfolios.delete(this.makeKey(id, tenantId));
  }
}

export class InMemoryGovernanceMandateRepository implements GovernanceMandateRepositoryPort {
  private readonly mandates = new Map<string, EnterpriseGovernanceMandate>();

  private makeKey(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async save(mandate: EnterpriseGovernanceMandate): Promise<void> {
    const key = this.makeKey(mandate.id, mandate.tenantId);
    const existing = this.mandates.get(key);
    if (existing && existing.concurrencyVersion !== mandate.concurrencyVersion - 1 && existing.concurrencyVersion !== mandate.concurrencyVersion) {
      if (mandate.concurrencyVersion <= existing.concurrencyVersion && existing.version !== mandate.version) {
        throw new PortfolioConcurrencyConflictError(
          mandate.id,
          existing.concurrencyVersion,
          mandate.concurrencyVersion
        );
      }
    }
    this.mandates.set(key, mandate);
  }

  async findById(id: string, tenantId: string): Promise<EnterpriseGovernanceMandate | null> {
    return this.mandates.get(this.makeKey(id, tenantId)) ?? null;
  }

  async findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly EnterpriseGovernanceMandate[]> {
    const results: EnterpriseGovernanceMandate[] = [];
    for (const m of this.mandates.values()) {
      if (m.tenantId === tenantId && m.portfolioId === portfolioId) {
        results.push(m);
      }
    }
    return Object.freeze(results);
  }

  async findByTenantId(tenantId: string): Promise<readonly EnterpriseGovernanceMandate[]> {
    const results: EnterpriseGovernanceMandate[] = [];
    for (const m of this.mandates.values()) {
      if (m.tenantId === tenantId) {
        results.push(m);
      }
    }
    return Object.freeze(results);
  }

  async findActiveMandates(
    granteePrincipalId: string,
    portfolioId: string,
    tenantId: string,
    targetEnterpriseId?: string
  ): Promise<readonly EnterpriseGovernanceMandate[]> {
    const results: EnterpriseGovernanceMandate[] = [];
    const now = new Date();
    for (const m of this.mandates.values()) {
      if (
        m.tenantId === tenantId &&
        m.portfolioId === portfolioId &&
        m.granteePrincipalId === granteePrincipalId &&
        m.isEffectiveAt(now)
      ) {
        if (!targetEnterpriseId || m.targetEnterpriseIds.includes(targetEnterpriseId) || m.targetEnterpriseIds.includes("*")) {
          results.push(m);
        }
      }
    }
    return Object.freeze(results);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    return this.mandates.delete(this.makeKey(id, tenantId));
  }
}

export class InMemoryPortfolioObjectiveRepository implements PortfolioObjectiveRepositoryPort {
  private readonly objectives = new Map<string, PortfolioObjective>();

  private makeKey(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async save(objective: PortfolioObjective): Promise<void> {
    const key = this.makeKey(objective.id, objective.tenantId);
    const existing = this.objectives.get(key);
    if (existing && existing.concurrencyVersion !== objective.concurrencyVersion - 1 && existing.concurrencyVersion !== objective.concurrencyVersion) {
      if (objective.concurrencyVersion <= existing.concurrencyVersion && existing.version !== objective.version) {
        throw new PortfolioConcurrencyConflictError(
          objective.id,
          existing.concurrencyVersion,
          objective.concurrencyVersion
        );
      }
    }
    this.objectives.set(key, objective);
  }

  async findById(id: string, tenantId: string): Promise<PortfolioObjective | null> {
    return this.objectives.get(this.makeKey(id, tenantId)) ?? null;
  }

  async findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly PortfolioObjective[]> {
    const results: PortfolioObjective[] = [];
    for (const o of this.objectives.values()) {
      if (o.tenantId === tenantId && o.portfolioId === portfolioId) {
        results.push(o);
      }
    }
    return Object.freeze(results);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    return this.objectives.delete(this.makeKey(id, tenantId));
  }
}
