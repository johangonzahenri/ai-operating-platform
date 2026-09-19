import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import {
  AgentLifecycle,
  AgentLifecycleState,
} from "../../domain/agent/agent-lifecycle.js";
import {
  AgentEvaluation,
  EvaluationType,
  EvaluationVerdict,
} from "../../domain/agent/agent-evaluation.js";
import {
  AgentLifecycleRepositoryPort,
  AgentEvaluationRepositoryPort,
} from "../ports/agent-evaluation-repository-port.js";
import { AgentProfileRepositoryPort } from "../ports/agent-profile-repository-port.js";
import {
  AgentLifecycleNotFoundError,
  AgentEvaluationNotFoundError,
  AgentLifecycleTenantMismatchError,
  AgentLifecycleValidationError,
  SelfGovernanceError,
  AgentSuspendedError,
  AgentRevokedError,
  AgentDeprecatedError,
  AgentNotQualifiedError,
} from "../../domain/agent/agent-lifecycle-errors.js";
import {
  createAgentEvaluationRequestedEvent,
  createAgentEvaluationCompletedEvent,
  createAgentEvaluationExpiredEvent,
  createAgentSuspendedEvent,
  createAgentActivatedEvent,
  createAgentRevokedEvent,
  createAgentDeprecatedEvent,
} from "../../domain/agent/agent-lifecycle-events.js";

export interface AgentLifecycleServiceOptions {
  readonly lifecycleRepository: AgentLifecycleRepositoryPort;
  readonly evaluationRepository: AgentEvaluationRepositoryPort;
  readonly profileRepository: AgentProfileRepositoryPort;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly events?: EventPublisher | undefined;
}

export interface EvaluateAgentParams {
  readonly id?: string | undefined;
  readonly tenantId: string;
  readonly agentId: string;
  readonly evaluatorPrincipalId: string;
  readonly evaluationType: EvaluationType;
  readonly criteriaReference: string;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly verdict?: EvaluationVerdict | undefined;
  readonly evaluatedAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly autoTransitionLifecycle?: boolean | undefined;
}

export interface CompleteEvaluationParams {
  readonly id: string;
  readonly tenantId: string;
  readonly verdict: "PASS" | "FAIL";
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly expectedVersion?: number | undefined;
  readonly autoTransitionLifecycle?: boolean | undefined;
}

export interface TransitionLifecycleParams {
  readonly agentId: string;
  readonly tenantId: string;
  readonly operatorPrincipalId: string;
  readonly reason?: string | undefined;
  readonly expectedVersion?: number | undefined;
}

export interface CheckEligibilityParams {
  readonly agentId: string;
  readonly tenantId: string;
  readonly requiredCapability?: string | undefined;
  readonly requireVerifiedCapability?: boolean | undefined;
  readonly profileVersion?: number | undefined;
  readonly now?: Date | undefined;
}

export interface AgentEligibilityResult {
  readonly eligible: boolean;
  readonly code: string;
  readonly reason: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly lifecycleState?: AgentLifecycleState | undefined;
  readonly profileVersion?: number | undefined;
}

export class AgentLifecycleService {
  private readonly lifecycleRepo: AgentLifecycleRepositoryPort;
  private readonly evalRepo: AgentEvaluationRepositoryPort;
  private readonly profileRepo: AgentProfileRepositoryPort;
  private readonly policyGateway?: PolicyGateway | undefined;
  private readonly events?: EventPublisher | undefined;

  constructor(options: AgentLifecycleServiceOptions) {
    this.lifecycleRepo = options.lifecycleRepository;
    this.evalRepo = options.evaluationRepository;
    this.profileRepo = options.profileRepository;
    this.policyGateway = options.policyGateway;
    this.events = options.events;
  }

  async getOrCreateLifecycle(
    agentId: string,
    tenantId: string,
    initialProfileVersion: number = 1
  ): Promise<AgentLifecycle> {
    const existing = await this.lifecycleRepo.findByAgentId(agentId, tenantId);
    if (existing) {
      if (existing.tenantId !== tenantId) {
        throw new AgentLifecycleTenantMismatchError(
          `Tenant mismatch: expected '${tenantId}', but agent lifecycle belongs to '${existing.tenantId}'`
        );
      }
      return existing;
    }

    const created = AgentLifecycle.create({
      agentId,
      tenantId,
      state: "REGISTERED",
      profileVersion: initialProfileVersion,
    });
    return this.lifecycleRepo.save(created);
  }

