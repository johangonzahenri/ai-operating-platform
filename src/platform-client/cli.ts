#!/usr/bin/env node
/**
 * CLI utility for AI Operating Platform Developer Platform & SDK.
 * Provides command-line access to Platform API operations using PlatformClient.
 */

import { createPlatformClient, PlatformClientOptions } from "./index.js";

interface ParsedArgs {
  readonly command: string;
  readonly subcommand?: string | undefined;
  readonly targetId?: string | undefined;
  readonly options: {
    baseUrl: string;
    apiKey?: string | undefined;
    bearerToken?: string | undefined;
    tenantId?: string | undefined;
    applicationId?: string | undefined;
    timeoutMs?: number | undefined;
    json?: boolean | undefined;
  };
}

function parseArgs(args: string[]): ParsedArgs {
  const options: {
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    tenantId?: string;
    applicationId?: string;
    timeoutMs?: number;
    json?: boolean;
  } = {
    baseUrl: process.env.AOP_BASE_URL ?? "http://127.0.0.1:3000",
    apiKey: process.env.AOP_API_KEY,
    bearerToken: process.env.AOP_BEARER_TOKEN,
    tenantId: process.env.AOP_TENANT_ID,
    applicationId: process.env.AOP_APPLICATION_ID,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--url" && args[i + 1]) {
      options.baseUrl = args[++i]!;
    } else if (arg === "--api-key" && args[i + 1]) {
      options.apiKey = args[++i];
    } else if (arg === "--token" && args[i + 1]) {
      options.bearerToken = args[++i];
    } else if (arg === "--tenant" && args[i + 1]) {
      options.tenantId = args[++i];
    } else if (arg === "--app" && args[i + 1]) {
      options.applicationId = args[++i];
    } else if (arg === "--timeout" && args[i + 1]) {
      options.timeoutMs = parseInt(args[++i]!, 10);
    } else if (arg === "--json") {
      options.json = true;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  return {
    command: positional[0] ?? "help",
    subcommand: positional[1],
    targetId: positional[2],
    options,
  };
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { command, subcommand, targetId, options } = parseArgs(argv);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
AI Operating Platform — Developer CLI

Usage:
  aop-cli <command> [subcommand] [id] [options]

Commands:
  health                     Check platform health and readiness
  info                       Get platform version and metadata
  agents list                List registered AI agents
  agents get <agentId>       Get details for a specific agent
  tasks list                 List platform tasks
  tasks get <taskId>         Get status and output of a specific task
  tasks cancel <taskId>      Cancel an active task
  applications list          List registered satellite applications
  governance export [scope]  Export compliance evidence package

Options:
  --url <url>                Platform base URL (default: http://127.0.0.1:3000 or $AOP_BASE_URL)
  --api-key <key>            API Key for authentication ($AOP_API_KEY)
  --token <jwt>              Bearer JWT token for authentication ($AOP_BEARER_TOKEN)
  --tenant <tenantId>        Tenant ID header ($AOP_TENANT_ID)
  --app <appId>              Application ID header ($AOP_APPLICATION_ID)
  --timeout <ms>             Request timeout in ms (default: 30000)
  --json                     Output raw JSON
`);
    return 0;
  }

  const client = createPlatformClient(options as PlatformClientOptions);

  try {
    let result: unknown;

    switch (command) {
      case "health": {
        result = await client.health();
        break;
      }
      case "info": {
        result = await client.getPlatformInfo();
        break;
      }
      case "agents": {
        if (subcommand === "get" && targetId) {
          result = await client.agents.get(targetId);
        } else {
          result = await client.agents.list();
        }
        break;
      }
      case "tasks": {
        if (subcommand === "get" && targetId) {
          result = await client.tasks.get(targetId);
        } else if (subcommand === "cancel" && targetId) {
          result = await client.tasks.cancel(targetId);
        } else {
          result = await client.tasks.list();
        }
        break;
      }
      case "applications": {
        if (subcommand === "get" && targetId) {
          result = await client.applications.get(targetId);
        } else {
          result = await client.applications.list();
        }
        break;
      }
      case "governance": {
        if (subcommand === "export") {
          const scope = (targetId as any) ?? "AUDIT_TRAIL";
          result = await client.governance.exportEvidence({
            scope,
            format: "JSON",
            fromDate: new Date(Date.now() - 7 * 86400000).toISOString(),
            toDate: new Date().toISOString(),
          });
        } else {
          throw new Error(`Unknown governance subcommand: ${subcommand}`);
        }
        break;
      }
      default: {
        console.error(`[AOP-CLI] Unknown command: ${command}. Use 'aop-cli --help' for usage.`);
        return 1;
      }
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("[AOP-CLI] Result:");
      console.dir(result, { depth: null, colors: true });
    }
    return 0;
  } catch (err: any) {
    console.error(`[AOP-CLI Error] ${err.message}`);
    if (err.code) console.error(`  Code: ${err.code}`);
    if (err.status) console.error(`  HTTP Status: ${err.status}`);
    if (err.requestId) console.error(`  Request ID: ${err.requestId}`);
    return 1;
  }
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith("cli.js")) {
  runCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
