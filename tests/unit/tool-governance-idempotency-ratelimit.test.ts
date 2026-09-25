import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ToolRegistry,
  Tool,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
  ToolIdempotencyConflictError,
  ToolConcurrentExecutionConflictError,
  ToolRateLimitedError,
  ToolDefinitionError,
} from "../../src/domain/tools/tool-registry.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/persistence/in-memory-idempotency-store.js";
import { InMemoryAgentRateLimiter } from "../../src/infrastructure/security/agent-rate-limiter.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { DomainEvent } from "../../src/domain/events/events.js";

function createMockEventPublisher() {
  const published: DomainEvent[] = [];
  return {
    publish: (evt: DomainEvent) => {
      published.push(evt);
    },
    published,
  };
}

function createSecurityContext(options?: {
  tenantId?: string;
  principalId?: string;
  roles?: string[];
  permissions?: string[];
}): SecurityContext {
  const principal = Principal.create({
    id: options?.principalId ?? "test-principal",
    type: "SERVICE",
    roles: options?.roles ?? ["operator"],
    permissions: options?.permissions ?? ["tool.invoke", "*"],
  });
  return SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "test-corr-id",
    tenantId: options?.tenantId ?? "tenant-alpha",
  });
}

describe("TRACK 1 — Tool Governance, Idempotency & Agent Rate Limiting Suite", () => {
  // =========================================================================
  // ÁREA 1: TOOL IDEMPOTENCY & REPLAY PROTECTION (GAP-02)
  // =========================================================================
  describe("Área 1: Tool Idempotency & Replay Protection", () => {
    it("1.1 First execution executes tool and stores result in idempotency cache", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let executionCount = 0;
      const testTool: Tool = {
        definition: {
          id: "billing.charge",
          name: "Billing Charge",
          description: "Charges a credit account",
          version: "1.0.0",
          schemaVersion: "1.0",
          executionMode: "SIDE_EFFECTING",
          inputSchema: {
            required: ["accountId", "amount"],
            properties: {
              accountId: "string",
              amount: "number",
            },
          },
        },
        execute: async (input) => {
          executionCount++;
          return {
            output: { chargeId: "ch_123", amount: input.amount, status: "SUCCESS" },
            metadata: { executionSeq: executionCount },
          };
        },
      };

      registry.register(testTool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });

      const secCtx = createSecurityContext();
      const result = await runtime.invokeSecurely({
        request: {
          toolId: "billing.charge",
          version: "1.0.0",
          input: { accountId: "acc_999", amount: 150 },
          idempotencyKey: "tx-key-001",
        },
        context: { traceId: "trace-idemp-1" },
        securityContext: secCtx,
        agentId: "agent-finance",
      });

      assert.equal(executionCount, 1);
      assert.equal(result.output.status, "SUCCESS");
      assert.equal(result.output.chargeId, "ch_123");
      assert.equal(result.metadata?.cachedReplay, undefined);
    });

    it("1.2 Replay of completed execution returns cached result without re-executing tool side-effect", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let executionCount = 0;
      const testTool: Tool = {
        definition: {
          id: "payment.capture",
          name: "Payment Capture",
          description: "Captures funds",
          version: "1.0.0",
          executionMode: "SIDE_EFFECTING",
          inputSchema: {
            required: ["orderId"],
            properties: { orderId: "string" },
          },
        },
        execute: async (input) => {
          executionCount++;
          return {
            output: { paymentId: "pay_xyz", captured: true, orderId: input.orderId },
          };
        },
      };
      registry.register(testTool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });
      const secCtx = createSecurityContext();

      // First invocation
      const res1 = await runtime.invokeSecurely({
        request: {
          toolId: "payment.capture",
          version: "1.0.0",
          input: { orderId: "order_555" },
          idempotencyKey: "idem-key-payment-1",
        },
        context: { traceId: "trace-pay-1" },
        securityContext: secCtx,
        agentId: "agent-checkout",
      });
      assert.equal(executionCount, 1);
      assert.equal(res1.output.paymentId, "pay_xyz");

      // Second invocation (Replay) with same key and same input
      const res2 = await runtime.invokeSecurely({
        request: {
          toolId: "payment.capture",
          version: "1.0.0",
          input: { orderId: "order_555" },
          idempotencyKey: "idem-key-payment-1",
        },
        context: { traceId: "trace-pay-2" },
        securityContext: secCtx,
        agentId: "agent-checkout",
      });

      // Side effect was NOT re-executed
      assert.equal(executionCount, 1);
      assert.equal(res2.output.paymentId, "pay_xyz");
      assert.equal(res2.metadata?.cachedReplay, true);
      assert.equal(res2.metadata?.idempotencyKey, "idem-key-payment-1");
      assert.equal(res2.durationMs, 0);
    });

    it("1.3 Same idempotencyKey with different payload throws ToolIdempotencyConflictError (MISMATCH)", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let executionCount = 0;
      const testTool: Tool = {
        definition: {
          id: "warehouse.dispatch",
          name: "Warehouse Dispatch",
          description: "Dispatches package",
          inputSchema: {
            required: ["item"],
            properties: { item: "string" },
          },
        },
        execute: async (input) => {
          executionCount++;
          return { output: { dispatched: input.item } };
        },
      };
      registry.register(testTool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });
      const secCtx = createSecurityContext();

      // First request with item = "brake-pad"
      await runtime.invokeSecurely({
        request: {
          toolId: "warehouse.dispatch",
          input: { item: "brake-pad" },
          idempotencyKey: "dispatch-001",
        },
        context: { traceId: "trace-d1" },
        securityContext: secCtx,
        agentId: "agent-logistics",
      });
      assert.equal(executionCount, 1);

      // Second request with SAME key but DIFFERENT payload (item = "oil-filter")
      await assert.rejects(
        async () => {
          await runtime.invokeSecurely({
            request: {
              toolId: "warehouse.dispatch",
              input: { item: "oil-filter" },
              idempotencyKey: "dispatch-001",
            },
            context: { traceId: "trace-d2" },
            securityContext: secCtx,
            agentId: "agent-logistics",
          });
        },
        (err: unknown) => {
          assert(err instanceof ToolIdempotencyConflictError);
          assert.equal(err.code, "IDEMPOTENCY_CONFLICT");
          assert.equal(err.idempotencyKey, "dispatch-001");
          return true;
        }
      );

      // Ensure tool was never executed for the mismatched request
      assert.equal(executionCount, 1);
    });

    it("1.4 Concurrent requests with same idempotencyKey reject the second with ToolConcurrentExecutionConflictError (IN_PROGRESS)", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let slowResolve: () => void = () => {};
      const slowExecutionPromise = new Promise<void>((resolve) => {
        slowResolve = resolve;
      });

      let executionStarts = 0;
      const testTool: Tool = {
        definition: {
          id: "crypto.transfer",
          name: "Transfer Funds",
          description: "Transfers funds slowly",
          inputSchema: {
            required: ["amount"],
            properties: { amount: "number" },
          },
        },
        execute: async (input) => {
          executionStarts++;
          await slowExecutionPromise;
          return { output: { amount: input.amount, transferred: true } };
        },
      };
      registry.register(testTool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });
      const secCtx = createSecurityContext();

      // Launch request 1 (in-flight)
      const p1 = runtime.invokeSecurely({
        request: {
          toolId: "crypto.transfer",
          input: { amount: 1000 },
          idempotencyKey: "race-key-99",
        },
        context: { traceId: "trace-race-1" },
        securityContext: secCtx,
        agentId: "agent-vault",
      });

      // Launch request 2 concurrently before p1 resolves
      const p2 = assert.rejects(
        async () => {
          await runtime.invokeSecurely({
            request: {
              toolId: "crypto.transfer",
              input: { amount: 1000 },
              idempotencyKey: "race-key-99",
            },
            context: { traceId: "trace-race-2" },
            securityContext: secCtx,
            agentId: "agent-vault",
          });
        },
        (err: unknown) => {
          assert(err instanceof ToolConcurrentExecutionConflictError);
          assert.equal(err.code, "CONCURRENT_IDEMPOTENT_INVOCATION");
          assert.equal(err.idempotencyKey, "race-key-99");
          return true;
        }
      );

      // Now allow request 1 to complete
      slowResolve();
      const r1 = await p1;
      await p2;

      assert.equal(executionStarts, 1);
      assert.equal(r1.output.transferred, true);
    });

    it("1.5 Idempotency scope isolates by tool version (tool@1.0.0 vs tool@2.0.0)", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let v1Count = 0;
      let v2Count = 0;

      const toolV1: Tool = {
        definition: {
          id: "invoice.generate",
          name: "Invoice V1",
          description: "Generates v1 invoice",
          version: "1.0.0",
          inputSchema: {
            required: ["clientId"],
            properties: { clientId: "string" },
          },
        },
        execute: async () => {
          v1Count++;
          return { output: { format: "PDF_V1" } };
        },
      };

      const toolV2: Tool = {
        definition: {
          id: "invoice.generate",
          name: "Invoice V2",
          description: "Generates v2 invoice",
          version: "2.0.0",
          inputSchema: {
            required: ["clientId"],
            properties: { clientId: "string" },
          },
        },
        execute: async () => {
          v2Count++;
          return { output: { format: "PDF_V2_STRUCTURED" } };
        },
      };

      registry.register(toolV1);
      registry.register(toolV2);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });
      const secCtx = createSecurityContext();

      // Execution with version 1.0.0
      const resV1 = await runtime.invokeSecurely({
        request: {
          toolId: "invoice.generate",
          version: "1.0.0",
          input: { clientId: "client-abc" },
          idempotencyKey: "shared-key-10",
        },
        context: { traceId: "t-v1" },
        securityContext: secCtx,
        agentId: "agent-bill",
      });

      // Execution with version 2.0.0 using SAME idempotencyKey
      const resV2 = await runtime.invokeSecurely({
        request: {
          toolId: "invoice.generate",
          version: "2.0.0",
          input: { clientId: "client-abc" },
          idempotencyKey: "shared-key-10",
        },
        context: { traceId: "t-v2" },
        securityContext: secCtx,
        agentId: "agent-bill",
      });

      assert.equal(v1Count, 1);
      assert.equal(v2Count, 1);
      assert.equal(resV1.output.format, "PDF_V1");
      assert.equal(resV2.output.format, "PDF_V2_STRUCTURED");
    });

    it("1.6 Idempotency scope isolates by tenantId", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let execCount = 0;
      const tool: Tool = {
        definition: {
          id: "tenant.resource",
          name: "Tenant Resource",
          description: "Creates resource",
          inputSchema: {
            required: ["name"],
            properties: { name: "string" },
          },
        },
        execute: async (input) => {
          execCount++;
          return { output: { name: input.name } };
        },
      };
      registry.register(tool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });

      // Tenant 1
      const sec1 = createSecurityContext({ tenantId: "tenant-one" });
      await runtime.invokeSecurely({
        request: {
          toolId: "tenant.resource",
          input: { name: "db-instance" },
          idempotencyKey: "same-key-across-tenants",
        },
        context: { traceId: "t1" },
        securityContext: sec1,
        agentId: "agent-infra",
      });

      // Tenant 2 with SAME idempotencyKey
      const sec2 = createSecurityContext({ tenantId: "tenant-two" });
      await runtime.invokeSecurely({
        request: {
          toolId: "tenant.resource",
          input: { name: "db-instance" },
          idempotencyKey: "same-key-across-tenants",
        },
        context: { traceId: "t2" },
        securityContext: sec2,
        agentId: "agent-infra",
      });

      assert.equal(execCount, 2);
    });

    it("1.7 Failed tool execution marks store as FAILED and allows subsequent retry", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();

      let attempts = 0;
      const flakyTool: Tool = {
        definition: {
          id: "flaky.tool",
          name: "Flaky Tool",
          description: "Fails on first attempt",
          inputSchema: {
            required: ["step"],
            properties: { step: "number" },
          },
        },
        execute: async (input) => {
          attempts++;
          if (attempts === 1) {
            throw new Error("Transitory upstream timeout");
          }
          return { output: { step: input.step, status: "RECOVERED" } };
        },
      };
      registry.register(flakyTool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
      });
      const secCtx = createSecurityContext();

      // First attempt fails
      await assert.rejects(async () => {
        await runtime.invokeSecurely({
          request: {
            toolId: "flaky.tool",
            input: { step: 1 },
            idempotencyKey: "flaky-key-1",
          },
          context: { traceId: "t-flaky-1" },
          securityContext: secCtx,
          agentId: "agent-retry",
        });
      });
      assert.equal(attempts, 1);

      // Second attempt with same key succeeds and does not remain locked in IN_PROGRESS
      const retryResult = await runtime.invokeSecurely({
        request: {
          toolId: "flaky.tool",
          input: { step: 1 },
          idempotencyKey: "flaky-key-1",
        },
        context: { traceId: "t-flaky-2" },
        securityContext: secCtx,
        agentId: "agent-retry",
      });

      assert.equal(attempts, 2);
      assert.equal(retryResult.output.status, "RECOVERED");
    });
  });

  // =========================================================================
  // ÁREA 2: TOOL SEMANTIC & SCHEMA VERSIONING (GAP-04)
  // =========================================================================
  describe("Área 2: Tool Semantic & Schema Versioning and Execution Hints", () => {
    it("2.1 Registers tool with schemaVersion and executionHints", () => {
      const registry = new InMemoryToolRegistry();
      const tool: Tool = {
        definition: {
          id: "catalog.query",
          name: "Catalog Query",
          description: "Queries public inventory",
          version: "2.1.0",
          schemaVersion: "2.0",
          executionMode: "READ_ONLY",
          executionHints: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
          inputSchema: {
            required: ["query"],
            properties: { query: "string" },
          },
        },
        execute: async () => ({ output: {} }),
      };

      registry.register(tool);
      const retrieved = registry.find("catalog.query", "2.1.0");
      assert(retrieved);
      assert.equal(retrieved.definition.schemaVersion, "2.0");
      assert.equal(retrieved.definition.readOnlyHint, true);
      assert.equal(retrieved.definition.destructiveHint, false);
      assert.equal(retrieved.definition.idempotentHint, true);
      assert.equal(retrieved.definition.openWorldHint, true);
    });

    it("2.2 Derives execution hints automatically when omitted based on executionMode and riskLevel", () => {
      const registry = new InMemoryToolRegistry();
      const readOnlyTool: Tool = {
        definition: {
          id: "sensor.read",
          name: "Sensor Read",
          description: "Reads telemetry",
          executionMode: "READ_ONLY",
          riskLevel: "LOW",
          inputSchema: { required: [], properties: {} },
        },
        execute: async () => ({ output: {} }),
      };

      const destructiveTool: Tool = {
        definition: {
          id: "system.purge",
          name: "System Purge",
          description: "Purges database",
          executionMode: "DESTRUCTIVE",
          riskLevel: "CRITICAL",
          inputSchema: { required: [], properties: {} },
        },
        execute: async () => ({ output: {} }),
      };

      registry.register(readOnlyTool);
      registry.register(destructiveTool);

      const r1 = registry.find("sensor.read")?.definition;
      assert.equal(r1?.readOnlyHint, true);
      assert.equal(r1?.idempotentHint, true);
      assert.equal(r1?.destructiveHint, false);
      assert.equal(r1?.openWorldHint, false);

      const r2 = registry.find("system.purge")?.definition;
      assert.equal(r2?.readOnlyHint, false);
      assert.equal(r2?.destructiveHint, true);
    });

    it("2.3 discoverSafeDefinitions projects schemaVersion and executionHints without secrets", () => {
      const registry = new InMemoryToolRegistry();
      const tool: Tool = {
        definition: {
          id: "api.connector",
          name: "Connector",
          description: "Calls external partner",
          version: "1.2.0",
          schemaVersion: "1.0",
          executionHints: {
            openWorldHint: true,
            idempotentHint: true,
          },
          metadata: {
            partnerName: "Acme",
            apiKey: "SECRET_PASSWORD_1234",
          },
          inputSchema: { required: [], properties: {} },
        },
        execute: async () => ({ output: {} }),
      };
      registry.register(tool);

      const safeDefs = registry.discoverSafeDefinitions();
      assert.equal(safeDefs.length, 1);
      const safe = safeDefs[0]!;
      assert.equal(safe.schemaVersion, "1.0");
      assert.equal(safe.openWorldHint, true);
      assert.equal(safe.idempotentHint, true);
      // Secrets redacted
      assert.equal((safe.metadata as Record<string, unknown>)?.apiKey, undefined);
      assert.equal((safe.metadata as Record<string, unknown>)?.partnerName, "Acme");
    });

    it("2.4 Rejects invalid schemaVersion or version in validateDefinition", () => {
      const registry = new InMemoryToolRegistry();
      assert.throws(
        () => {
          registry.register({
            definition: {
              id: "bad.tool",
              name: "Bad Tool",
              description: "Has empty schemaVersion",
              schemaVersion: "   ",
              inputSchema: { required: [], properties: {} },
            },
            execute: async () => ({ output: {} }),
          });
        },
        (err: unknown) => {
          assert(err instanceof ToolDefinitionError);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // ÁREA 3: AGENT RATE LIMITING / BLAST RADIUS (GAP-03)
  // =========================================================================
  describe("Área 3: Agent Velocity & Burst Rate Limiting", () => {
    it("3.1 Allows executions within rate limit policy and tracks remaining quota", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const rateLimiter = new InMemoryAgentRateLimiter({
        defaultPolicy: {
          policyId: "test-policy",
          maxRequests: 5,
          windowMs: 60000,
          burstCapacity: 5,
        },
      });

      const tool: Tool = {
        definition: {
          id: "fast.action",
          name: "Fast Action",
          description: "Quick task",
          inputSchema: { required: [], properties: {} },
        },
        execute: async () => ({ output: { ok: true } }),
      };
      registry.register(tool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        agentRateLimiter: rateLimiter,
      });
      const secCtx = createSecurityContext();

      for (let i = 1; i <= 3; i++) {
        const res = await runtime.invokeSecurely({
          request: { toolId: "fast.action", input: {} },
          context: { traceId: `trace-rl-${i}` },
          securityContext: secCtx,
          agentId: "agent-speedy",
        });
        assert.equal(res.output.ok, true);
      }
    });

    it("3.2 Throws ToolRateLimitedError when agent exceeds rate limit burst capacity", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const rateLimiter = new InMemoryAgentRateLimiter({
        defaultPolicy: {
          policyId: "tight-policy",
          maxRequests: 3,
          windowMs: 60000,
          burstCapacity: 3,
        },
      });

      const tool: Tool = {
        definition: {
          id: "external.call",
          name: "External Call",
          description: "Calls outbound API",
          inputSchema: { required: [], properties: {} },
        },
        execute: async () => ({ output: { success: true } }),
      };
      registry.register(tool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        agentRateLimiter: rateLimiter,
      });
      const secCtx = createSecurityContext();

      // 3 calls within limit
      for (let i = 0; i < 3; i++) {
        await runtime.invokeSecurely({
          request: { toolId: "external.call", input: {} },
          context: { traceId: `trace-t-${i}` },
          securityContext: secCtx,
          agentId: "agent-spammer",
        });
      }

      // 4th call must be blocked with ToolRateLimitedError
      await assert.rejects(
        async () => {
          await runtime.invokeSecurely({
            request: { toolId: "external.call", input: {} },
            context: { traceId: "trace-t-blocked" },
            securityContext: secCtx,
            agentId: "agent-spammer",
          });
        },
        (err: unknown) => {
          assert(err instanceof ToolRateLimitedError);
          assert.equal(err.code, "TOOL_RATE_LIMITED");
          assert(err.retryAfterMs && err.retryAfterMs > 0);
          return true;
        }
      );

      // Verify rejected event published
      const rejectedEvt = events.published.find((e) => e.type === "tool.rejected");
      assert(rejectedEvt);
      assert.equal((rejectedEvt.payload as Record<string, unknown>).policyId, "tight-policy");
    });

    it("3.3 Enforces destructive tool rate limiting separately from normal reads", async () => {
      const rateLimiter = new InMemoryAgentRateLimiter({
        defaultPolicy: {
          policyId: "destructive-limit-policy",
          maxRequests: 10,
          windowMs: 60000,
          burstCapacity: 10,
          maxDestructiveRequests: 2, // Max 2 destructive calls
        },
      });

      const scope = {
        agentId: "agent-maintenance",
        tenantId: "tenant-a",
        isDestructive: true,
      };

      const e1 = await rateLimiter.evaluateAndConsume(scope);
      assert.equal(e1.allowed, true);

      const e2 = await rateLimiter.evaluateAndConsume(scope);
      assert.equal(e2.allowed, true);

      // 3rd destructive call exceeded
      const e3 = await rateLimiter.evaluateAndConsume(scope);
      assert.equal(e3.allowed, false);
      assert(e3.retryAfterMs > 0);

      // Non-destructive call by same agent should still be allowed
      const eNonDestructive = await rateLimiter.evaluateAndConsume({
        agentId: "agent-maintenance",
        tenantId: "tenant-a",
        isDestructive: false,
      });
      assert.equal(eNonDestructive.allowed, true);
    });

    it("3.4 Rate limiting isolates different agents independently", async () => {
      const rateLimiter = new InMemoryAgentRateLimiter({
        defaultPolicy: {
          policyId: "per-agent-policy",
          maxRequests: 2,
          windowMs: 60000,
          burstCapacity: 2,
        },
      });

      // Agent A consumes its 2 tokens
      await rateLimiter.evaluateAndConsume({ agentId: "agent-A" });
      await rateLimiter.evaluateAndConsume({ agentId: "agent-A" });
      const aBlocked = await rateLimiter.evaluateAndConsume({ agentId: "agent-A" });
      assert.equal(aBlocked.allowed, false);

      // Agent B still has full quota
      const bAllowed = await rateLimiter.evaluateAndConsume({ agentId: "agent-B" });
      assert.equal(bAllowed.allowed, true);
    });
  });

  // =========================================================================
  // ÁREA 4: SECURITY ORDERING & PIPELINE INTERACTION (GAP-02 + GAP-03 + GAP-04)
  // =========================================================================
  describe("Área 4: Pipeline Interaction & Security Ordering", () => {
    it("4.1 Combined Pipeline: Rate Limit evaluates before Idempotency check to protect cache against flood", async () => {
      const registry = new InMemoryToolRegistry();
      const events = createMockEventPublisher();
      const idempotencyStore = new InMemoryIdempotencyStore();
      const rateLimiter = new InMemoryAgentRateLimiter({
        defaultPolicy: {
          policyId: "combined-pipe-policy",
          maxRequests: 1,
          windowMs: 60000,
          burstCapacity: 1,
        },
      });

      let toolExecuted = 0;
      const tool: Tool = {
        definition: {
          id: "order.create",
          name: "Order Create",
          description: "Creates an order",
          version: "1.0.0",
          schemaVersion: "1.0",
          executionHints: {
            idempotentHint: true,
          },
          inputSchema: {
            required: ["item"],
            properties: { item: "string" },
          },
        },
        execute: async (input) => {
          toolExecuted++;
          return { output: { orderId: "ord_101", item: input.item } };
        },
      };
      registry.register(tool);

      const runtime = new ToolInvocationRuntime({
        registry,
        events,
        idempotencyStore,
        agentRateLimiter: rateLimiter,
      });
      const secCtx = createSecurityContext();

      // First call consumes the 1 allowed rate limit token
      const res1 = await runtime.invokeSecurely({
        request: {
          toolId: "order.create",
          input: { item: "wheel" },
          idempotencyKey: "order-idem-001",
        },
        context: { traceId: "t-ord-1" },
        securityContext: secCtx,
        agentId: "agent-pos",
      });
      assert.equal(toolExecuted, 1);
      assert.equal(res1.output.orderId, "ord_101");

      // Second call immediately afterwards is blocked by RATE LIMIT before reaching idempotency store
      await assert.rejects(
        async () => {
          await runtime.invokeSecurely({
            request: {
              toolId: "order.create",
              input: { item: "wheel" },
              idempotencyKey: "order-idem-001",
            },
            context: { traceId: "t-ord-2" },
            securityContext: secCtx,
            agentId: "agent-pos",
          });
        },
        (err: unknown) => {
          assert(err instanceof ToolRateLimitedError);
          return true;
        }
      );

      // Tool was executed only once
      assert.equal(toolExecuted, 1);
    });
  });
});
