import { Plan, PlanStep, InvalidPlanError } from "../../domain/autonomy/plan.js";
import { PlannerPort } from "../../domain/autonomy/planner-port.js";
import { PlanningRequest } from "../../domain/autonomy/planning-request.js";
import { PlanValidator, PlanValidationError } from "../../domain/autonomy/plan-validator.js";
import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelInvalidResponseError,
} from "../../domain/model/model-gateway.js";
import { PolicyGateway, PolicyDeniedError } from "../../domain/policy/policy.js";

export interface LLMPlannerOptions {
  readonly model?: string | undefined;
  readonly allowedActions?: readonly string[] | undefined;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly systemPrompt?: string | undefined;
  readonly temperature?: number | undefined;
}

export interface RawPlanStepPayload {
  readonly order?: number | undefined;
  readonly action?: string | undefined;
  readonly tool?: string | undefined;
  readonly input?: Record<string, unknown> | undefined;
  readonly reason?: string | undefined;
}

export interface RawPlanPayload {
  readonly steps?: readonly RawPlanStepPayload[] | undefined;
}

const DEFAULT_PLANNER_SYSTEM_PROMPT = `You are the Autonomous Planning Engine of the AI Operating Platform.
Your sole responsibility is to analyze the user objective within the allocated budget and propose a finite, declarative sequence of operational steps.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. You MUST respond with a valid JSON object matching this schema:
   {
     "steps": [
       {
         "order": 1,
         "action": "<action_or_tool_name>",
         "input": { "<param>": "<value>" },
         "reason": "<rationale>"
       }
     ]
   }
2. Propose only authorized actions/tools.
3. Steps must be strictly ordered starting from 1 (1, 2, 3...).
4. NEVER propose executable JavaScript, shell code, or functions.
5. NEVER attempt prototype manipulation or include reserved keys (__proto__, constructor).
6. Fail-closed: If the objective cannot be achieved with available actions, return an empty steps array.`;

/**
 * LLMPlanner is an adapter implementing PlannerPort that uses a vendor-agnostic ModelGateway
 * to formulate declarative, validated operational Plans.
 *
 * Invariant: LLMPlanner NEVER executes tools or interacts with runtime persistence.
 * It strictly formulates proposals and enforces fail-closed validation.
 */
export class LLMPlanner implements PlannerPort {
  constructor(
    private readonly modelGateway: ModelGateway,
    private readonly options: LLMPlannerOptions = {}
  ) {}

  async plan(request: PlanningRequest): Promise<Plan> {
    if (!request || !(request instanceof PlanningRequest)) {
      throw new InvalidPlanError("PlanningRequest must be a valid instance of PlanningRequest");
    }

    const systemInstruction = this.buildSystemPrompt();
    const model = this.options.model ?? "default-planner-model";

    const modelRequest: ModelRequest = {
      traceId: request.operationId,
      model,
      input: {
        objective: request.objective,
        budget: request.budget.snapshot(),
        currentStep: request.currentStep,
        agentId: request.agentId,
        ...(request.taskContext ? { taskContext: request.taskContext.snapshot() } : {}),
      },
      objective: request.objective,
      systemInstruction,
      requestedFormat: "json_schema",
      temperature: this.options.temperature ?? 0.1,
      maxTokens: 2048,
    };

    const response: ModelResponse = await this.modelGateway.generate(modelRequest);

    if (!response || !response.output || typeof response.output !== "object") {
      throw new ModelInvalidResponseError(
        response?.provider ?? "unknown",
        "Model response output is missing or not an object"
      );
    }

    const plan = this.parseAndConstructPlan(request, response.output);

    // Enforce fail-closed Plan validation
    PlanValidator.assertValid(plan, {
      allowedActions: this.options.allowedActions,
      maxSteps: request.budget.maxSteps,
    });

    // If PolicyGateway is configured on planner, verify pre-authorization
    if (this.options.policyGateway) {
      await this.evaluatePolicyPreflight(request, plan);
    }

    return plan;
  }

  private buildSystemPrompt(): string {
    let prompt = this.options.systemPrompt ?? DEFAULT_PLANNER_SYSTEM_PROMPT;
    if (this.options.allowedActions && this.options.allowedActions.length > 0) {
      prompt += `\n\nAUTHORIZED ACTIONS LIST: [${this.options.allowedActions.join(", ")}]`;
    }
    return prompt;
  }

  private parseAndConstructPlan(
    request: PlanningRequest,
    output: Readonly<Record<string, unknown>>
  ): Plan {
    const rawPlan = output as RawPlanPayload;
    if (!Array.isArray(rawPlan.steps) || rawPlan.steps.length === 0) {
      throw new PlanValidationError("Model output must contain a non-empty 'steps' array", [
        "Empty or missing 'steps' array in model response",
      ]);
    }

    const planSteps: PlanStep[] = [];
    for (let i = 0; i < rawPlan.steps.length; i++) {
      const rawStep = rawPlan.steps[i];
      if (!rawStep || typeof rawStep !== "object") {
        throw new PlanValidationError(`Step at index ${i} is not a valid object`, [
          `Step ${i} is invalid`,
        ]);
      }

      const order = i + 1;
      const action = (rawStep.action || rawStep.tool || "").trim();
      if (!action) {
        throw new PlanValidationError(`Step ${order} must specify a non-empty action or tool`, [
          `Step ${order} missing action`,
        ]);
      }

      const input = (rawStep.input && typeof rawStep.input === "object" && !Array.isArray(rawStep.input))
        ? rawStep.input
        : {};

      const metadata = rawStep.reason ? { reason: String(rawStep.reason) } : undefined;

      const step = PlanStep.create({
        id: `${request.operationId}-step-${order}`,
        order,
        action,
        input,
        metadata,
      });

      planSteps.push(step);
    }

    return Plan.create({
      id: `plan-${request.operationId}`,
      operationId: request.operationId,
      steps: planSteps,
    });
  }

  private async evaluatePolicyPreflight(request: PlanningRequest, plan: Plan): Promise<void> {
    if (!this.options.policyGateway) return;

    for (const step of plan.steps) {
      const decision = await this.options.policyGateway.evaluate({
        traceId: request.operationId,
        operationType: "TOOL",
        resourceId: step.action,
        agentId: request.agentId,
        action: step.action,
        input: step.input,
        metadata: { stepId: step.id, order: step.order },
      });

      if (!decision.allowed) {
        throw new PolicyDeniedError(
          decision.policyId,
          step.id,
          `Policy '${decision.policyId}' denied planned step action '${step.action}': ${decision.reason ?? "Action unauthorized"}`
        );
      }
    }
  }
}