  async getLifecycle(agentId: string, tenantId: string): Promise<AgentLifecycle> {
    if (!agentId || !agentId.trim()) {
      throw new AgentLifecycleValidationError("agentId is required");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new AgentLifecycleValidationError("tenantId is required");
    }

    const lifecycle = await this.lifecycleRepo.findByAgentId(agentId, tenantId);
    if (!lifecycle) {
      throw new AgentLifecycleNotFoundError(agentId);
    }
    if (lifecycle.tenantId !== tenantId) {
      throw new AgentLifecycleTenantMismatchError(
        `Cross-tenant access denied for agent '${agentId}'`
      );
    }
    return lifecycle;
  }

  async evaluateAgent(
    params: EvaluateAgentParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentEvaluation> {
    if (!params.tenantId || !params.tenantId.trim()) {
      throw new AgentLifecycleValidationError("tenantId is required");
    }
    if (!params.agentId || !params.agentId.trim()) {
      throw new AgentLifecycleValidationError("agentId is required");
    }
    if (!params.evaluatorPrincipalId || !params.evaluatorPrincipalId.trim()) {
      throw new AgentLifecycleValidationError("evaluatorPrincipalId is required");
    }

    // Segregation of Duties: agent cannot evaluate itself
    if (params.evaluatorPrincipalId.trim().toLowerCase() === params.agentId.trim().toLowerCase()) {
      throw new SelfGovernanceError(params.agentId, "evaluateAgent");
    }

    // Fetch profile to verify tenant and determine current profile version
    const profile = await this.profileRepo.findByAgentId(params.agentId);
    if (!profile) {
      throw new AgentLifecycleValidationError(`Profile for agent '${params.agentId}' not found`);
    }
    if (profile.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Profile tenant '${profile.tenantId}' does not match '${params.tenantId}'`);
    }

    const evaluationId = params.id?.trim() || crypto.randomUUID();
    const evaluation = AgentEvaluation.create({
      id: evaluationId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      evaluatedProfileVersion: profile.version,
      evaluatorPrincipalId: params.evaluatorPrincipalId,
      evaluationType: params.evaluationType,
      verdict: params.verdict ?? "PENDING",
      criteriaReference: params.criteriaReference,
      evidence: params.evidence,
      evaluatedAt: params.evaluatedAt,
      expiresAt: params.expiresAt,
      metadata: params.metadata,
    });

    const saved = await this.evalRepo.save(evaluation);

    if (this.events) {
      this.events.publish(createAgentEvaluationRequestedEvent(saved, traceId));
      if (saved.verdict === "PASS" || saved.verdict === "FAIL") {
        this.events.publish(createAgentEvaluationCompletedEvent(saved, traceId));
      }
    }

    // Lifecycle auto-transition on PASS
    if (saved.verdict === "PASS" && params.autoTransitionLifecycle !== false) {
      let lifecycle = await this.getOrCreateLifecycle(params.agentId, params.tenantId, profile.version);
      if (lifecycle.state === "REGISTERED" || lifecycle.state === "EVALUATION_PENDING") {
        lifecycle = lifecycle.markVerified(saved.id, params.evaluatorPrincipalId);
        await this.lifecycleRepo.save(lifecycle);
      }
    }

    return saved;
  }

  async completeEvaluation(
    params: CompleteEvaluationParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentEvaluation> {
    const evaluation = await this.evalRepo.findById(params.id, params.tenantId);
    if (!evaluation) {
      throw new AgentEvaluationNotFoundError(params.id);
    }
    if (evaluation.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Evaluation belongs to another tenant`);
    }

    const completed = evaluation.complete(params.verdict, params.evidence, params.expectedVersion);
    const saved = await this.evalRepo.save(completed);

    if (this.events) {
      this.events.publish(createAgentEvaluationCompletedEvent(saved, traceId));
    }

    if (saved.verdict === "PASS" && params.autoTransitionLifecycle !== false) {
      let lifecycle = await this.getOrCreateLifecycle(saved.agentId, saved.tenantId, saved.evaluatedProfileVersion);
      if (lifecycle.state === "REGISTERED" || lifecycle.state === "EVALUATION_PENDING") {
        lifecycle = lifecycle.markVerified(saved.id, saved.evaluatorPrincipalId);
        await this.lifecycleRepo.save(lifecycle);
      }
    }

    return saved;
  }

