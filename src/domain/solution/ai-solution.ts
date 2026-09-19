/**
 * AI Operating Platform - AISolution Aggregate Root
 * 
 * Represents a governed, composed, and versioned AI Solution definition.
 * Enforces monotonic lifecycle transitions, publish gate integrity,
 * immutability of published versions, and OCC versioning.
 * 
 * AI Solution != Application Runtime
 * Solution Definition != Solution Instance
 */

import {
  SolutionValidationError,
  InvalidSolutionLifecycleTransitionError,
  SolutionNotValidatedError,
  SolutionPublishedImmutableError,
  SolutionConcurrencyConflictError,
  SolutionTenantMismatchError,
  UnauthorizedSolutionOperatorError,
} from "./solution-errors.js";
import {
  SolutionBlueprint,
  SolutionBlueprintProps,
  SolutionBlueprintValidationReport,
} from "./solution-blueprint.js";

export type SolutionLifecycleState =
  | "DRAFT"
  | "VALIDATING"
  | "VALIDATED"
  | "PUBLISHED"
  | "ARCHIVED"
  | "DEPRECATED";

export interface AISolutionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly lifecycleState: SolutionLifecycleState;
  readonly blueprint: SolutionBlueprint;
  readonly ownerPrincipalId: string;
  readonly lastValidationReport?: SolutionBlueprintValidationReport | undefined;
  readonly publishedAt?: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly concurrencyVersion: number;
}

export class AISolution {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly lifecycleState: SolutionLifecycleState;
  readonly blueprint: SolutionBlueprint;
  readonly ownerPrincipalId: string;
  readonly lastValidationReport?: SolutionBlueprintValidationReport | undefined;
  readonly publishedAt?: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly concurrencyVersion: number;

  private constructor(props: AISolutionProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.version = props.version;
    this.lifecycleState = props.lifecycleState;
    this.blueprint = props.blueprint;
    this.ownerPrincipalId = props.ownerPrincipalId;
    this.lastValidationReport = props.lastValidationReport;
    this.publishedAt = props.publishedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.metadata = Object.freeze(props.metadata ? { ...props.metadata } : {});
    this.concurrencyVersion = props.concurrencyVersion;
    Object.freeze(this);
  }

  public static create(props: {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    ownerPrincipalId: string;
    blueprint?: SolutionBlueprint | SolutionBlueprintProps | undefined;
    metadata?: Readonly<Record<string, unknown>> | undefined;
  }): AISolution {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new SolutionValidationError("Solution id is required and must be a non-empty string");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new SolutionValidationError("tenantId is required and must be a non-empty string");
    }
    if (!props.name || typeof props.name !== "string" || !props.name.trim()) {
      throw new SolutionValidationError("name is required and must be a non-empty string");
    }
    if (typeof props.description !== "string") {
      throw new SolutionValidationError("description must be a string");
    }
    if (!props.ownerPrincipalId || typeof props.ownerPrincipalId !== "string" || !props.ownerPrincipalId.trim()) {
      throw new SolutionValidationError("ownerPrincipalId is required and must be a non-empty string");
    }

    const blueprint =
      props.blueprint instanceof SolutionBlueprint
        ? props.blueprint
        : new SolutionBlueprint(props.blueprint ?? {});

