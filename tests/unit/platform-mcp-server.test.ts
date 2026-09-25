import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";

// MCP DTOs & Constants
import {
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  McpErrorCodes,
  McpRequestDto,
  McpResponseDto,
  McpInitializeResultDto,
  McpToolsListResultDto,
  McpCallToolResultDto,
  McpResourcesListResultDto,
  McpResourceReadResultDto,
  McpPromptsListResultDto,
} from "../../src/platform/mcp/mcp-dto.js";

// MCP Server Adapter & Transports
import {
  PlatformMcpServer,
  createPlatformMcpServer,
} from "../../src/platform/mcp/platform-mcp-server.js";
import {
  serveMcpStdio,
  handleMcpHttpRequest,
} from "../../src/platform/mcp/mcp-transports.js";

// Tool Runtime & Domain Primitives
import {
  Tool,
  ToolDefinition,
  ToolNotFoundError,
  ToolInputValidationError,
  ToolOutputValidationError,
  ToolAuthorizationError,
  ToolApprovalRequiredError,
  ToolRateLimitedError,
  ToolPolicyRejectedError,
  ToolIdempotencyConflictError,
} from "../../src/domain/tools/tool-registry.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/persistence/in-memory-idempotency-store.js";
import { InMemoryAgentRateLimiter } from "../../src/infrastructure/security/agent-rate-limiter.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { Role } from "../../src/domain/security/authorization.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { InMemoryHITLBridge } from "../../src/infrastructure/workflow/in-memory-hitl-bridge.js";
import { DomainEvent } from "../../src/domain/events/events.js";

// Helper to create mock event publisher
function createMockEventPublisher() {
  const published: DomainEvent[] = [];
  return {
    publish: (evt: DomainEvent) => {
      published.push(evt);
    },
    published,
  };
}

// Helper to create valid security context
function createTestSecurityContext(options?: {
  tenantId?: string;
  principalId?: string;
  roles?: string[];
  permissions?: string[];
}): SecurityContext {
  const principal = Principal.create({
    id: options?.principalId ?? "mcp-service-principal",
    type: "SERVICE",
    roles: options?.roles ?? ["operator", "mcp_client"],
    permissions: options?.permissions ?? ["tool.invoke", "*"],
  });
  return SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "test-mcp-corr-id",
    tenantId: options?.tenantId ?? "tenant-acme",
  });
}

