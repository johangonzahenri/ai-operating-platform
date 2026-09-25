/**
 * AI Operating Platform - Enterprise MCP Server Adapter
 * 
 * Driving Adapter exposing governed platform capabilities (Tools, Prompts, Resources)
 * via the Official Model Context Protocol (MCP) TypeScript SDK v2 (@modelcontextprotocol/server).
 * 
 * Invariants:
 * 1. Boundary: Driving adapter only. Calls ToolInvocationRuntime, ToolRegistry, HITLBridgePort, etc.
 * 2. Strict Hexagonal Architecture: Zero third-party runtime dependencies in Core/Domain.
 *    The official SDK (@modelcontextprotocol/server) is isolated exclusively to Platform.
 * 3. Security: Authenticates caller via API key / token / context, derives verified SecurityContext.
 * 4. Multi-Era Support: Supports modern revision 2026-07-28 (server/discover) and legacy 2024-11-05 (initialize).
 * 5. Governance: Enforces Rate Limiting, Idempotency, Schema Governance, Taint, SoD, and W3C Trace Context.
 * 6. Fail-Closed: Cross-tenant access, unauthorized tools, or invalid schemas are rejected fail-closed.
 */

import {
  McpServer,
  createMcpHandler,
  LATEST_PROTOCOL_VERSION,
  type Extra,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  JSONRPC_VERSION,
  McpErrorCodes,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpInitializeParams,
  McpInitializeResult,
  McpListToolsResult,
  McpToolDefinitionDto,
  McpCallToolParams,
  McpCallToolResult,
  McpListResourcesResult,
  McpReadResourceParams,
  McpReadResourceResult,
  McpListPromptsResult,
  McpPromptDefinitionDto,
  McpResourceDefinitionDto,
} from "./mcp-dto.js";
import { mapToMcpError } from "./mcp-error-mapper.js";
import { ToolRegistry, ToolDefinition, ToolRequest } from "../../domain/tools/tool-registry.js";
import { ToolInvocationRuntime } from "../../application/tools/tool-invocation-runtime.js";
import { SecurityContext, Principal } from "../../domain/security/security.js";
import { AuthenticationService } from "../../application/security/authentication-service.js";
import { HITLBridgePort } from "../../application/ports/hitl-bridge-port.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { W3CTraceContext } from "../../domain/context/w3c-trace-context.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { randomUUID } from "node:crypto";

export interface McpServerConfig {
  readonly serverName?: string | undefined;
  readonly serverVersion?: string | undefined;
  readonly defaultTenantId?: string | undefined;
  readonly supportedProtocolVersions?: readonly string[] | undefined;
}

export interface McpServerDependencies {
  readonly toolRegistry: ToolRegistry;
  readonly toolRuntime: ToolInvocationRuntime;
  readonly authService?: AuthenticationService | undefined;
  readonly hitlBridge?: HITLBridgePort | undefined;
  readonly eventPublisher?: EventPublisher | undefined;
  readonly config?: McpServerConfig | undefined;
  readonly serverInfo?: { name: string; version: string } | undefined;
  readonly tenantId?: string | undefined;
}

export interface McpRequestContext {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>> | undefined;
  readonly securityContext?: SecurityContext | undefined;
  readonly apiKey?: string | undefined;
  readonly bearerToken?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly traceContext?: W3CTraceContext | undefined;
  readonly traceparent?: string | undefined;
  readonly tracestate?: string | undefined;
  readonly idempotencyKey?: string | undefined;
}

export class PlatformMcpServer {
  private readonly toolRegistry: ToolRegistry;
  private readonly toolRuntime: ToolInvocationRuntime;
  private readonly authService?: AuthenticationService | undefined;
  private readonly hitlBridge?: HITLBridgePort | undefined;
  private readonly eventPublisher?: EventPublisher | undefined;
  private readonly serverName: string;
  private readonly serverVersion: string;
  private readonly defaultTenantId: string;
  private readonly supportedProtocolVersions: readonly string[];
  private negotiatedProtocolVersion: string = MCP_PROTOCOL_VERSION;

  /**
   * Lazily-initialized official MCP Handler from @modelcontextprotocol/server.
   */
  private mcpHandler: ReturnType<typeof createMcpHandler> | null = null;

