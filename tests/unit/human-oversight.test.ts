import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ApprovalRequest,
  ApprovalStatus,
} from "../../src/domain/workflow/approval-request.js";
import {
  ApprovalValidationError,
  ApprovalNotFoundError,
  SelfApprovalError,
  ApprovalExpiredError,
  ApprovalConcurrencyConflictError,
  ApprovalPolicyDeniedError,
  ApprovalTenantMismatchError,
  ApprovalInvalidStateTransitionError,
  UnauthorizedApproverError,
} from "../../src/domain/workflow/approval-errors.js";
import { InMemoryApprovalRequestRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-approval-repository.js";
import { SqliteApprovalRequestRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-approval-repository.js";
import { HumanOversightService } from "../../src/application/workflow/human-oversight-service.js";
import { PolicyGateway, PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { DomainEvent } from "../../src/domain/events/events.js";
import { OrganizationHierarchyRepository } from "../../src/application/ports/organization-repository-port.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";

test("Phase 64: Human Oversight, Approval & Escalation Governance Unit Tests", async (t) => {
  const TENANT_A = "tenant-oversight-a";
  const TENANT_B = "tenant-oversight-b";

  await t.test("ApprovalRequest Aggregate Root", async (t2) => {
    await t2.test("creates a valid ApprovalRequest in REQUESTED status", () => {
      const approval = ApprovalRequest.create({
        id: "appr-01",
        tenantId: TENANT_A,
        workflowId: "wf-def-1",
        workflowInstanceId: "wf-inst-1",
        workflowStepId: "step-sensitive-1",
        requesterPrincipalId: "agent-planner",
        producerPrincipalId: "agent-specialist",
        purpose: "Approve deployment to production cluster",
        requiredRole: "REVIEWER",
      });

      assert.strictEqual(approval.id, "appr-01");
      assert.strictEqual(approval.tenantId, TENANT_A);
      assert.strictEqual(approval.status, "REQUESTED");
      assert.strictEqual(approval.requesterPrincipalId, "agent-planner");
      assert.strictEqual(approval.producerPrincipalId, "agent-specialist");
      assert.strictEqual(approval.requiredRole, "REVIEWER");
      assert.strictEqual(approval.version, 1);
      assert.strictEqual(approval.isPending(), true);
      assert.strictEqual(approval.isApproved(), false);
    });

    await t2.test("rejects invalid inputs on creation", () => {
      assert.throws(() => {
        ApprovalRequest.create({
          id: "",
          tenantId: TENANT_A,
          workflowId: "wf-1",
          workflowInstanceId: "inst-1",
          workflowStepId: "step-1",
          requesterPrincipalId: "req-1",
          purpose: "Purpose",
        });
      }, ApprovalValidationError);

      assert.throws(() => {
        ApprovalRequest.create({
          id: "appr-02",
          tenantId: "",
          workflowId: "wf-1",
          workflowInstanceId: "inst-1",
          workflowStepId: "step-1",
          requesterPrincipalId: "req-1",
          purpose: "Purpose",
        });
      }, ApprovalValidationError);

      assert.throws(() => {
        ApprovalRequest.create({
          id: "appr-02",
          tenantId: TENANT_A,
          workflowId: "wf-1",
          workflowInstanceId: "inst-1",
          workflowStepId: "step-1",
          requesterPrincipalId: "",
          purpose: "Purpose",
        });
      }, ApprovalValidationError);
    });

    await t2.test("transitions lifecycle: REQUESTED -> REVIEWING -> APPROVED", () => {
      const approval = ApprovalRequest.create({
        id: "appr-lifecycle",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-1",
        producerPrincipalId: "agent-2",
        purpose: "Financial disbursement approval",
      });

      const reviewing = approval.startReview("reviewer-human-1");
      assert.strictEqual(reviewing.status, "REVIEWING");
      assert.strictEqual(reviewing.reviewerPrincipalId, "reviewer-human-1");
      assert.strictEqual(reviewing.version, 2);

      const approved = reviewing.approve("approver-lead-1", "Budget verified", { riskTier: "LOW" });
      assert.strictEqual(approved.status, "APPROVED");
      assert.strictEqual(approved.approverPrincipalId, "approver-lead-1");
      assert.strictEqual(approved.decisionReason, "Budget verified");
      assert.strictEqual(approved.isApproved(), true);
      assert.strictEqual(approved.version, 3);
    });

    await t2.test("Invariant: Requester cannot self-approve", () => {
      const approval = ApprovalRequest.create({
        id: "appr-self-req",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-author",
        purpose: "Self verification attempt",
      });

      assert.throws(() => {
        approval.approve("agent-author", "I approve my own request");
      }, SelfApprovalError);
    });

    await t2.test("Invariant: Producer cannot approve output they generated", () => {
      const approval = ApprovalRequest.create({
        id: "appr-self-prod",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "system",
        producerPrincipalId: "agent-generator",
        purpose: "Production validation",
      });

      assert.throws(() => {
        approval.approve("agent-generator", "I approve what I produced");
      }, SelfApprovalError);
    });

    await t2.test("Invariant: Terminal states are monotonic (cannot re-decide APPROVED or REJECTED)", () => {
      const approval = ApprovalRequest.create({
        id: "appr-terminal",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-req",
        purpose: "Test terminal state",
      });

      const approved = approval.approve("approver-1", "Valid");
      assert.throws(() => {
        approved.reject("approver-2", "Too late");
      }, ApprovalInvalidStateTransitionError);

      assert.throws(() => {
        approved.startReview("reviewer-2");
      }, ApprovalInvalidStateTransitionError);

      assert.throws(() => {
        approved.escalate("target-1", "Escalate approved");
      }, ApprovalInvalidStateTransitionError);
    });

    await t2.test("Invariant: Expired request cannot be reviewed or approved", () => {
      const past = new Date(Date.now() - 60000);
      const approval = ApprovalRequest.create({
        id: "appr-expired",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-req",
        purpose: "Time sensitive approval",
        expiresAt: past,
      });

      assert.strictEqual(approval.isExpired(), true);

      assert.throws(() => {
        approval.startReview("reviewer-1");
      }, ApprovalExpiredError);

      assert.throws(() => {
        approval.approve("approver-1", "Late approval");
      }, ApprovalExpiredError);
    });

    await t2.test("supports Escalation and Cancellation", () => {
      const approval = ApprovalRequest.create({
        id: "appr-esc",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-req",
        purpose: "High complexity request",
      });

      const escalated = approval.escalate("director-lead", "Exceeds standard limits");
      assert.strictEqual(escalated.status, "ESCALATED");
      assert.strictEqual(escalated.escalationTarget, "director-lead");

      const approval2 = ApprovalRequest.create({
        id: "appr-cancel",
        tenantId: TENANT_A,
        workflowId: "wf-1",
        workflowInstanceId: "inst-1",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-req",
        purpose: "Job cancelled by user",
      });

      const cancelled = approval2.cancel("No longer needed");
      assert.strictEqual(cancelled.status, "CANCELLED");
      assert.strictEqual(cancelled.decisionReason, "No longer needed");
    });
  });

  await t.test("HumanOversightService Governance & Policies", async (t2) => {
    let approvalRepo: InMemoryApprovalRequestRepository;
    let publishedEvents: DomainEvent[];
    let eventPublisher: InMemoryEventPublisher;
    let service: HumanOversightService;

    class StubPolicyGateway implements PolicyGateway {
      public allow = true;
      async evaluate(context: PolicyContext): Promise<PolicyDecision> {
        if (!this.allow) {
          return { allowed: false, policyId: "policy-deny-all", reason: "Denied by enterprise policy" };
        }
        return { allowed: true, policyId: "policy-allow-all" };
      }
    }

    const stubPolicy = new StubPolicyGateway();

    class StubOrgRepo implements Partial<OrganizationHierarchyRepository> {
      async findMembershipsByAgentId(agentId: string): Promise<readonly AgentMembership[]> {
        if (agentId === "reviewer-agent") {
          return [
            AgentMembership.create({
              id: "mem-1",
              tenantId: TENANT_A,
              organizationId: "org-1",
              teamId: "team-qa",
              agentId: "reviewer-agent",
              role: "REVIEWER",
            }),
          ];
        }
        if (agentId === "operator-agent") {
          return [
            AgentMembership.create({
              id: "mem-2",
              tenantId: TENANT_A,
              organizationId: "org-1",
              teamId: "team-ops",
              agentId: "operator-agent",
              role: "OPERATOR",
            }),
          ];
        }
        return [];
      }
    }

    t2.beforeEach(() => {
      approvalRepo = new InMemoryApprovalRequestRepository();
      publishedEvents = [];
      eventPublisher = new InMemoryEventPublisher();
      eventPublisher.subscribe((e) => publishedEvents.push(e));
      stubPolicy.allow = true;

      service = new HumanOversightService({
        approvalRepository: approvalRepo,
        organizationRepository: new StubOrgRepo() as any,
        policyGateway: stubPolicy,
        events: eventPublisher,
      });
    });

    await t2.test("requestApproval saves record and emits approval.requested event", async () => {
      const approval = await service.requestApproval({
        id: "appr-req-1",
        tenantId: TENANT_A,
        workflowId: "wf-100",
        workflowInstanceId: "inst-100",
        workflowStepId: "step-pay",
        requesterPrincipalId: "billing-agent",
        producerPrincipalId: "payment-worker",
        purpose: "Approve payment of 5000 USD",
        requiredRole: "REVIEWER",
      });

      assert.strictEqual(approval.id, "appr-req-1");
      assert.strictEqual(approval.status, "REQUESTED");

      const found = await service.getApproval("appr-req-1", TENANT_A);
      assert.strictEqual(found.id, "appr-req-1");

      const reqEvents = publishedEvents.filter((e) => e.type === "approval.requested");
      assert.strictEqual(reqEvents.length, 1);
      assert.strictEqual(reqEvents[0]?.aggregateId, "appr-req-1");
    });

    await t2.test("PolicyGateway denial fails closed on request and decision", async () => {
      stubPolicy.allow = false;

      await assert.rejects(async () => {
        await service.requestApproval({
          id: "appr-policy-denied",
          tenantId: TENANT_A,
          workflowId: "wf-100",
          workflowInstanceId: "inst-100",
          workflowStepId: "step-1",
          requesterPrincipalId: "agent-1",
          purpose: "Denied by policy",
        });
      }, ApprovalPolicyDeniedError);

      stubPolicy.allow = true;
      const created = await service.requestApproval({
        id: "appr-to-deny-decision",
        tenantId: TENANT_A,
        workflowId: "wf-100",
        workflowInstanceId: "inst-100",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-1",
        purpose: "Will be denied on approve",
      });

      stubPolicy.allow = false;
      await assert.rejects(async () => {
        await service.approve({
          approvalId: created.id,
          tenantId: TENANT_A,
          approverPrincipalId: "approver-human",
          reason: "Policy should block this",
        });
      }, ApprovalPolicyDeniedError);
    });

    await t2.test("Multi-Tenant Isolation: Cross-tenant access is rejected fail-closed", async () => {
      await service.requestApproval({
        id: "appr-tenant-a",
        tenantId: TENANT_A,
        workflowId: "wf-100",
        workflowInstanceId: "inst-100",
        workflowStepId: "step-1",
        requesterPrincipalId: "agent-1",
        purpose: "Tenant A private approval",
      });

      await assert.rejects(async () => {
        await service.getApproval("appr-tenant-a", TENANT_B);
      }, ApprovalNotFoundError);

      await assert.rejects(async () => {
        await service.approve({
          approvalId: "appr-tenant-a",
          tenantId: TENANT_B,
          approverPrincipalId: "approver-b",
        });
      }, ApprovalNotFoundError);
    });

    await t2.test("Approver Authority: Rejects approver lacking required role", async () => {
      const created = await service.requestApproval({
        id: "appr-role-check",
        tenantId: TENANT_A,
        workflowId: "wf-100",
        workflowInstanceId: "inst-100",
        workflowStepId: "step-1",
        requesterPrincipalId: "system",
        purpose: "Requires REVIEWER role",
        requiredRole: "REVIEWER",
      });

      // operator-agent only has role OPERATOR -> must fail
      await assert.rejects(async () => {
        await service.approve({
          approvalId: created.id,
          tenantId: TENANT_A,
          approverPrincipalId: "operator-agent",
          reason: "I am only an operator",
        });
      }, UnauthorizedApproverError);

      // reviewer-agent has role REVIEWER -> must succeed
      const approved = await service.approve({
        approvalId: created.id,
        tenantId: TENANT_A,
        approverPrincipalId: "reviewer-agent",
        reason: "Reviewed and validated",
      });

      assert.strictEqual(approved.status, "APPROVED");
      assert.strictEqual(approved.approverPrincipalId, "reviewer-agent");
    });

    await t2.test("expirePendingApprovals transitions expired requests and emits events", async () => {
      const past = new Date(Date.now() - 10000);
      await service.requestApproval({
        id: "appr-exp-1",
        tenantId: TENANT_A,
        workflowId: "wf-100",
        workflowInstanceId: "inst-100",
        workflowStepId: "step-1",
        requesterPrincipalId: "system",
        purpose: "Will expire",
        expiresAt: past,
      });

      const expiredList = await service.expirePendingApprovals(TENANT_A);
      assert.strictEqual(expiredList.length, 1);
      assert.strictEqual(expiredList[0]?.id, "appr-exp-1");
      assert.strictEqual(expiredList[0]?.status, "EXPIRED");

      const expEvents = publishedEvents.filter((e) => e.type === "approval.expired");
      assert.strictEqual(expEvents.length, 1);
    });
  });

  await t.test("SqliteApprovalRequestRepository Persistence & OCC", async () => {
    const repo = new SqliteApprovalRequestRepository({ dbPath: ":memory:" });

    const approval = ApprovalRequest.create({
      id: "appr-sqlite-1",
      tenantId: TENANT_A,
      workflowId: "wf-sql-1",
      workflowInstanceId: "inst-sql-1",
      workflowStepId: "step-sql-1",
      taskId: "task-sql-1",
      executionId: "exec-sql-1",
      verificationResultId: "vr-sql-1",
      requesterPrincipalId: "requester-1",
      producerPrincipalId: "producer-1",
      purpose: "Durable SQLite approval persistence",
      requiredAuthority: {
        tenantId: TENANT_A,
        teamId: "team-sql",
        requiredRole: "REVIEWER",
      },
      requiredRole: "REVIEWER",
      expiresAt: new Date(Date.now() + 3600000),
    });

    await repo.save(approval);

    const fetched = await repo.findById("appr-sqlite-1", TENANT_A);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, "appr-sqlite-1");
    assert.strictEqual(fetched.tenantId, TENANT_A);
    assert.strictEqual(fetched.workflowInstanceId, "inst-sql-1");
    assert.strictEqual(fetched.requiredRole, "REVIEWER");
    assert.strictEqual(fetched.requiredAuthority?.teamId, "team-sql");
    assert.strictEqual(fetched.version, 1);

    // Update status to REVIEWING
    const reviewing = fetched.startReview("reviewer-sql");
    await repo.save(reviewing);

    const updated = await repo.findById("appr-sqlite-1", TENANT_A);
    assert.ok(updated);
    assert.strictEqual(updated.status, "REVIEWING");
    assert.strictEqual(updated.reviewerPrincipalId, "reviewer-sql");
    assert.strictEqual(updated.version, 2);

    // Concurrency conflict: saving stale version 1 should reject
    await assert.rejects(async () => {
      const stale = fetched.approve("approver-stale", "Stale save");
      await repo.save(stale);
    }, ApprovalConcurrencyConflictError);
  });
});
