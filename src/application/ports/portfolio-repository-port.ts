/**
 * AI Operating Platform - Portfolio Repositories Port
 */

import { EnterprisePortfolio } from "../../domain/portfolio/enterprise-portfolio.js";
import { EnterpriseGovernanceMandate } from "../../domain/portfolio/governance-mandate.js";
import { PortfolioObjective } from "../../domain/portfolio/portfolio-objective.js";

export interface EnterprisePortfolioRepositoryPort {
  save(portfolio: EnterprisePortfolio): Promise<void>;
  findById(id: string, tenantId: string): Promise<EnterprisePortfolio | null>;
  findAll(tenantId: string): Promise<readonly EnterprisePortfolio[]>;
  findByEnterpriseId(enterpriseId: string, tenantId: string): Promise<readonly EnterprisePortfolio[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}

export interface GovernanceMandateRepositoryPort {
  save(mandate: EnterpriseGovernanceMandate): Promise<void>;
  findById(id: string, tenantId: string): Promise<EnterpriseGovernanceMandate | null>;
  findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly EnterpriseGovernanceMandate[]>;
  findActiveMandates(
    granteePrincipalId: string,
    portfolioId: string,
    tenantId: string,
    targetEnterpriseId?: string
  ): Promise<readonly EnterpriseGovernanceMandate[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}

export interface PortfolioObjectiveRepositoryPort {
  save(objective: PortfolioObjective): Promise<void>;
  findById(id: string, tenantId: string): Promise<PortfolioObjective | null>;
  findByPortfolioId(portfolioId: string, tenantId: string): Promise<readonly PortfolioObjective[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