  async activateAgent(
    params: TransitionLifecycleParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentLifecycle> {
    let lifecycle = await this.getOrCreateLifecycle(params.agentId, params.tenantId);
    if (lifecycle.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Cross-tenant activation rejected`);
    }

    lifecycle = lifecycle.activate(params.operatorPrincipalId, params.expectedVersion);
    const saved = await this.lifecycleRepo.save(lifecycle);

    if (this.events) {
      this.events.publish(createAgentActivatedEvent(saved, params.operatorPrincipalId, traceId));
    }
    return saved;
  }

  async suspendAgent(
    params: TransitionLifecycleParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentLifecycle> {
    if (!params.reason || !params.reason.trim()) {
      throw new AgentLifecycleValidationError("reason is required to suspend an agent");
    }

    let lifecycle = await this.getOrCreateLifecycle(params.agentId, params.tenantId);
    if (lifecycle.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Cross-tenant suspension rejected`);
    }

    lifecycle = lifecycle.suspend(params.reason, params.operatorPrincipalId, params.expectedVersion);
    const saved = await this.lifecycleRepo.save(lifecycle);

    if (this.events) {
      this.events.publish(createAgentSuspendedEvent(saved, params.operatorPrincipalId, traceId));
    }
    return saved;
  }

  async revokeAgent(
    params: TransitionLifecycleParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentLifecycle> {
    if (!params.reason || !params.reason.trim()) {
      throw new AgentLifecycleValidationError("reason is required to revoke an agent");
    }

    let lifecycle = await this.getOrCreateLifecycle(params.agentId, params.tenantId);
    if (lifecycle.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Cross-tenant revocation rejected`);
    }

    lifecycle = lifecycle.revoke(params.reason, params.operatorPrincipalId, params.expectedVersion);
    const saved = await this.lifecycleRepo.save(lifecycle);

    if (this.events) {
      this.events.publish(createAgentRevokedEvent(saved, params.operatorPrincipalId, traceId));
    }
    return saved;
  }

  async deprecateAgent(
    params: TransitionLifecycleParams,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentLifecycle> {
    if (!params.reason || !params.reason.trim()) {
      throw new AgentLifecycleValidationError("reason is required to deprecate an agent");
    }

    let lifecycle = await this.getOrCreateLifecycle(params.agentId, params.tenantId);
    if (lifecycle.tenantId !== params.tenantId) {
      throw new AgentLifecycleTenantMismatchError(`Cross-tenant deprecation rejected`);
    }

    lifecycle = lifecycle.deprecate(params.reason, params.operatorPrincipalId, params.expectedVersion);
    const saved = await this.lifecycleRepo.save(lifecycle);

    if (this.events) {
      this.events.publish(createAgentDeprecatedEvent(saved, params.operatorPrincipalId, traceId));
    }
    return saved;
  }

  async checkEligibility(params: CheckEligibilityParams): Promise<AgentEligibilityResult> {
    const { agentId, tenantId, requiredCapability, requireVerifiedCapability, now = new Date() } = params;

    if (!agentId || !agentId.trim()) {
      return {
        eligible: false,
        code: "INVALID_AGENT_ID",
        reason: "agentId is empty or missing",
        agentId: "",
        tenantId,
      };
    }
    if (!tenantId || !tenantId.trim()) {
      return {
        eligible: false,
        code: "INVALID_TENANT_ID",
        reason: "tenantId is empty or missing",
        agentId,
        tenantId: "",
      };
    }

    // 1. Profile Verification
    const profile = await this.profileRepo.findByAgentId(agentId);
    if (!profile) {
      return {
        eligible: false,
        code: "PROFILE_NOT_FOUND",
        reason: `Agent profile for '${agentId}' not found`,
        agentId,
        tenantId,
      };
    }
    if (profile.tenantId !== tenantId) {
      return {
        eligible: false,
        code: "TENANT_MISMATCH",
        reason: `Agent profile belongs to tenant '${profile.tenantId}', but requested '${tenantId}'`,
        agentId,
        tenantId,
      };
    }

    // 2. Lifecycle Verification
    const lifecycle = await this.lifecycleRepo.findByAgentId(agentId, tenantId);
    const lifecycleState: AgentLifecycleState = lifecycle
      ? lifecycle.state
      : (profile.status === "ACTIVE" ? "ACTIVE" : (profile.status === "DEPRECATED" ? "DEPRECATED" : "REGISTERED"));

    if (lifecycleState === "SUSPENDED") {
      return {
        eligible: false,
        code: "AGENT_SUSPENDED",
        reason: `Agent '${agentId}' is suspended: ${lifecycle?.suspendedReason ?? "no reason specified"}`,
        agentId,
        tenantId,
        lifecycleState,
        profileVersion: profile.version,
      };
    }

    if (lifecycleState === "REVOKED") {
      return {
        eligible: false,
        code: "AGENT_REVOKED",
        reason: `Agent '${agentId}' has been revoked: ${lifecycle?.revokedReason ?? "no reason specified"}`,
        agentId,
        tenantId,
        lifecycleState,
        profileVersion: profile.version,
      };
    }

    if (lifecycleState === "DEPRECATED") {
      return {
        eligible: false,
        code: "AGENT_DEPRECATED",
        reason: `Agent '${agentId}' is deprecated and cannot receive new assignments`,
        agentId,
        tenantId,
        lifecycleState,
        profileVersion: profile.version,
      };
    }

    if (lifecycleState !== "ACTIVE") {
      return {
        eligible: false,
        code: "LIFECYCLE_NOT_ACTIVE",
        reason: `Agent '${agentId}' is in '${lifecycleState}' state, required 'ACTIVE'`,
        agentId,
        tenantId,
        lifecycleState,
        profileVersion: profile.version,
      };
    }

    // 3. Capability & Qualification Verification
    if (requiredCapability) {
      const hasCap = profile.hasCapability(requiredCapability, false);
      if (!hasCap) {
        return {
          eligible: false,
          code: "CAPABILITY_MISSING",
          reason: `Agent '${agentId}' does not have capability '${requiredCapability}'`,
          agentId,
          tenantId,
          lifecycleState,
          profileVersion: profile.version,
        };
      }

      if (requireVerifiedCapability) {
        const hasVerifiedInProfile = profile.hasCapability(requiredCapability, true);
        if (!hasVerifiedInProfile) {
          // Check if there is an active PASS evaluation for CAPABILITY_CHECK matching this capability and profile version
          const evals = await this.evalRepo.findByAgentId(agentId, tenantId);
          const matchingCapEval = evals
            .filter((e) => e.evaluationType === "CAPABILITY_CHECK" && (
              e.criteriaReference.toLowerCase().includes(requiredCapability.toLowerCase()) ||
              (e.metadata && typeof e.metadata.capabilityId === "string" && e.metadata.capabilityId === requiredCapability)
            ))
            .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())[0];

          const isQualifiedByEval = matchingCapEval ? matchingCapEval.qualifiesProfile(profile.version, now) : false;

          if (!isQualifiedByEval) {
            return {
              eligible: false,
              code: "CAPABILITY_NOT_QUALIFIED",
              reason: `Agent '${agentId}' capability '${requiredCapability}' is not verified or current evaluation has expired/mismatches profile version ${profile.version}`,
              agentId,
              tenantId,
              lifecycleState,
              profileVersion: profile.version,
            };
          }
        }
      }
    }

    return {
      eligible: true,
      code: "ELIGIBLE",
      reason: "Agent is active, verified, and qualified for operation",
      agentId,
      tenantId,
      lifecycleState,
      profileVersion: profile.version,
    };
  }

  async listEvaluations(
    agentId: string,
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentEvaluation[]> {
    if (!agentId || !agentId.trim()) {
      throw new AgentLifecycleValidationError("agentId is required");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new AgentLifecycleValidationError("tenantId is required");
    }
    return this.evalRepo.findByAgentId(agentId, tenantId, limit, offset);
  }

  async getLatestEvaluation(
    agentId: string,
    evaluationType: EvaluationType,
    tenantId: string
  ): Promise<AgentEvaluation | null> {
    if (!agentId || !agentId.trim()) {
      throw new AgentLifecycleValidationError("agentId is required");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new AgentLifecycleValidationError("tenantId is required");
    }
    return this.evalRepo.findLatestByAgentAndType(agentId, evaluationType, tenantId);
  }

  async expireEvaluations(
    tenantId?: string,
    now: Date = new Date(),
    traceId: string = crypto.randomUUID()
  ): Promise<number> {
    const expiredList = await this.evalRepo.findExpiringBefore(now, tenantId);
    let count = 0;
    for (const evalItem of expiredList) {
      if (evalItem.verdict !== "EXPIRED") {
        const expired = evalItem.expire(undefined, now);
        await this.evalRepo.save(expired);
        count++;
        if (this.events) {
          this.events.publish(createAgentEvaluationExpiredEvent(expired, traceId));
        }
      }
    }
    return count;
  }
}