  constructor(deps: McpServerDependencies) {
    if (!deps.toolRegistry) throw new Error("toolRegistry is required for PlatformMcpServer");
    if (!deps.toolRuntime) throw new Error("toolRuntime is required for PlatformMcpServer");

    this.toolRegistry = deps.toolRegistry;
    this.toolRuntime = deps.toolRuntime;
    this.authService = deps.authService;
    this.hitlBridge = deps.hitlBridge;
    this.eventPublisher = deps.eventPublisher;
    this.serverName = deps.serverInfo?.name ?? deps.config?.serverName ?? "ai-operating-platform-mcp";
    this.serverVersion = deps.serverInfo?.version ?? deps.config?.serverVersion ?? "1.4.0";
    this.defaultTenantId = deps.tenantId ?? deps.config?.defaultTenantId ?? "tenant-default";
    this.supportedProtocolVersions = deps.config?.supportedProtocolVersions ?? MCP_SUPPORTED_PROTOCOL_VERSIONS;
  }

  public getServerName(): string {
    return this.serverName;
  }

  public getServerVersion(): string {
    return this.serverVersion;
  }

  public getDefaultTenantId(): string {
    return this.defaultTenantId;
  }

  /**
   * Builds and configures an official McpServer instance from @modelcontextprotocol/server,
   * projecting platform tools, resources, and prompts with governance bindings.
   */
  public buildOfficialMcpServer(reqCtx: McpRequestContext = {}): McpServer {
    const server = new McpServer({
      name: this.serverName,
      version: this.serverVersion,
    });

    // 1. Register Tools from ToolRegistry
    const secCtx = reqCtx.securityContext;
    const safeDefs = this.toolRegistry.discoverSafeDefinitions(secCtx);

    for (const def of safeDefs) {
      const toolInputZodSchema = this.convertInputSchemaToZodShape(def.inputSchema);

      server.registerTool(
        def.id,
        {
          description: def.description,
          inputSchema: toolInputZodSchema,
        },
        async (args: Record<string, unknown>, extra: Extra) => {
          const traceCtx = this.resolveTraceContext(reqCtx);
          const traceId = traceCtx?.traceId ?? randomUUID().replace(/-/g, "");

          const resolvedSecCtx = await this.resolveSecurityContext(reqCtx, true);
          const callResult = await this.executeToolInvocation(
            def.id,
            args,
            resolvedSecCtx,
            traceId,
            reqCtx
          );

          return {
            content: callResult.content.map((c) => ({
              type: "text" as const,
              text: c.text,
            })),
          };
        }
      );
    }

    // 2. Register Platform Prompts
    this.registerPromptsOnMcpServer(server);

    // 3. Register Platform Resources
    this.registerResourcesOnMcpServer(server, secCtx);

    return server;
  }

  /**
   * Returns or constructs the official Fetch / Streamable HTTP Handler
   * created via createMcpHandler() from @modelcontextprotocol/server.
   */
  public getOfficialHandler(): ReturnType<typeof createMcpHandler> {
    if (!this.mcpHandler) {
      this.mcpHandler = createMcpHandler(
        (context: { era: "modern" | "legacy"; authInfo?: unknown; requestInfo?: Request }) => {
          const reqHeaders: Record<string, string> = {};
          if (context.requestInfo?.headers) {
            for (const [k, v] of context.requestInfo.headers.entries()) {
              reqHeaders[k.toLowerCase()] = v;
            }
          }

          const reqCtx: McpRequestContext = {
            headers: reqHeaders,
            securityContext: (context.authInfo as any)?.securityContext,
            tenantId: (context.authInfo as any)?.tenantId ?? reqHeaders["x-tenant-id"],
            apiKey: (context.authInfo as any)?.apiKey ?? reqHeaders["x-api-key"],
          };

          return this.buildOfficialMcpServer(reqCtx);
        },
        {
          supportedProtocolVersions: this.supportedProtocolVersions as any,
        }
      );
    }
    return this.mcpHandler;
  }

  /**
   * Dispatches an incoming Web Standard Request through the official MCP handler.
   */
  public async handleWebRequest(
    request: Request,
    options?: { authInfo?: unknown }
  ): Promise<Response> {
    const handler = this.getOfficialHandler();
    return handler.fetch(request, options);
  }

