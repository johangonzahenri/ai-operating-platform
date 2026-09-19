import { MembershipRole } from "../organization/agent-membership.js";
import {
  WorkflowValidationError,
  WorkflowCycleError,
  WorkflowStateTransitionError,
} from "./workflow-errors.js";

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface WorkflowStepDefinition {
  readonly stepId: string;
  readonly name: string;
  readonly order: number;
  readonly purpose: string;
  readonly dependsOn?: readonly string[] | undefined;
  readonly responsibility?: string | undefined;
  readonly requiredCapabilities?: readonly string[] | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly assignedAgentId?: string | undefined;
  readonly assignedTeamId?: string | undefined;
  readonly inputTemplate?: Readonly<Record<string, unknown>> | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly requiresApproval?: boolean | undefined;
}

export interface CreateWorkflowDefinitionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly steps: readonly WorkflowStepDefinition[];
}

export interface UpdateWorkflowDefinitionProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly steps?: readonly WorkflowStepDefinition[] | undefined;
}

export interface RehydrateWorkflowDefinitionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: WorkflowStatus;
  readonly steps: readonly WorkflowStepDefinition[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class WorkflowDefinition {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: WorkflowStatus;
  readonly steps: readonly WorkflowStepDefinition[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RehydrateWorkflowDefinitionProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.organizationId = props.organizationId;
    this.areaId = props.areaId;
    this.teamId = props.teamId;
    this.name = props.name;
    this.description = props.description;
    this.version = props.version;
    this.status = props.status;
    this.steps = Object.freeze(props.steps.map((s) => Object.freeze({ ...s })));
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateWorkflowDefinitionProps): WorkflowDefinition {
    if (!props.id || typeof props.id !== "string" || props.id.trim() === "") {
      throw new WorkflowValidationError("Workflow definition requires a non-empty id");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || props.tenantId.trim() === "") {
      throw new WorkflowValidationError("Workflow definition requires a non-empty tenantId");
    }
    if (!props.organizationId || typeof props.organizationId !== "string" || props.organizationId.trim() === "") {
      throw new WorkflowValidationError("Workflow definition requires a non-empty organizationId");
    }
    if (!props.name || typeof props.name !== "string" || props.name.trim() === "") {
      throw new WorkflowValidationError("Workflow definition requires a non-empty name");
    }
    if (!Array.isArray(props.steps) || props.steps.length === 0) {
      throw new WorkflowValidationError("Workflow definition requires at least one step");
    }

    WorkflowDefinition.validateSteps(props.steps);

    const now = new Date();
    return new WorkflowDefinition({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      organizationId: props.organizationId.trim(),
      areaId: props.areaId?.trim() || undefined,
      teamId: props.teamId?.trim() || undefined,
      name: props.name.trim(),
      description: props.description?.trim() || "",
      version: 1,
      status: "DRAFT",
      steps: props.steps,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateWorkflowDefinitionProps): WorkflowDefinition {
    WorkflowDefinition.validateSteps(props.steps);
    return new WorkflowDefinition(props);
  }

  private static validateSteps(steps: readonly WorkflowStepDefinition[]): void {
    const stepIds = new Set<string>();

    for (const step of steps) {
      if (!step.stepId || typeof step.stepId !== "string" || step.stepId.trim() === "") {
        throw new WorkflowValidationError("Each step must have a non-empty stepId");
      }
      const normalizedId = step.stepId.trim();
      if (stepIds.has(normalizedId)) {
        throw new WorkflowValidationError(`Duplicate stepId '${normalizedId}' in workflow definition`);
      }
      stepIds.add(normalizedId);

      if (!step.name || typeof step.name !== "string" || step.name.trim() === "") {
        throw new WorkflowValidationError(`Step '${normalizedId}' requires a valid name`);
      }
      if (typeof step.order !== "number" || step.order < 0) {
        throw new WorkflowValidationError(`Step '${normalizedId}' requires a non-negative order`);
      }
      if (step.maxRetries !== undefined && (step.maxRetries < 0 || step.maxRetries > 5)) {
        throw new WorkflowValidationError(`Step '${normalizedId}' maxRetries must be between 0 and 5`);
      }
    }

    // Dependency & DAG validation
    for (const step of steps) {
      if (step.dependsOn && Array.isArray(step.dependsOn)) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            throw new WorkflowValidationError(`Step '${step.stepId}' depends on non-existent step '${depId}'`);
          }
          if (depId === step.stepId) {
            throw new WorkflowCycleError(`Step '${step.stepId}' cannot depend on itself`);
          }
        }
      }
    }

    // Graph cycle detection using DFS
    const adj = new Map<string, string[]>();
    for (const s of steps) {
      adj.set(s.stepId, s.dependsOn ? [...s.dependsOn] : []);
    }

    const visited = new Map<string, "VISITING" | "VISITED">();

    function dfs(node: string, path: string[]): void {
      visited.set(node, "VISITING");
      const deps = adj.get(node) || [];
      for (const dep of deps) {
        const state = visited.get(dep);
        if (state === "VISITING") {
          throw new WorkflowCycleError(`Cycle detected in workflow steps: ${[...path, node, dep].join(" -> ")}`);
        }
        if (!state) {
          dfs(dep, [...path, node]);
        }
      }
      visited.set(node, "VISITED");
    }

    for (const step of steps) {
      if (!visited.has(step.stepId)) {
        dfs(step.stepId, []);
      }
    }
  }

  activate(): WorkflowDefinition {
    if (this.status === "ACTIVE") {
      return this;
    }
    if (this.status === "ARCHIVED") {
      throw new WorkflowStateTransitionError("Cannot activate an ARCHIVED workflow definition");
    }
    return new WorkflowDefinition({
      ...this,
      status: "ACTIVE",
      updatedAt: new Date(),
    });
  }

  archive(): WorkflowDefinition {
    if (this.status === "ARCHIVED") {
      return this;
    }
    return new WorkflowDefinition({
      ...this,
      status: "ARCHIVED",
      updatedAt: new Date(),
    });
  }

  update(props: UpdateWorkflowDefinitionProps): WorkflowDefinition {
    if (this.status === "ARCHIVED") {
      throw new WorkflowStateTransitionError("Cannot update an ARCHIVED workflow definition");
    }
    const steps = props.steps ?? this.steps;
    WorkflowDefinition.validateSteps(steps);

    return new WorkflowDefinition({
      ...this,
      name: props.name?.trim() || this.name,
      description: props.description !== undefined ? props.description.trim() : this.description,
      steps,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  createNewVersion(props: { readonly name?: string; readonly description?: string; readonly steps: readonly WorkflowStepDefinition[] }): WorkflowDefinition {
    WorkflowDefinition.validateSteps(props.steps);
    const now = new Date();
    return new WorkflowDefinition({
      ...this,
      name: props.name?.trim() || this.name,
      description: props.description !== undefined ? props.description.trim() : this.description,
      version: this.version + 1,
      status: "DRAFT",
      steps: props.steps,
      updatedAt: now,
    });
  }
}
