import { Plan, PlanStep } from "../../domain/autonomy/plan.js";
import { PlannerPort } from "../../domain/autonomy/planner-port.js";
import { PlanningRequest } from "../../domain/autonomy/planning-request.js";

export type StepGenerator = (request: PlanningRequest) => readonly PlanStep[];

export class StubPlanner implements PlannerPort {
  constructor(private readonly stepGenerator?: StepGenerator | undefined) {}

  async plan(request: PlanningRequest): Promise<Plan> {
    if (this.stepGenerator) {
      const customSteps = this.stepGenerator(request);
      return Plan.create({
        id: `plan-${request.operationId}`,
        operationId: request.operationId,
        steps: customSteps,
      });
    }

    const maxAllowed = Math.min(request.budget.maxSteps, 2);
    const steps: PlanStep[] = [];

    if (maxAllowed >= 1) {
      steps.push(
        PlanStep.create({
          id: `${request.operationId}-step-1`,
          order: 1,
          action: "analyze_objective",
          input: { objective: request.objective },
        })
      );
    }

    if (maxAllowed >= 2) {
      steps.push(
        PlanStep.create({
          id: `${request.operationId}-step-2`,
          order: 2,
          action: "execute_solution",
          input: { objective: request.objective },
        })
      );
    }

    return Plan.create({
      id: `plan-${request.operationId}`,
      operationId: request.operationId,
      steps,
    });
  }
}
