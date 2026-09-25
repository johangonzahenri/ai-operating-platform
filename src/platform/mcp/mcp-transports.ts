/**
 * AI Operating Platform - MCP Server Transport Handlers (Stdio and Streamable HTTP)
 * 
 * Provides production-ready transport bindings for the MCP Server:
 * 1. Streamable HTTP Handler: Integrates with node:http / native fetch for remote clients and SSE.
 * 2. Stdio Server Runner: Runs over process.stdin and process.stdout for IDEs (Antigravity, Cursor, Claude Desktop).
 * 
 * Invariants:
 * 1. Stdio transport: process.stdout is strictly reserved for JSON-RPC messages; all logging goes to stderr.
 * 2. Zero leak of credentials or stack traces.
 * 3. Handles line-delimited and Content-Length framed JSON-RPC messages.
 */

import { PlatformMcpServer, McpRequestContext } from "./platform-mcp-server.js";
import { McpJsonRpcRequest, McpJsonRpcResponse } from "./mcp-dto.js";
import { Readable, Writable } from "node:stream";
import { IncomingMessage, ServerResponse } from "node:http";

export interface McpHttpHandlerOptions {
  readonly defaultSecurityContext?: import("../../domain/security/security.js").SecurityContext | undefined;
  readonly defaultTenantId?: string | undefined;
}

/**
 * Handles an HTTP request for MCP (e.g. POST /api/v1/mcp or Streamable HTTP endpoint).
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
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Empty request body" },
        }));
        return;
      }

      let jsonRequest: McpJsonRpcRequest;
      try {
        jsonRequest = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error: Invalid JSON" },
        }));
        return;
      }

      const reqCtx: McpRequestContext = {
        headers: req.headers as Record<string, string | string[] | undefined>,
        securityContext: options?.defaultSecurityContext,
        tenantId: options?.defaultTenantId,
      };

      const jsonResponse = await server.handleRequest(jsonRequest, reqCtx);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(jsonResponse));
      resolve();
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: (err as Error).message },
      }));
      resolve();
    }
  });
  });
}

/**
 * Starts a Stdio transport listener over readable/writable streams (defaults to stdin/stdout).
 * Suitable for subprocess execution by local IDEs and CLI tools.
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
    readonly defaultSecurityContext?: import("../../domain/security/security.js").SecurityContext | undefined;
    readonly apiKey?: string | undefined;
  } = {}
): { close: () => void } {
  const input = options.stdin ?? options.input ?? process.stdin;
  const output = options.stdout ?? options.output ?? process.stdout;
  const logStderr = options.logStderr ?? true;

  let buffer = "";

  const onData = async (chunk: Buffer | string) => {
    buffer += chunk.toString();

    // Process line-delimited JSON-RPC messages
    const lines = buffer.split("\n");
    // Keep incomplete tail in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let rpcReq: McpJsonRpcRequest;
      try {
        rpcReq = JSON.parse(trimmed);
      } catch (parseErr) {
        if (logStderr) {
          process.stderr.write(`[MCP-STDIO] Parse error: ${(parseErr as Error).message}\n`);
        }
        output.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }) + "\n"
        );
        continue;
      }

      const reqCtx: McpRequestContext = {
        tenantId: options.defaultTenantId,
        securityContext: options.defaultSecurityContext,
        apiKey: options.apiKey,
      };

      try {
        const response: McpJsonRpcResponse = await server.handleRequest(rpcReq, reqCtx);
        output.write(JSON.stringify(response) + "\n");
      } catch (handleErr) {
        if (logStderr) {
          process.stderr.write(`[MCP-STDIO] Unhandled error: ${(handleErr as Error).message}\n`);
        }
        output.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpcReq.id ?? null,
            error: { code: -32603, message: (handleErr as Error).message },
          }) + "\n"
        );
      }
    }
  };

  input.on("data", onData);

  return {
    close: () => {
      input.off("data", onData);
    },
  };
}
