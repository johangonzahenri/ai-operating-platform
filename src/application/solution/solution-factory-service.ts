/**
 * AI Operating Platform - SolutionFactoryService
 * 
 * Core application service orchestrating AI Solution creation, composition,
 * deterministic validation, publish gate enforcement, versioning,
 * lifecycle management, and instance initialization.
 */

import {
  AISolution,
  SolutionLifecycleState,
} from "../../domain/solution/ai-solution.js";
import {
  SolutionBlueprint,
  SolutionBlueprintProps,
  SolutionBlueprintValidationReport,
} from "../../domain/solution/solution-blueprint.js";
import {
  SolutionInstance,
  SolutionInstanceProps,
} from "../../domain/solution/solution-instance.js";
import {
  SolutionNotFoundError,
  SolutionVersionNotFoundError,
  SolutionTenantMismatchError,
  SolutionValidationError,
} from "../../domain/solution/solution-errors.js";
import {
  AISolutionRepositoryPort,
  AISolutionInstanceRepositoryPort,
  SolutionFilter,
} from "../ports/solution-repository-port.js";
import { SolutionBlueprintValidator } from "./solution-blueprint-validator.js";
import { EventPublisher } from "../../domain/events/events.js";
import {
  createSolutionCreatedEvent,
  createSolutionUpdatedEvent,
  createSolutionValidationStartedEvent,
  createSolutionValidationCompletedEvent,
  createSolutionPublishedEvent,
  createSolutionArchivedEvent,
  createSolutionDeprecatedEvent,
  createSolutionInstanceCreatedEvent,
} from "../../domain/solution/solution-events.js";

export interface CreateSolutionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly blueprint?: SolutionBlueprint | SolutionBlueprintProps | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly traceId?: string | undefined;
}

export interface UpdateSolutionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly blueprint?: SolutionBlueprint | SolutionBlueprintProps | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
  readonly traceId?: string | undefined;
}

export interface ValidateSolutionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly version?: number | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
  readonly traceId?: string | undefined;
}

export interface PublishSolutionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly version?: number | undefined;
  readonly autoValidate?: boolean | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
  readonly traceId?: string | undefined;
}

export interface CreateNewVersionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly newVersionNumber?: number | undefined;
  readonly traceId?: string | undefined;
}

export interface TransitionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly version?: number | undefined;
  readonly reason?: string | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
  readonly traceId?: string | undefined;
}

export interface InstantiateSolutionParams {
  readonly id?: string | undefined;
  readonly solutionId: string;
  readonly solutionVersion?: number | undefined;
  readonly tenantId: string;
  readonly name?: string | undefined;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
  readonly operatorPrincipalId: string;
  readonly traceId?: string | undefined;
}

export interface SolutionFactoryServiceDependencies {
  readonly solutionRepo: AISolutionRepositoryPort;
  readonly instanceRepo?: AISolutionInstanceRepositoryPort | undefined;
  readonly validator: SolutionBlueprintValidator;
  readonly eventPublisher?: EventPublisher | undefined;
}

export class SolutionFactoryService {
  constructor(private readonly deps: SolutionFactoryServiceDependencies) {}