    const now = new Date();
    return new AISolution({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      name: props.name.trim(),
      description: props.description.trim(),
      version: 1,
      lifecycleState: "DRAFT",
      blueprint,
      ownerPrincipalId: props.ownerPrincipalId.trim(),
      createdAt: now,
      updatedAt: now,
      metadata: props.metadata,
      concurrencyVersion: 1,
    });
  }

  public static rehydrate(props: AISolutionProps): AISolution {
    return new AISolution(props);
  }

  /**
   * Updates solution metadata or blueprint in DRAFT state.
   * If in VALIDATED state, updates reset the state to DRAFT to require re-validation.
   */
  public updateDraft(
    updates: {
      name?: string | undefined;
      description?: string | undefined;
      blueprint?: SolutionBlueprint | SolutionBlueprintProps | undefined;
      metadata?: Readonly<Record<string, unknown>> | undefined;
    },
    principalId: string,
    expectedConcurrencyVersion?: number | undefined
  ): AISolution {
    this.assertTenantAuthorization(this.tenantId);
    this.assertNotPublished();

    if (
      this.lifecycleState !== "DRAFT" &&
      this.lifecycleState !== "VALIDATED" &&
      this.lifecycleState !== "VALIDATING"
    ) {
      throw new InvalidSolutionLifecycleTransitionError(
        this.lifecycleState,
        "DRAFT",
        "Only solutions in DRAFT, VALIDATED, or VALIDATING can be updated"
      );
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    const name = updates.name !== undefined ? updates.name.trim() : this.name;
    if (!name) {
      throw new SolutionValidationError("Solution name cannot be empty");
    }

    const description =
      updates.description !== undefined ? updates.description.trim() : this.description;

    let blueprint = this.blueprint;
    if (updates.blueprint !== undefined) {
      blueprint =
        updates.blueprint instanceof SolutionBlueprint
          ? updates.blueprint
          : new SolutionBlueprint(updates.blueprint);
    }

    const metadata = updates.metadata !== undefined ? updates.metadata : this.metadata;

    return new AISolution({
      ...this,
      name,
      description,
      blueprint,
      metadata,
      lifecycleState: "DRAFT", // Reset to DRAFT upon modification
      lastValidationReport: undefined,
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Initiates deterministic blueprint validation.
   */
  public startValidation(principalId: string, expectedConcurrencyVersion?: number | undefined): AISolution {
    if (this.lifecycleState !== "DRAFT" && this.lifecycleState !== "VALIDATED") {
      throw new InvalidSolutionLifecycleTransitionError(
        this.lifecycleState,
        "VALIDATING",
        "Validation can only be initiated from DRAFT or VALIDATED state"
      );
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    return new AISolution({
      ...this,
      lifecycleState: "VALIDATING",
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Marks validation as successful.
   */
  public markValidated(
    report: SolutionBlueprintValidationReport,
    principalId: string,
    expectedConcurrencyVersion?: number | undefined
  ): AISolution {
    if (this.lifecycleState !== "VALIDATING" && this.lifecycleState !== "DRAFT") {
      throw new InvalidSolutionLifecycleTransitionError(
        this.lifecycleState,
        "VALIDATED",
        "Can only mark validated from VALIDATING or DRAFT state"
      );
    }

    if (!report.valid || report.errors.length > 0) {
      throw new SolutionValidationError(
        "Cannot mark solution as VALIDATED with an invalid validation report",
        report.errors
      );
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    return new AISolution({
      ...this,
      lifecycleState: "VALIDATED",
      lastValidationReport: report,
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Marks validation as failed, returning state to DRAFT.
   */
  public markValidationFailed(
    report: SolutionBlueprintValidationReport,
    principalId: string,
    expectedConcurrencyVersion?: number | undefined
  ): AISolution {
    this.checkConcurrency(expectedConcurrencyVersion);

    return new AISolution({
      ...this,
      lifecycleState: "DRAFT",
      lastValidationReport: report,
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Publish Gate: Publishes the solution. Must be in VALIDATED state with a valid report.
   */
  public publish(principalId: string, expectedConcurrencyVersion?: number | undefined): AISolution {
    this.assertNotPublished();

    if (this.lifecycleState !== "VALIDATED") {
      throw new SolutionNotValidatedError(
        this.id,
        `Current state is '${this.lifecycleState}'. Solution must be validated before publishing.`
      );
    }

    if (!this.lastValidationReport || !this.lastValidationReport.valid) {
      throw new SolutionNotValidatedError(
        this.id,
        "No valid validation report found on validated solution"
      );
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    const now = new Date();
    return new AISolution({
      ...this,
      lifecycleState: "PUBLISHED",
      publishedAt: now,
      updatedAt: now,
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Archives the solution.
   */
  public archive(
    principalId: string,
    reason?: string | undefined,
    expectedConcurrencyVersion?: number | undefined
  ): AISolution {
    if (this.lifecycleState === "ARCHIVED") {
      return this;
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    return new AISolution({
      ...this,
      lifecycleState: "ARCHIVED",
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Deprecates the solution.
   */
  public deprecate(
    principalId: string,
    reason?: string | undefined,
    expectedConcurrencyVersion?: number | undefined
  ): AISolution {
    if (this.lifecycleState === "DEPRECATED") {
      return this;
    }

    this.checkConcurrency(expectedConcurrencyVersion);

    return new AISolution({
      ...this,
      lifecycleState: "DEPRECATED",
      updatedAt: new Date(),
      concurrencyVersion: this.concurrencyVersion + 1,
    });
  }

  /**
   * Creates a new draft version from this published solution.
   */
  public createNewDraftVersion(newVersionNumber: number, principalId: string): AISolution {
    if (this.lifecycleState !== "PUBLISHED" && this.lifecycleState !== "DEPRECATED") {
      throw new SolutionValidationError(
        `Cannot create a new draft version from solution in state '${this.lifecycleState}'. Source solution must be PUBLISHED or DEPRECATED.`
      );
    }
    if (newVersionNumber <= this.version) {
      throw new SolutionValidationError(
        `New version number (${newVersionNumber}) must be strictly greater than current version (${this.version})`
      );
    }

    const now = new Date();
    return new AISolution({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      version: newVersionNumber,
      lifecycleState: "DRAFT",
      blueprint: this.blueprint,
      ownerPrincipalId: principalId,
      createdAt: now,
      updatedAt: now,
      metadata: this.metadata,
      concurrencyVersion: 1,
    });
  }

  private assertNotPublished(): void {
    if (this.lifecycleState === "PUBLISHED") {
      throw new SolutionPublishedImmutableError(this.id, this.version);
    }
  }

  private assertTenantAuthorization(tenantId: string): void {
    if (this.tenantId !== tenantId) {
      throw new SolutionTenantMismatchError(tenantId, this.tenantId);
    }
  }

  private checkConcurrency(expectedConcurrencyVersion?: number): void {
    if (
      expectedConcurrencyVersion !== undefined &&
      this.concurrencyVersion !== expectedConcurrencyVersion
    ) {
      throw new SolutionConcurrencyConflictError(
        this.id,
        expectedConcurrencyVersion,
        this.concurrencyVersion
      );
    }
  }
}
