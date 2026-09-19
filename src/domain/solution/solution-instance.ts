/**
 * AI Operating Platform - SolutionInstance Domain Entity
 * 
 * Minimal documentary representation of an instantiated solution instance.
 * 
 * Solution Definition != Solution Instance
 * Template != Deployment
 */

import { SolutionValidationError } from "./solution-errors.js";

export type SolutionInstanceStatus = "INITIALIZED" | "ACTIVE" | "PAUSED" | "TERMINATED";

export interface SolutionInstanceProps {
  readonly id: string;
  readonly solutionId: string;
  readonly solutionVersion: number;
  readonly tenantId: string;
  readonly name?: string | undefined;
  readonly status: SolutionInstanceStatus;
  readonly config: Readonly<Record<string, unknown>>;
  readonly operatorPrincipalId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SolutionInstance {
  readonly id: string;
  readonly solutionId: string;
  readonly solutionVersion: number;
  readonly tenantId: string;
  readonly name: string;
  readonly status: SolutionInstanceStatus;
  readonly config: Readonly<Record<string, unknown>>;
  readonly operatorPrincipalId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: SolutionInstanceProps) {
    this.id = props.id;
    this.solutionId = props.solutionId;
    this.solutionVersion = props.solutionVersion;
    this.tenantId = props.tenantId;
    this.name = props.name ?? `${props.solutionId}-v${props.solutionVersion}-instance`;
    this.status = props.status;
    this.config = Object.freeze(props.config ? { ...props.config } : {});
    this.operatorPrincipalId = props.operatorPrincipalId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  public static create(props: {
    id: string;
    solutionId: string;
    solutionVersion: number;
    tenantId: string;
    name?: string | undefined;
    config?: Readonly<Record<string, unknown>> | undefined;
    operatorPrincipalId: string;
  }): SolutionInstance {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new SolutionValidationError("Instance id is required");
    }
    if (!props.solutionId || typeof props.solutionId !== "string" || !props.solutionId.trim()) {
      throw new SolutionValidationError("solutionId is required");
    }
    if (typeof props.solutionVersion !== "number" || props.solutionVersion < 1) {
      throw new SolutionValidationError("solutionVersion must be a positive integer");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new SolutionValidationError("tenantId is required");
    }
    if (!props.operatorPrincipalId || typeof props.operatorPrincipalId !== "string") {
      throw new SolutionValidationError("operatorPrincipalId is required");
    }

    const now = new Date();
    return new SolutionInstance({
      id: props.id.trim(),
      solutionId: props.solutionId.trim(),
      solutionVersion: props.solutionVersion,
      tenantId: props.tenantId.trim(),
      name: props.name?.trim(),
      status: "INITIALIZED",
      config: props.config ?? {},
      operatorPrincipalId: props.operatorPrincipalId.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: SolutionInstanceProps): SolutionInstance {
    return new SolutionInstance(props);
  }
}
