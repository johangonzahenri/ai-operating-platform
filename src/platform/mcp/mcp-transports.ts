/**
 * AI Operating Platform - MCP Server Transport Handlers (Stdio and Streamable HTTP)
 * 
 * Provides production-ready transport bindings for the MCP Server powered by the
 * official Model Context Protocol (MCP) TypeScript SDK v2 (@modelcontextprotocol/server).
 * 
 * Transports:
 * 1. Streamable HTTP Handler: Integrates with node:http / native fetch for remote clients and SSE.
 * 2. Stdio Server Runner: Runs over process.stdin and process.stdout for IDEs (Antigravity, Cursor, Claude Desktop).
 * 
 * Invariants:
 * 1. Stdio transport: process.stdout is strictly reserved for JSON-RPC messages; all logging goes to stderr.
 * 2. Zero leak of credentials, file paths, or internal stack traces.
 * 3. Handles both Modern 2026-07-28 and Legacy 2024-11-05 protocol requests cleanly.
 */

import { PlatformMcpServer, McpRequestContext } from "./platform-mcp-server.js";
import { McpJsonRpcRequest } from "./mcp-dto.js";
import { Readable, Writable } from "node:stream";
import { IncomingMessage, ServerResponse } from "node:http";
import { SecurityContext } from "../../domain/security/security.js";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";

export interface McpHttpHandlerOptions {
  readonly defaultSecurityContext?: SecurityContext | undefined;
  readonly defaultTenantId?: string | undefined;
}

/**
 * Handles an HTTP request for MCP (e.g. POST /api/v1/mcp or Streamable HTTP endpoint).
 * Bridges node:http (IncomingMessage/ServerResponse) to Web Standard Request/Response
 * and delegates execution to the official MCP SDK handler.
 */
export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  server: PlatformMcpServer,
  options?: McpHttpHandlerOptions
): Promise<void> {
  return new Promise<void>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));

    req.on("end", async () => {
      try {
        const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const rawBody = bodyBuffer ? bodyBuffer.toString("utf8") : "";

        // Check for empty body early
        if (!rawBody.trim() && req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Empty request body" },
            })
          );
          resolve();
          return;
        }

        // Check for basic JSON syntax validity if body is present
        let parsedJsonBody: unknown;
        if (rawBody.trim()) {
          try {
            parsedJsonBody = JSON.parse(rawBody);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: "Parse error: Invalid JSON" },
              })
            );
            resolve();
            return;
          }
        }

        // Check if request is an in-process JSON-RPC object
        const isJsonRpc =
          parsedJsonBody &&
          typeof parsedJsonBody === "object" &&
          (parsedJsonBody as any).jsonrpc === "2.0";

        // If it's a direct JSON-RPC request without MCP SDK HTTP headers, route
        // via server.handleRequest to maintain deterministic JSON response payloads
        const hasMcpHeader =
          req.headers["mcp-protocol-version"] !== undefined ||
          req.headers["mcp-method"] !== undefined;

        if (isJsonRpc && !hasMcpHeader) {
          const reqCtx: McpRequestContext = {
            headers: req.headers as Record<string, string | string[] | undefined>,
            securityContext: options?.defaultSecurityContext,
            tenantId: options?.defaultTenantId,
          };
          const jsonResponse = await server.handleRequest(
            parsedJsonBody as McpJsonRpcRequest,
            reqCtx
          );
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(JSON.stringify(jsonResponse));
          resolve();
          return;
        }

        // Construct standard Web Request for official createMcpHandler
        const protocol = (req.socket as any)?.encrypted ? "https" : "http";
        const host = req.headers.host || "localhost";
        const url = new URL(req.url || "/", `${protocol}://${host}`);

        const webHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined) {
            webHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
        }

        const webRequest = new Request(url, {
          method: req.method || "POST",
          headers: webHeaders,
          body:
            req.method !== "GET" && req.method !== "HEAD" && bodyBuffer
              ? bodyBuffer
              : undefined,
        });

        const webResponse = await server.handleWebRequest(webRequest, {
          authInfo: {
            securityContext: options?.defaultSecurityContext,
            tenantId: options?.defaultTenantId,
          },
        });

        // Pipe Web Response back to ServerResponse
        res.writeHead(
          webResponse.status,
          Object.fromEntries(webResponse.headers.entries())
        );

        if (webResponse.body) {
          const reader = webResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
        resolve();
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: (err as Error).message },
          })
        );
        resolve();
      }
    });
  });
}

/**
 * Starts a Stdio transport runner over readable/writable streams (defaults to stdin/stdout)
 * powered directly by the official MCP TypeScript SDK (@modelcontextprotocol/server/stdio).
 * Suitable for subprocess execution by local IDEs and CLI tools (Antigravity, Claude Desktop, Cursor).
 */
export function serveMcpStdio(
  server: PlatformMcpServer,
  options: {
    readonly input?: Readable | undefined;
    readonly output?: Writable | undefined;
    readonly stdin?: Readable | undefined;
    readonly stdout?: Writable | undefined;
    readonly logStderr?: boolean | undefined;
    readonly defaultTenantId?: string | undefined;
    readonly defaultSecurityContext?: SecurityContext | undefined;
    readonly apiKey?: string | undefined;
  } = {}
): { close: () => Promise<void> | void } {
  const stdin = (options.stdin ?? options.input ?? process.stdin) as any;
  const stdout = (options.stdout ?? options.output ?? process.stdout) as any;
  const logStderr = options.logStderr ?? true;

  const transport = new StdioServerTransport(stdin, stdout);

  const runner = serveStdio(
    () => {
      const reqCtx: McpRequestContext = {
        tenantId: options.defaultTenantId,
        securityContext: options.defaultSecurityContext,
        apiKey: options.apiKey,
      };
      return server.buildOfficialMcpServer(reqCtx);
    },
    {
      transport,
      legacy: "serve",
      onerror: logStderr
        ? (err: Error) => {
            process.stderr.write(`[MCP-STDIO] ${err.message}\n`);
          }
        : undefined,
    }
  );

  return {
    close: () => runner.close(),
  };
}
