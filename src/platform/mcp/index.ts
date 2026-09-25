/**
 * AI Operating Platform - Enterprise MCP Server Factory & Module Entrypoint
 */

export * from "./mcp-dto.js";
export * from "./mcp-error-mapper.js";
export * from "./platform-mcp-server.js";
export * from "./mcp-transports.js";

import { PlatformMcpServer, McpServerDependencies } from "./platform-mcp-server.js";

/**
 * Canonical factory function to create a fully configured PlatformMcpServer.
 */
export function createPlatformMcpServer(deps: McpServerDependencies): PlatformMcpServer {
  return new PlatformMcpServer(deps);
}
