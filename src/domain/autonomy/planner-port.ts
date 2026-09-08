import { PlanningRequest } from "./planning-request.js";
import { Plan } from "./plan.js";
import { Decision } from "./decision.js";

/**
 * PlannerPort is the vendor-agnostic domain port defining how planning capabilities
 * are invoked to generate plans for an AutonomousOperation.
 * Concrete implementations (heuristic, template, or model-backed) reside strictly in infrastructure adapters.
 */
export interface PlannerPort {
  plan(request: PlanningRequest): Promise<Plan>;

  /**
   * @deprecated Decision evaluation is the sole responsibility of DecisionEvaluatorPort.
   * Retained for backward compatibility with Increment #3 mock implementations.
   */
  decide?(request: PlanningRequest, plan?: Plan): Promise<Decision>;
}