  /**
   * Handles an incoming JSON-RPC 2.0 MCP request in-process.
   * Maintains full backward compatibility with in-memory test harnesses and direct JSON-RPC callers,
   * enforcing the identical governance and security pipeline.
   */
  async handleRequest(
    request: McpJsonRpcRequest,
    reqCtx: McpRequestContext = {}
  ): Promise<McpJsonRpcResponse> {
    const id = request?.id !== undefined ? request.id : null;

    // 1. Basic JSON-RPC protocol validation
    if (!request || typeof request !== "object" || request.jsonrpc !== JSONRPC_VERSION) {
      return {
        jsonrpc: JSONRPC_VERSION,
        id,
        error: {
          code: McpErrorCodes.INVALID_REQUEST,
          message: "Invalid JSON-RPC 2.0 request. 'jsonrpc' must be '2.0'",
        },
      };
    }

    if (typeof request.method !== "string" || request.method.trim() === "") {
      return {
        jsonrpc: JSONRPC_VERSION,
        id,
        error: {
          code: McpErrorCodes.METHOD_NOT_FOUND,
          message: "Method must be a non-empty string",
        },
      };
    }

    // 2. Resolve W3C Trace Context
    const traceCtx = this.resolveTraceContext(reqCtx);
    const traceId = traceCtx?.traceId ?? randomUUID().replace(/-/g, "");

    this.emitEvent("mcp.request.received", traceId, request.method, {
      method: request.method,
      id: String(id),
    });

    try {
      // 3. Resolve Security Context (Authentication & Tenant Binding)
      // "initialize", "server/discover", and "ping" can be pre-authenticated or authenticated
      const isPublicMethod =
        request.method === "initialize" ||
        request.method === "server/discover" ||
        request.method === "ping";
      const secCtx = await this.resolveSecurityContext(reqCtx, !isPublicMethod);

      let result: unknown;
      switch (request.method) {
        case "initialize":
          result = await this.handleInitialize(request.params as McpInitializeParams | undefined);
          break;

        case "server/discover":
          result = await this.handleDiscover(request.params as Record<string, unknown> | undefined);
          break;

        case "ping":
          result = {};
          break;

        case "tools/list":
          result = await this.handleListTools(secCtx);
          break;

        case "tools/call":
          result = await this.handleCallTool(request.params as McpCallToolParams | undefined, secCtx, traceId, reqCtx);
          break;

        case "resources/list":
          result = await this.handleListResources(secCtx);
          break;

        case "resources/read":
          result = await this.handleReadResource(request.params as McpReadResourceParams | undefined, secCtx);
          break;

        case "prompts/list":
          result = await this.handleListPrompts(secCtx);
          break;

        default:
          return {
            jsonrpc: JSONRPC_VERSION,
            id,
            error: {
              code: McpErrorCodes.METHOD_NOT_FOUND,
              message: `Method '${request.method}' not found or not supported by AI Operating Platform MCP Server`,
            },
          };
      }

      return {
        jsonrpc: JSONRPC_VERSION,
        id,
        result,
      };
    } catch (err) {
      this.emitEvent("mcp.request.rejected", traceId, request.method, {
        method: request.method,
        id: String(id),
        error: (err as Error).message,
      });

      const mcpError = mapToMcpError(err, traceId);
      return {
        jsonrpc: JSONRPC_VERSION,
        id,
        error: mcpError,
      };
    }
  }

  // =========================================================================
  // Handlers for Standard MCP Methods
  // =========================================================================