  /**
   * Creates a new AI Solution in DRAFT status (version 1).
   */
  public async createSolution(params: CreateSolutionParams): Promise<AISolution> {
    const existing = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    if (existing) {
      throw new SolutionValidationError(
        `AI Solution with id '${params.id}' already exists in tenant '${params.tenantId}'`
      );
    }

    const solution = AISolution.create({
      id: params.id,
      tenantId: params.tenantId,
      name: params.name,
      description: params.description,
      ownerPrincipalId: params.ownerPrincipalId,
      blueprint: params.blueprint,
      metadata: params.metadata,
    });

    await this.deps.solutionRepo.save(solution);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionCreatedEvent(solution, params.ownerPrincipalId, params.traceId)
      );
    }

    return solution;
  }

  /**
   * Updates an existing solution in DRAFT or VALIDATED status.
   */
  public async updateSolution(params: UpdateSolutionParams): Promise<AISolution> {
    const current = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    if (!current) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (current.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, current.tenantId);
    }

    const updated = current.updateDraft(
      {
        name: params.name,
        description: params.description,
        blueprint: params.blueprint,
        metadata: params.metadata,
      },
      params.principalId,
      params.expectedConcurrencyVersion
    );

    await this.deps.solutionRepo.save(updated);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionUpdatedEvent(updated, params.principalId, params.traceId)
      );
    }

    return updated;
  }

  /**
   * Deterministically validates the solution blueprint.
   */
  public async validateSolution(
    params: ValidateSolutionParams
  ): Promise<{ solution: AISolution; report: SolutionBlueprintValidationReport }> {
    let solution: AISolution | undefined;
    if (params.version !== undefined) {
      solution = await this.deps.solutionRepo.findByIdAndVersion(
        params.id,
        params.version,
        params.tenantId
      );
    } else {
      solution = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    }

    if (!solution) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (solution.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, solution.tenantId);
    }

    // Start validation state
    const validating = solution.startValidation(
      params.principalId,
      params.expectedConcurrencyVersion
    );
    await this.deps.solutionRepo.save(validating);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionValidationStartedEvent(validating, params.principalId, params.traceId)
      );
    }

    // Execute deterministic validation
    const report = await this.deps.validator.validate(validating.blueprint, params.tenantId);

    let finalSolution: AISolution;
    if (report.valid) {
      finalSolution = validating.markValidated(report, params.principalId);
    } else {
      finalSolution = validating.markValidationFailed(report, params.principalId);
    }

    await this.deps.solutionRepo.save(finalSolution);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionValidationCompletedEvent(
          finalSolution,
          report,
          params.principalId,
          params.traceId
        )
      );
    }

    return { solution: finalSolution, report };
  }

  /**
   * Publish Gate: Publishes the solution if validation is successful.
   */
  public async publishSolution(params: PublishSolutionParams): Promise<AISolution> {
    let solution: AISolution | undefined;
    if (params.version !== undefined) {
      solution = await this.deps.solutionRepo.findByIdAndVersion(
        params.id,
        params.version,
        params.tenantId
      );
    } else {
      solution = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    }

    if (!solution) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (solution.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, solution.tenantId);
    }

    // If autoValidate is enabled and solution is not yet validated, run validation first
    if (params.autoValidate && solution.lifecycleState !== "VALIDATED") {
      const { solution: valSol } = await this.validateSolution({
        id: params.id,
        tenantId: params.tenantId,
        principalId: params.principalId,
        version: solution.version,
      });
      solution = valSol;
    }

    const published = solution.publish(params.principalId, params.expectedConcurrencyVersion);
    await this.deps.solutionRepo.save(published);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionPublishedEvent(published, params.principalId, params.traceId)
      );
    }

    return published;
  }

  /**
   * Creates a new draft version from a published solution.
   */
  public async createNewVersion(params: CreateNewVersionParams): Promise<AISolution> {
    const existing = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    if (!existing) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (existing.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, existing.tenantId);
    }

    const versions = await this.deps.solutionRepo.listVersions(params.id, params.tenantId);
    const maxVersion = versions.reduce((max, s) => Math.max(max, s.version), 0);
    const nextVersion = params.newVersionNumber ?? maxVersion + 1;

    const newDraft = existing.createNewDraftVersion(nextVersion, params.principalId);
    await this.deps.solutionRepo.save(newDraft);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionCreatedEvent(newDraft, params.principalId, params.traceId)
      );
    }

    return newDraft;
  }

  /**
   * Archives a solution.
   */
  public async archiveSolution(params: TransitionParams): Promise<AISolution> {
    let solution: AISolution | undefined;
    if (params.version !== undefined) {
      solution = await this.deps.solutionRepo.findByIdAndVersion(
        params.id,
        params.version,
        params.tenantId
      );
    } else {
      solution = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    }

    if (!solution) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (solution.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, solution.tenantId);
    }

    const archived = solution.archive(
      params.principalId,
      params.reason,
      params.expectedConcurrencyVersion
    );
    await this.deps.solutionRepo.save(archived);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionArchivedEvent(archived, params.principalId, params.reason, params.traceId)
      );
    }

    return archived;
  }

  /**
   * Deprecates a solution.
   */
  public async deprecateSolution(params: TransitionParams): Promise<AISolution> {
    let solution: AISolution | undefined;
    if (params.version !== undefined) {
      solution = await this.deps.solutionRepo.findByIdAndVersion(
        params.id,
        params.version,
        params.tenantId
      );
    } else {
      solution = await this.deps.solutionRepo.findById(params.id, params.tenantId);
    }

    if (!solution) {
      throw new SolutionNotFoundError(params.id, params.tenantId);
    }

    if (solution.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, solution.tenantId);
    }

    const deprecated = solution.deprecate(
      params.principalId,
      params.reason,
      params.expectedConcurrencyVersion
    );
    await this.deps.solutionRepo.save(deprecated);

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionDeprecatedEvent(
          deprecated,
          params.principalId,
          params.reason,
          params.traceId
        )
      );
    }

    return deprecated;
  }

  /**
   * Instantiates an authorized published solution.
   */
  public async instantiateSolution(params: InstantiateSolutionParams): Promise<SolutionInstance> {
    const version = params.solutionVersion ?? 1;
    const solution = await this.deps.solutionRepo.findByIdAndVersion(
      params.solutionId,
      version,
      params.tenantId
    );

    if (!solution) {
      throw new SolutionNotFoundError(params.solutionId, params.tenantId);
    }

    if (solution.tenantId !== params.tenantId) {
      throw new SolutionTenantMismatchError(params.tenantId, solution.tenantId);
    }

    if (solution.lifecycleState !== "PUBLISHED") {
      throw new SolutionValidationError(
        `Cannot instantiate AI Solution '${params.solutionId}' in state '${solution.lifecycleState}'. Solution must be PUBLISHED.`
      );
    }

    const instanceId = params.id ?? crypto.randomUUID();
    const instance = SolutionInstance.create({
      id: instanceId,
      solutionId: solution.id,
      solutionVersion: solution.version,
      tenantId: params.tenantId,
      name: params.name,
      config: params.config,
      operatorPrincipalId: params.operatorPrincipalId,
    });

    if (this.deps.instanceRepo) {
      await this.deps.instanceRepo.save(instance);
    }

    if (this.deps.eventPublisher) {
      this.deps.eventPublisher.publish(
        createSolutionInstanceCreatedEvent(instance, params.operatorPrincipalId, params.traceId)
      );
    }

    return instance;
  }

  public async getSolution(id: string, tenantId: string): Promise<AISolution | undefined> {
    return this.deps.solutionRepo.findById(id, tenantId);
  }

  public async getSolutionVersion(
    id: string,
    version: number,
    tenantId: string
  ): Promise<AISolution | undefined> {
    return this.deps.solutionRepo.findByIdAndVersion(id, version, tenantId);
  }

  public async listSolutions(
    filter: SolutionFilter,
    limit?: number,
    offset?: number
  ): Promise<readonly AISolution[]> {
    return this.deps.solutionRepo.list(filter, limit, offset);
  }

  public async listSolutionVersions(
    id: string,
    tenantId: string
  ): Promise<readonly AISolution[]> {
    return this.deps.solutionRepo.listVersions(id, tenantId);
  }

  public async getInstance(
    instanceId: string,
    tenantId: string
  ): Promise<SolutionInstance | undefined> {
    if (!this.deps.instanceRepo) return undefined;
    return this.deps.instanceRepo.findById(instanceId, tenantId);
  }

  public async listInstances(
    solutionId: string,
    tenantId: string
  ): Promise<readonly SolutionInstance[]> {
    if (!this.deps.instanceRepo) return [];
    return this.deps.instanceRepo.listBySolution(solutionId, tenantId);
  }
}