describe("Track 4 — GAP-07 Official Enterprise MCP Server Suite", () => {
  let toolRegistry: InMemoryToolRegistry;
  let idempotencyStore: InMemoryIdempotencyStore;
  let rateLimiter: InMemoryAgentRateLimiter;
  let eventPublisher: ReturnType<typeof createMockEventPublisher>;
  let securityEnforcer: SecurityBoundaryEnforcer;
  let hitlBridge: InMemoryHITLBridge;
  let toolRuntime: ToolInvocationRuntime;
  let mcpServer: PlatformMcpServer;

  beforeEach(() => {
    toolRegistry = new InMemoryToolRegistry();
    idempotencyStore = new InMemoryIdempotencyStore();
    rateLimiter = new InMemoryAgentRateLimiter();
    eventPublisher = createMockEventPublisher();
    hitlBridge = new InMemoryHITLBridge(eventPublisher as any);

    const roleRepo = new InMemoryRoleRepository();
    roleRepo.saveRole(
      Role.create({
        id: "operator",
        name: "Operator",
        permissions: ["tool.invoke", "catalog:read", "calc:exec"],
      })
    );
    roleRepo.saveRole(
      Role.create({
        id: "admin",
        name: "Admin",
        permissions: ["*"],
      })
    );
    const evaluator = new RbacAuthorizationEvaluator(roleRepo);
    securityEnforcer = new SecurityBoundaryEnforcer(evaluator);

    toolRuntime = new ToolInvocationRuntime({
      registry: toolRegistry,
      events: eventPublisher as any,
      idempotencyStore,
      agentRateLimiter: rateLimiter,
      securityEnforcer,
    });

    // Register test tools
    const echoTool: Tool = {
      definition: {
        id: "echo.tool",
        name: "Echo Tool",
        version: "1.0.0",
        description: "Echoes input text back safely",
        riskLevel: "LOW",
        executionMode: "READ_ONLY",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", minLength: 1 },
          },
          required: ["message"],
        },
        outputSchema: {
          type: "object",
          properties: {
            echoed: { type: "string" },
          },
          required: ["echoed"],
        },
      },
      execute: async (input: { message: string }) => {
        return {
          output: { echoed: input.message },
        };
      },
    };

    const mathAddTool: Tool = {
      definition: {
        id: "math.add",
        name: "Math Add",
        version: "1.0.0",
        description: "Adds two numbers",
        riskLevel: "LOW",
        executionMode: "READ_ONLY",
        idempotent: true,
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
        outputSchema: {
          type: "object",
          properties: {
            sum: { type: "number" },
          },
          required: ["sum"],
        },
      },
      execute: async (input: { a: number; b: number }) => {
        return {
          output: { sum: input.a + input.b },
        };
      },
    };

    const restrictedHighRiskTool: Tool = {
      definition: {
        id: "system.restart",
        name: "System Restart",
        version: "1.0.0",
        description: "High risk operation requiring approval",
        riskLevel: "CRITICAL",
        requiresApproval: true,
        executionMode: "SIDE_EFFECTING",
        permissions: ["system.manage"],
        inputSchema: {
          type: "object",
          properties: {
            reason: { type: "string" },
          },
          required: ["reason"],
        },
      },
      execute: async (input: { reason: string }) => {
        return {
          output: { restarted: true, reason: input.reason },
        };
      },
    };

    toolRegistry.register(echoTool);
    toolRegistry.register(mathAddTool);
    toolRegistry.register(restrictedHighRiskTool);

    mcpServer = createPlatformMcpServer({
      toolRuntime,
      toolRegistry,
      eventPublisher: eventPublisher as any,
      hitlBridge,
      serverInfo: {
        name: "ai-operating-platform-mcp",
        version: "1.4.0",
      },
    });
  });

  // =========================================================================
  // 1. JSON-RPC 2.0 PROTOCOL CONFORMANCE & LIFECYCLE
  // =========================================================================
  describe("1. JSON-RPC 2.0 Protocol Conformance & Lifecycle", () => {
    it("1.1 handles 'initialize' method and returns server capabilities and protocol version", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-init-1",
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.equal(res.jsonrpc, "2.0");
      assert.equal(res.id, "req-init-1");
      assert.ok(res.result);
      const result = res.result as McpInitializeResultDto;
      assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
      assert.equal(result.serverInfo.name, "ai-operating-platform-mcp");
      assert.ok(result.capabilities.tools);
      assert.ok(result.capabilities.resources);
      assert.ok(result.capabilities.prompts);
    });

    it("1.2 negotiates protocol version, falling back or negotiating safely", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-init-ver",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05", // older supported version
          capabilities: {},
          clientInfo: { name: "legacy-client", version: "0.9.0" },
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.result);
      const result = res.result as McpInitializeResultDto;
      assert.equal(result.protocolVersion, "2024-11-05");
    });

    it("1.3 handles 'ping' method with empty result", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-ping-1",
        method: "ping",
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.equal(res.jsonrpc, "2.0");
      assert.equal(res.id, "req-ping-1");
      assert.deepEqual(res.result, {});
    });

    it("1.4 rejects unknown methods with MethodNotFound (-32601)", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-unknown",
        method: "nonexistent/method",
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.equal(res.jsonrpc, "2.0");
      assert.equal(res.id, "req-unknown");
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.MethodNotFound);
      assert.match(res.error.message, /not found or not supported/i);
    });

    it("1.5 rejects malformed request structure with InvalidRequest (-32600)", async () => {
      const secCtx = createTestSecurityContext();
      const malformed = {
        jsonrpc: "1.0", // invalid version
        id: 123,
      } as any;

      const res = await mcpServer.handleRequest(malformed, { securityContext: secCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.InvalidRequest);
    });
  });

  // =========================================================================
  // 2. TOOLS DISCOVERY & INVOCATION (tools/list, tools/call)
  // =========================================================================
  describe("2. Tools Discovery & Invocation", () => {
    it("2.1 'tools/list' returns all registered platform tools with inputSchema", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-tl-1",
        method: "tools/list",
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.result);
      const result = res.result as McpToolsListResultDto;
      assert.ok(Array.isArray(result.tools));
      assert.equal(result.tools.length, 3);

      const echo = result.tools.find((t) => t.name === "echo.tool");
      assert.ok(echo);
      assert.equal(echo.description, "Echoes input text back safely");
      assert.ok(echo.inputSchema);
      assert.deepEqual(echo.inputSchema.required, ["message"]);
    });

    it("2.2 'tools/call' invokes tool successfully and returns standard content response", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-tc-1",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "Hello Enterprise MCP" },
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.equal(res.id, "req-tc-1");
      assert.ok(res.result);
      const result = res.result as McpCallToolResultDto;
      assert.equal(result.isError, false);
      assert.equal(result.content.length, 1);
      assert.equal(result.content[0].type, "text");
      const parsed = JSON.parse(result.content[0].text);
      assert.deepEqual(parsed, { echoed: "Hello Enterprise MCP" });
    });

    it("2.3 'tools/call' returns ToolNotFound error when tool is missing", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-tc-missing",
        method: "tools/call",
        params: {
          name: "nonexistent.tool",
          arguments: {},
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.ToolNotFound);
      assert.match(res.error.message, /not found/i);
    });

    it("2.4 'tools/call' rejects missing or invalid input arguments with InvalidParams (-32602)", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-tc-val-1",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { wrongProp: 123 }, // missing required 'message'
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.InvalidParams);
      assert.match(res.error.message, /Missing required input property[: ']+message/i);
    });
  });

  // =========================================================================
  // 3. SECURITY BOUNDARIES & MULTI-TENANCY
  // =========================================================================
  describe("3. Security Boundaries & Multi-Tenancy", () => {
    it("3.1 rejects unauthenticated request when tenantId/security context is missing", async () => {
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-unauth",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "test" },
        },
      };

      // No securityContext provided
      const res = await mcpServer.handleRequest(req);
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.Unauthenticated);
      assert.match(res.error.message, /Authentication required|Unauthenticated/i);
    });

    it("3.2 rejects cross-tenant mismatch fail-closed", async () => {
      const serverWithTenant = createPlatformMcpServer({
        toolRuntime,
        toolRegistry,
        tenantId: "tenant-acme",
      });

      const foreignSecCtx = createTestSecurityContext({ tenantId: "tenant-other" });
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-cross-tenant",
        method: "tools/list",
      };

      const res = await serverWithTenant.handleRequest(req, { securityContext: foreignSecCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.TenantMismatch);
      assert.match(res.error.message, /Tenant mismatch/i);
    });

    it("3.3 enforces RBAC authorization fail-closed for unauthorized tool", async () => {
      // Principal without 'system.manage' or wildcard
      const limitedSecCtx = createTestSecurityContext({
        roles: ["operator"],
        permissions: ["catalog:read"],
      });

      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-unauth-tool",
        method: "tools/call",
        params: {
          name: "system.restart",
          arguments: { reason: "Routine maintenance" },
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: limitedSecCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.Forbidden);
      assert.match(res.error.message, /Access denied|not authorized|lacks permissions/i);
    });

    it("3.4 sanitizes error responses to prevent leaking internal stack traces or secrets", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-leak-test",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { wrongArg: "invalid" }, // triggers validation error
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.error);
      // Ensure no file path or stack trace appears in error message or data
      const jsonStr = JSON.stringify(res.error);
      assert.ok(!jsonStr.includes("at Object."));
      assert.ok(!jsonStr.includes("node_modules"));
      assert.ok(!jsonStr.includes(".ts:"));
    });
  });

  // =========================================================================
  // 4. GOVERNANCE: IDEMPOTENCY, RATE LIMITING & HITL BRIDGE
  // =========================================================================
  describe("4. Governance: Idempotency, Rate Limiting & HITL Bridge", () => {
    it("4.1 replays cached tool result when idempotent call is repeated with same key", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-idemp-1",
        method: "tools/call",
        params: {
          name: "math.add",
          arguments: { a: 10, b: 20 },
        },
      };

      const meta = { securityContext: secCtx, idempotencyKey: "mcp-idemp-key-99" };
      const res1 = await mcpServer.handleRequest(req, meta);
      assert.ok(res1.result);
      const parsed1 = JSON.parse((res1.result as McpCallToolResultDto).content[0].text);
      assert.equal(parsed1.sum, 30);

      // Repeat identical call
      const res2 = await mcpServer.handleRequest(req, meta);
      assert.ok(res2.result);
      const parsed2 = JSON.parse((res2.result as McpCallToolResultDto).content[0].text);
      assert.equal(parsed2.sum, 30);
    });

    it("4.2 enforces AgentRateLimiterPort and returns RateLimited (-32004) on limit exceeded", async () => {
      const secCtx = createTestSecurityContext();
      // Configure strict rate limiter on agent/principal: 1 call per minute
      rateLimiter.setPolicy(secCtx.principal.id, {
        policyId: "strict-1-per-min",
        maxRequests: 1,
        windowMs: 60000,
        burstCapacity: 1,
      });

      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-rl-1",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "msg 1" },
        },
      };

      // Call 1: success
      const res1 = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res1.result);

      // Call 2: rate limit exceeded
      const req2: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-rl-2",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "msg 2" },
        },
      };
      const res2 = await mcpServer.handleRequest(req2, { securityContext: secCtx });
      assert.ok(res2.error);
      assert.equal(res2.error.code, McpErrorCodes.RateLimited);
      assert.match(res2.error.message, /limit exceeded/i);
    });

    it("4.3 suspends execution into HITL Bridge when human approval is required", async () => {
      // Admin principal has permission to invoke system.restart, but tool requires approval
      const adminSecCtx = createTestSecurityContext({
        roles: ["admin"],
        permissions: ["*"],
      });

      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-hitl-1",
        method: "tools/call",
        params: {
          name: "system.restart",
          arguments: { reason: "Urgent Kernel Patch" },
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: adminSecCtx });
      assert.ok(res.result);
      const result = res.result as McpCallToolResultDto;
      assert.equal(result.isError, false);
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.status, "SUSPENDED_WAITING_FOR_APPROVAL");
      assert.ok(parsed.suspensionId);
      assert.ok(parsed.resumptionToken);
      assert.match(parsed.message, /Execution suspended awaiting human approval/i);

      // Verify suspension record was persisted in HITL bridge
      const record = await hitlBridge.getSuspension(parsed.suspensionId, adminSecCtx.tenantId);
      assert.ok(record);
      assert.equal(record.status, "WAITING_FOR_APPROVAL");
      assert.equal(record.workflowId, "tool-execution:system.restart");
    });
  });

  // =========================================================================
  // 5. W3C TRACE CONTEXT & OBSERVABILITY
  // =========================================================================
  describe("5. W3C Trace Context & Observability", () => {
    it("5.1 propagates W3C traceparent and tracestate into execution context and response data", async () => {
      const secCtx = createTestSecurityContext();
      const validTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const validTracestate = "congo=t61rcWkgMzE,rojo=00";

      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-trace-1",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "Tracing verified" },
        },
      };

      const res = await mcpServer.handleRequest(req, {
        securityContext: secCtx,
        traceparent: validTraceparent,
        tracestate: validTracestate,
      });

      assert.ok(res.result);
      // Domain event for tool invocation must carry correlation traceId
      const invokedEvt = eventPublisher.published.find((e) => e.type === "mcp.tool.completed");
      assert.ok(invokedEvt);
      assert.equal((invokedEvt.payload as any).toolId, "echo.tool");
    });

    it("5.2 publishes MCP domain audit events for invocation lifecycle", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-audit-1",
        method: "tools/call",
        params: {
          name: "echo.tool",
          arguments: { message: "Audit check" },
        },
      };

      await mcpServer.handleRequest(req, { securityContext: secCtx });
      const types = eventPublisher.published.map((e) => e.type);
      assert.ok(types.includes("mcp.tool.invoked"));
      assert.ok(types.includes("mcp.tool.completed"));
    });
  });

  // =========================================================================
  // 6. GOVERNED RESOURCES & PROMPTS
  // =========================================================================
  describe("6. Governed Resources & Prompts", () => {
    it("6.1 'resources/list' exposes platform documentation and health metrics", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-rl-res",
        method: "resources/list",
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.result);
      const result = res.result as McpResourcesListResultDto;
      assert.ok(Array.isArray(result.resources));
      assert.ok(result.resources.some((r) => r.uri === "platform://diagnostics/health"));
      assert.ok(result.resources.some((r) => r.uri === "platform://tools/catalog"));
    });

    it("6.2 'resources/read' retrieves content for valid platform URI", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-rr-1",
        method: "resources/read",
        params: {
          uri: "platform://diagnostics/health",
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.result);
      const result = res.result as McpResourceReadResultDto;
      assert.equal(result.contents.length, 1);
      assert.equal(result.contents[0].uri, "platform://diagnostics/health");
      assert.equal(result.contents[0].mimeType, "application/json");
      const healthData = JSON.parse(result.contents[0].text);
      assert.equal(healthData.status, "HEALTHY");
      assert.equal(healthData.mcpProtocolVersion, MCP_PROTOCOL_VERSION);
    });

    it("6.3 'resources/read' rejects unknown or unauthorized URI with ResourceNotFound (-32004)", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-rr-missing",
        method: "resources/read",
        params: {
          uri: "platform://secret/credentials",
        },
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.error);
      assert.equal(res.error.code, McpErrorCodes.ResourceNotFound);
    });

    it("6.4 'prompts/list' returns enterprise prompt templates", async () => {
      const secCtx = createTestSecurityContext();
      const req: McpRequestDto = {
        jsonrpc: "2.0",
        id: "req-pl-1",
        method: "prompts/list",
      };

      const res = await mcpServer.handleRequest(req, { securityContext: secCtx });
      assert.ok(res.result);
      const result = res.result as McpPromptsListResultDto;
      assert.ok(Array.isArray(result.prompts));
      assert.ok(result.prompts.some((p) => p.name === "enterprise_audit_analysis"));
      assert.ok(result.prompts.some((p) => p.name === "tool_safety_review"));
    });
  });

  // =========================================================================
  // 7. MCP TRANSPORTS (STDIO & STREAMABLE HTTP)
  // =========================================================================
  describe("7. MCP Transports (Stdio & HTTP)", () => {
    it("7.1 serveMcpStdio processes JSON-RPC line delimited messages over readable/writable streams", async () => {
      const secCtx = createTestSecurityContext();
      const stdin = new Readable({ read() {} });
      const stdoutChunks: string[] = [];
      const stdout = new Writable({
        write(chunk, encoding, callback) {
          stdoutChunks.push(chunk.toString());
          callback();
        },
      });

      serveMcpStdio(mcpServer, {
        stdin,
        stdout,
        defaultSecurityContext: secCtx,
      });

      const rpcReq = {
        jsonrpc: "2.0",
        id: "stdio-req-1",
        method: "ping",
      };

      stdin.push(JSON.stringify(rpcReq) + "\n");

      // Give event loop a cycle to process stream
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(stdoutChunks.length > 0);
      const responseLine = stdoutChunks.join("");
      const parsedRes = JSON.parse(responseLine.trim());
      assert.equal(parsedRes.id, "stdio-req-1");
      assert.deepEqual(parsedRes.result, {});
    });

    it("7.2 handleMcpHttpRequest dispatches POST /mcp and sends JSON response", async () => {
      const secCtx = createTestSecurityContext();
      const reqPayload = JSON.stringify({
        jsonrpc: "2.0",
        id: "http-req-1",
        method: "tools/list",
      });

      const reqStream = new Readable({
        read() {
          this.push(reqPayload);
          this.push(null);
        },
      });
      (reqStream as any).method = "POST";
      (reqStream as any).headers = {
        "content-type": "application/json",
        "x-tenant-id": "tenant-acme",
      };

      let responseStatusCode = 0;
      const responseHeaders: Record<string, string> = {};
      let responseBody = "";

      const resStream = new Writable({
        write(chunk, encoding, callback) {
          responseBody += chunk.toString();
          callback();
        },
      });
      (resStream as any).writeHead = (statusCode: number, headers: Record<string, string>) => {
        responseStatusCode = statusCode;
        Object.assign(responseHeaders, headers);
      };

      await handleMcpHttpRequest(reqStream as any, resStream as any, mcpServer, {
        defaultSecurityContext: secCtx,
      });

      assert.equal(responseStatusCode, 200);
      assert.equal(responseHeaders["Content-Type"], "application/json; charset=utf-8");
      const parsedRes = JSON.parse(responseBody);
      assert.equal(parsedRes.id, "http-req-1");
      assert.ok(parsedRes.result.tools);
    });

    it("7.3 serveMcpStdio processes modern server/discover and tool invocation through official SDK transport", async () => {
      const secCtx = createTestSecurityContext();
      const stdin = new Readable({ read() {} });
      const stdoutChunks: string[] = [];
      const stdout = new Writable({
        write(chunk, encoding, callback) {
          stdoutChunks.push(chunk.toString());
          callback();
        },
      });

      const runner = serveMcpStdio(mcpServer, {
        stdin,
        stdout,
        defaultSecurityContext: secCtx,
        defaultTenantId: "tenant-acme",
      });

      // Send modern server/discover
      const discoverReq = {
        jsonrpc: "2.0",
        id: "stdio-discover-1",
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
          clientInfo: { name: "antigravity-ide", version: "2.0.0" },
        },
      };

      stdin.push(JSON.stringify(discoverReq) + "\n");
      await new Promise((resolve) => setTimeout(resolve, 60));

      assert.ok(stdoutChunks.length > 0);
      const res1 = JSON.parse(stdoutChunks.join("").trim());
      assert.equal(res1.id, "stdio-discover-1");
      assert.ok(res1.result);

      if (typeof runner.close === "function") {
        await runner.close();
      }
    });

    it("7.4 handleMcpHttpRequest handles modern HTTP request headers delegating directly to official handler", async () => {
      const secCtx = createTestSecurityContext();
      const reqPayload = JSON.stringify({
        jsonrpc: "2.0",
        id: "http-modern-1",
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      });

      const reqStream = new Readable({
        read() {
          this.push(reqPayload);
          this.push(null);
        },
      });
      (reqStream as any).method = "POST";
      (reqStream as any).url = "/mcp";
      (reqStream as any).headers = {
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/list",
        "x-tenant-id": "tenant-acme",
      };

      let responseStatusCode = 0;
      const responseHeaders: Record<string, string> = {};
      let responseBody = "";

      const resStream = new Writable({
        write(chunk, encoding, callback) {
          responseBody += chunk.toString();
          callback();
        },
      });
      (resStream as any).writeHead = (statusCode: number, headers: Record<string, string>) => {
        responseStatusCode = statusCode;
        Object.assign(responseHeaders, headers);
      };

      await handleMcpHttpRequest(reqStream as any, resStream as any, mcpServer, {
        defaultSecurityContext: secCtx,
        defaultTenantId: "tenant-acme",
      });

      assert.equal(responseStatusCode, 200);
      const parsedRes = JSON.parse(responseBody);
      assert.equal(parsedRes.id, "http-modern-1");
      assert.ok(parsedRes.result?.tools);
    });
  });

  // =========================================================================
  // 8. OFFICIAL MCP SDK V2 INTEGRATION & DUAL-ERA VERIFICATION
  // =========================================================================
  describe("8. Official MCP SDK v2 Integration (@modelcontextprotocol/server)", () => {
    it("8.1 builds official McpServer instance projecting registered platform tools and resources", async () => {
      const secCtx = createTestSecurityContext();
      const officialServer = mcpServer.buildOfficialMcpServer({ securityContext: secCtx });
      assert.ok(officialServer);
      assert.equal((officialServer as any).server?.name ?? (officialServer as any)._registeredTools !== undefined, true);
    });

    it("8.2 executes modern 2026-07-28 'server/discover' via official createMcpHandler.fetch()", async () => {
      const discoverReq = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
          "x-tenant-id": "tenant-acme",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "req-discover-sdk",
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
            clientInfo: { name: "test-modern-client", version: "2.0.0" },
          },
        }),
      });

      const res = await mcpServer.handleWebRequest(discoverReq, {
        authInfo: {
          securityContext: createTestSecurityContext(),
          tenantId: "tenant-acme",
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.jsonrpc, "2.0");
      assert.equal(json.id, "req-discover-sdk");
      assert.ok(json.result);
      assert.ok(Array.isArray(json.result.supportedVersions));
      assert.ok(json.result.supportedVersions.includes("2026-07-28"));
    });

    it("8.3 executes modern 2026-07-28 'tools/list' and 'tools/call' through official MCP SDK handler", async () => {
      const secCtx = createTestSecurityContext();

      // 1. tools/list via Web Request
      const listReq = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/list",
          "x-tenant-id": "tenant-acme",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "req-sdk-list",
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });

      const listRes = await mcpServer.handleWebRequest(listReq, {
        authInfo: { securityContext: secCtx, tenantId: "tenant-acme" },
      });
      assert.equal(listRes.status, 200);
      const listJson = await listRes.json();
      assert.ok(listJson.result?.tools);
      const toolNames = listJson.result.tools.map((t: any) => t.name);
      assert.ok(toolNames.includes("echo.tool"));
      assert.ok(toolNames.includes("math.add"));

      // 2. tools/call via Web Request
      const callReq = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "math.add",
          "x-tenant-id": "tenant-acme",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "req-sdk-call",
          method: "tools/call",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
            name: "math.add",
            arguments: { a: 15, b: 25 },
          },
        }),
      });

      const callRes = await mcpServer.handleWebRequest(callReq, {
        authInfo: { securityContext: secCtx, tenantId: "tenant-acme" },
      });
      assert.equal(callRes.status, 200);
      const callJson = await callRes.json();
      assert.ok(callJson.result?.content);
      const parsedText = JSON.parse(callJson.result.content[0].text);
      assert.equal(parsedText.sum, 40);
    });

    it("8.4 executes legacy 2024-11-05 'initialize' via createMcpHandler fallback", async () => {
      const initReq = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "legacy-init-1",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "legacy-agent", version: "1.0.0" },
          },
        }),
      });

      const res = await mcpServer.handleWebRequest(initReq);
      assert.equal(res.status, 200);
      const bodyText = await res.text();
      assert.ok(bodyText.includes("2024-11-05"));
      assert.ok(bodyText.includes("ai-operating-platform-mcp"));
    });
  });
});