  private async handleInitialize(params?: McpInitializeParams): Promise<McpInitializeResult> {
    if (params?.protocolVersion) {
      if (!this.supportedProtocolVersions.includes(params.protocolVersion)) {
        this.negotiatedProtocolVersion = this.supportedProtocolVersions[0] ?? MCP_PROTOCOL_VERSION;
      } else {
        this.negotiatedProtocolVersion = params.protocolVersion;
      }
    }

    return {
      protocolVersion: this.negotiatedProtocolVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
        resources: {
          subscribe: false,
          listChanged: false,
        },
        prompts: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: this.serverName,
        version: this.serverVersion,
        title: "AI Operating Platform Enterprise MCP Server",
      },
      instructions: "Governed Enterprise AI Operating Platform MCP Server. All tool invocations require authentication and are audited.",
    };
  }

  private async handleDiscover(_params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      supportedVersions: this.supportedProtocolVersions,
      serverInfo: {
        name: this.serverName,
        version: this.serverVersion,
        title: "AI Operating Platform Enterprise MCP Server",
      },
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
    };
  }

  private async handleListTools(secCtx?: SecurityContext): Promise<McpListToolsResult> {
    const safeDefs = this.toolRegistry.discoverSafeDefinitions(secCtx);

    const mcpTools: McpToolDefinitionDto[] = safeDefs.map((def: ToolDefinition) => {
      const inputProperties: Record<string, unknown> = {};
      const requiredFields: string[] = [...(def.inputSchema?.required ?? [])];

      for (const [propName, propType] of Object.entries(def.inputSchema?.properties ?? {})) {
        if (typeof propType === "string") {
          inputProperties[propName] = { type: propType };
        } else if (typeof propType === "object" && propType !== null) {
          inputProperties[propName] = propType;
        }
      }

      const inputSchema: Record<string, unknown> = {
        type: "object",
        properties: inputProperties,
        required: requiredFields,
        additionalProperties: def.inputSchema?.additionalProperties ?? false,
      };

      const hints = {
        readOnlyHint: def.executionHints?.readOnlyHint ?? def.readOnlyHint ?? false,
        destructiveHint: def.executionHints?.destructiveHint ?? def.destructiveHint ?? false,
        idempotentHint: def.executionHints?.idempotentHint ?? def.idempotentHint ?? false,
        openWorldHint: def.executionHints?.openWorldHint ?? def.openWorldHint ?? false,
      };

      return {
        name: def.id,
        description: def.description,
        inputSchema,
        outputSchema: (def.outputSchema as Record<string, unknown>) ?? undefined,
        executionHints: hints,
        schemaVersion: def.schemaVersion,
      };
    });

    this.emitEvent("mcp.tool.discovered", randomUUID(), "tools/list", {
      count: mcpTools.length,
      tenantId: secCtx?.tenantId,
      principalId: secCtx?.principal?.id,
    });

    return {
      tools: Object.freeze(mcpTools),
    };
  }

  private async handleCallTool(
    params: McpCallToolParams | undefined,
    secCtx: SecurityContext | undefined,
    traceId: string,
    reqCtx?: McpRequestContext
  ): Promise<McpCallToolResult> {
    if (!params || typeof params.name !== "string" || params.name.trim() === "") {
      throw new Error("Missing or invalid 'name' in tools/call arguments");
    }

    const toolName = params.name.trim();
    const args = params.arguments ?? {};
    return this.executeToolInvocation(toolName, args, secCtx, traceId, reqCtx, params);
  }

  private async executeToolInvocation(
    toolName: string,
    args: Record<string, unknown>,
    secCtx: SecurityContext | undefined,
    traceId: string,
    reqCtx?: McpRequestContext,
    params?: McpCallToolParams
  ): Promise<McpCallToolResult> {
    const tenantId = secCtx?.tenantId ?? this.defaultTenantId;
    const principalId = secCtx?.principal?.id ?? "anonymous";
    const idempotencyKey = params?.idempotencyKey ?? reqCtx?.idempotencyKey;

    const executionContext: ExecutionContext = {
      traceId,
      executionId: `mcp-exec-${randomUUID().slice(0, 8)}`,
      taskId: `mcp-task-${randomUUID().slice(0, 8)}`,
      tenantId,
      principalId,
    };

    const toolRequest: ToolRequest = {
      toolId: toolName,
      version: params?.toolVersion,
      input: args,
      idempotencyKey,
      approvalToken: params?.approvalToken,
    };

    this.emitEvent("mcp.tool.invoked", traceId, toolName, {
      toolId: toolName,
      tenantId,
      principalId,
      idempotencyKey: params?.idempotencyKey,
    });

    try {
      const result = await this.toolRuntime.invokeTool({
        request: toolRequest,
        context: executionContext,
        securityContext: secCtx,
        agentId: principalId,
      });

      this.emitEvent("mcp.tool.completed", traceId, toolName, {
        toolId: toolName,
        tenantId,
        principalId,
        cachedReplay: result.metadata?.cachedReplay,
      });

      const jsonText = JSON.stringify(result.output, null, 2);
      return {
        content: [
          {
            type: "text",
            text: jsonText,
          },
        ],
        structuredContent: result.output,
        metadata: result.metadata,
        isError: false,
      };
    } catch (toolErr) {
      const errObj = (toolErr && typeof toolErr === "object") ? (toolErr as Record<string, unknown>) : {};
      if (
        (errObj.name === "ToolApprovalRequiredError" ||
          errObj.code === "TOOL_APPROVAL_REQUIRED" ||
          (toolErr as Error).message?.includes("requires human approval")) &&
        this.hitlBridge
      ) {
        const suspension = await this.hitlBridge.suspend({
          tenantId,
          applicationId: "mcp-server",
          workflowId: `tool-execution:${toolName}`,
          suspensionType: "APPROVAL",
          reason: (toolErr as Error).message,
          requestedAction: `tools/call:${toolName}`,
          requesterPrincipalId: principalId,
          payload: {
            toolName,
            arguments: args,
          },
          traceId,
        });

        this.emitEvent("mcp.hitl.suspended", traceId, toolName, {
          toolId: toolName,
          suspensionId: suspension.suspensionId,
          tenantId,
          principalId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "SUSPENDED_WAITING_FOR_APPROVAL",
                suspensionId: suspension.suspensionId,
                resumptionToken: suspension.resumptionToken,
                reason: suspension.reason,
                message: "Execution suspended awaiting human approval",
                expiresAt: suspension.expiresAt?.toISOString(),
              }),
            },
          ],
          isError: false,
          metadata: {
            suspensionId: suspension.suspensionId,
            resumptionToken: suspension.resumptionToken,
            hitlRequired: true,
          },
        };
      }

      this.emitEvent("mcp.tool.failed", traceId, toolName, {
        toolId: toolName,
        error: (toolErr as Error).message,
      });

      throw toolErr;
    }
  }

  private async handleListResources(secCtx?: SecurityContext): Promise<McpListResourcesResult> {
    const resources: McpResourceDefinitionDto[] = [
      {
        uri: "platform://diagnostics/health",
        name: "Platform Diagnostics & Health",
        description: "Public health status and capabilities of the AI Operating Platform",
        mimeType: "application/json",
      },
      {
        uri: "platform://tools/catalog",
        name: "Platform Tool Catalog",
        description: "Public metadata catalog of all registered, authorized tools on the platform",
        mimeType: "application/json",
      },
      {
        uri: "platform://catalog/tools",
        name: "Platform Tool Catalog (Alias)",
        description: "Public metadata catalog of all registered, authorized tools on the platform",
        mimeType: "application/json",
      },
      {
        uri: "platform://governance/policies",
        name: "Platform Governance Manifest",
        description: "High-level summary of active platform governance constraints and principles",
        mimeType: "application/json",
      },
    ];

    return {
      resources: Object.freeze(resources),
    };
  }

  private async handleReadResource(
    params: McpReadResourceParams | undefined,
    secCtx?: SecurityContext
  ): Promise<McpReadResourceResult> {
    if (!params?.uri || typeof params.uri !== "string") {
      throw new Error("Missing or invalid 'uri' parameter for resources/read");
    }

    const uri = params.uri.trim();
    if (uri === "platform://diagnostics/health") {
      const healthData = {
        status: "HEALTHY",
        platformVersion: this.serverVersion,
        mcpProtocolVersion: this.negotiatedProtocolVersion,
        timestamp: new Date().toISOString(),
      };
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(healthData, null, 2),
          },
        ],
      };
    }

    if (uri === "platform://tools/catalog" || uri === "platform://catalog/tools") {
      const safeDefs = this.toolRegistry.discoverSafeDefinitions(secCtx);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(safeDefs, null, 2),
          },
        ],
      };
    }

    if (uri === "platform://governance/policies") {
      const policySummary = {
        invariants: [
          "Hexagonal Architecture strictly maintained",
          "Zero third-party runtime dependencies in Core",
          "Separation of Duties (SoD) enforced on all approvals and verifications",
          "Fail-closed authorization and tenant isolation",
          "Evidence Hash Chain and cryptographic sealing",
        ],
        tenantId: secCtx?.tenantId ?? this.defaultTenantId,
      };
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(policySummary, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource '${uri}' not found or access denied`);
  }

  private async handleListPrompts(_secCtx?: SecurityContext): Promise<McpListPromptsResult> {
    const prompts: McpPromptDefinitionDto[] = [
      {
        name: "enterprise_audit_analysis",
        description: "Template to query governed compliance evidence without data leakage",
        arguments: [
          {
            name: "scope",
            description: "Evidence scope (e.g. TENANT, AUDIT_TRAIL, WORKFLOW)",
            required: true,
          },
        ],
      },
      {
        name: "tool_safety_review",
        description: "Template for structured tool safety and blast radius assessment",
        arguments: [
          {
            name: "toolId",
            description: "Unique tool identifier",
            required: true,
          },
        ],
      },
      {
        name: "enterprise_compliance_query",
        description: "Template to query governed compliance evidence without data leakage",
        arguments: [
          {
            name: "scope",
            description: "Evidence scope (e.g. TENANT, AUDIT_TRAIL, WORKFLOW)",
            required: true,
          },
        ],
      },
    ];

    return {
      prompts: Object.freeze(prompts),
    };
  }

  // =========================================================================
  // Official SDK McpServer Registrations
  // =========================================================================

  private registerPromptsOnMcpServer(server: McpServer): void {
    server.registerPrompt(
      "enterprise_audit_analysis",
      {
        description: "Template to query governed compliance evidence without data leakage",
        argsSchema: {
          scope: z.string().describe("Evidence scope (e.g. TENANT, AUDIT_TRAIL, WORKFLOW)"),
        },
      },
      async (args) => {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Please perform a governed compliance audit analysis for scope: ${args.scope}. Ensure fail-closed rules and zero secret leakage.`,
              },
            },
          ],
        };
      }
    );

    server.registerPrompt(
      "tool_safety_review",
      {
        description: "Template for structured tool safety and blast radius assessment",
        argsSchema: {
          toolId: z.string().describe("Unique tool identifier"),
        },
      },
      async (args) => {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Assess tool safety and governance blast radius for tool: ${args.toolId}.`,
              },
            },
          ],
        };
      }
    );
  }

  private registerResourcesOnMcpServer(server: McpServer, secCtx?: SecurityContext): void {
    server.registerResource(
      "platform_diagnostics_health",
      "platform://diagnostics/health",
      {
        description: "Public health status and capabilities of the AI Operating Platform",
        mimeType: "application/json",
      },
      async (uri) => {
        const res = await this.handleReadResource({ uri: uri.href }, secCtx);
        return {
          contents: res.contents.map((c) => ({
            uri: c.uri,
            mimeType: c.mimeType,
            text: c.text,
          })),
        };
      }
    );

    server.registerResource(
      "platform_tools_catalog",
      "platform://tools/catalog",
      {
        description: "Public metadata catalog of all registered, authorized tools on the platform",
        mimeType: "application/json",
      },
      async (uri) => {
        const res = await this.handleReadResource({ uri: uri.href }, secCtx);
        return {
          contents: res.contents.map((c) => ({
            uri: c.uri,
            mimeType: c.mimeType,
            text: c.text,
          })),
        };
      }
    );
  }

  /**
   * Translates a Tool's JSON Schema definition into a Zod raw shape
   * accepted by McpServer.registerTool().
   */
  private convertInputSchemaToZodShape(inputSchema: Record<string, unknown> | undefined): Record<string, z.ZodTypeAny> {
    if (!inputSchema || typeof inputSchema !== "object") {
      return {};
    }

    const properties = (inputSchema.properties ?? {}) as Record<string, unknown>;
    const requiredList = new Set<string>(
      Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : []
    );
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, propDef] of Object.entries(properties)) {
      const isRequired = requiredList.has(key);
      let zodType: z.ZodTypeAny = z.unknown();

      if (typeof propDef === "object" && propDef !== null) {
        const type = (propDef as any).type;
        if (type === "string") {
          zodType = z.string();
        } else if (type === "number" || type === "integer") {
          zodType = z.number();
        } else if (type === "boolean") {
          zodType = z.boolean();
        } else if (type === "array") {
          zodType = z.array(z.unknown());
        } else if (type === "object") {
          zodType = z.record(z.string(), z.unknown());
        }
      } else if (typeof propDef === "string") {
        if (propDef === "string") zodType = z.string();
        else if (propDef === "number") zodType = z.number();
        else if (propDef === "boolean") zodType = z.boolean();
      }

      if (!isRequired) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    }

    return shape;
  }

  // =========================================================================
  // Security & Context Resolution Helpers
  // =========================================================================

  private async resolveSecurityContext(
    reqCtx: McpRequestContext,
    requireAuth: boolean
  ): Promise<SecurityContext | undefined> {
    // 1. Direct SecurityContext passed by caller (e.g. internal router or test harness)
    if (reqCtx.securityContext) {
      if (reqCtx.tenantId && reqCtx.securityContext.tenantId !== reqCtx.tenantId) {
        throw new Error(`Tenant mismatch: authenticated as '${reqCtx.securityContext.tenantId}', but requested '${reqCtx.tenantId}'`);
      }
      if (this.defaultTenantId && this.defaultTenantId !== "tenant-default" && reqCtx.securityContext.tenantId !== this.defaultTenantId) {
        throw new Error(`Tenant mismatch: server bound to '${this.defaultTenantId}', but request tenant is '${reqCtx.securityContext.tenantId}'`);
      }
      return reqCtx.securityContext;
    }

    // 2. Authenticate from headers or tokens if authService is wired
    const apiKey = reqCtx.apiKey ?? this.getHeader(reqCtx.headers, "x-api-key");
    const bearerToken = reqCtx.bearerToken ?? this.extractBearer(reqCtx.headers);

    if (this.authService && (apiKey || bearerToken)) {
      const authResult = apiKey
        ? await this.authService.authenticateApiKey(apiKey)
        : await this.authService.authenticateBearerToken(bearerToken!);

      if (!authResult.authenticated || !authResult.principal) {
        throw new Error(`Authentication failed: ${authResult.reason ?? "Invalid credential"}`);
      }

      const tenantId = authResult.principal.tenantId ?? reqCtx.tenantId ?? this.defaultTenantId;
      if (reqCtx.tenantId && authResult.principal.tenantId && authResult.principal.tenantId !== reqCtx.tenantId) {
        throw new Error(`Tenant mismatch: token is bound to '${authResult.principal.tenantId}', but requested '${reqCtx.tenantId}'`);
      }

      return new SecurityContext({
        principal: authResult.principal,
        tenantId,
      });
    }

    if (requireAuth) {
      // Fail closed when authentication is required
      throw new Error("Authentication required for this MCP operation. Provide 'X-API-Key' or 'Authorization: Bearer <token>'");
    }

    return undefined;
  }

  private resolveTraceContext(reqCtx: McpRequestContext): W3CTraceContext | undefined {
    if (reqCtx.traceContext) return reqCtx.traceContext;
    if (reqCtx.traceparent) {
      return W3CTraceContext.tryParseHeaders({
        traceparent: reqCtx.traceparent,
        tracestate: reqCtx.tracestate,
      });
    }
    if (reqCtx.headers) {
      return W3CTraceContext.tryParseHeaders(reqCtx.headers as Record<string, string | string[] | undefined>);
    }
    return undefined;
  }

  private getHeader(
    headers: Readonly<Record<string, string | string[] | undefined>> | undefined,
    name: string
  ): string | undefined {
    if (!headers) return undefined;
    const val = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(val)) return val[0]?.trim();
    if (typeof val === "string") return val.trim();
    return undefined;
  }

  private extractBearer(
    headers: Readonly<Record<string, string | string[] | undefined>> | undefined
  ): string | undefined {
    const authHeader = this.getHeader(headers, "authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim();
    }
    return undefined;
  }

  private emitEvent(
    type: any,
    traceId: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): void {
    if (this.eventPublisher) {
      this.eventPublisher.publish(event(type, traceId, aggregateId, payload));
    }
  }
}

/**
 * Factory helper function to instantiate a PlatformMcpServer.
 */
export function createPlatformMcpServer(deps: McpServerDependencies): PlatformMcpServer {
  return new PlatformMcpServer(deps);
}
