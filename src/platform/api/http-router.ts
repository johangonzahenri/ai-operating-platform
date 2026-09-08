import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PlatformService } from "./platform-service.js";
import { OperationDTO } from "./platform-dto.js";
import {
  AgentAlreadyExistsError,
  AgentInactiveError,
  AgentNotFoundError,
  AgentValidationError,
} from "../../domain/agent/agent.js";
import {
  OperationConflictError,
  OperationNotFoundError,
  OperationValidationError,
} from "../../application/autonomy/autonomous-operation-service.js";
import { AutonomyBudgetValidationError } from "../../domain/autonomy/autonomy-budget.js";
import { AutonomousOperationValidationError } from "../../domain/autonomy/autonomous-operation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, "../web");

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function normalizeId(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return ID_REGEX.test(trimmed) ? trimmed : undefined;
}

type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string };

export function createHttpServer(service: PlatformService): http.Server {
  return http.createServer(async (req, res) => {
    // 1. Secure CORS: strictly restricted to localhost / 127.0.0.1 origins
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        if (
          parsedOrigin.hostname === "localhost" ||
          parsedOrigin.hostname === "127.0.0.1" ||
          parsedOrigin.hostname === "[::1]"
        ) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } catch {
        // Invalid origin URL - do not set header
      }
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Security: Immediate check for directory traversal in raw or decoded URL
    const rawUrl = req.url ?? "/";
    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Bad Request: Malformed URL encoding", status: 400, code: "MALFORMED_URL" }));
      return;
    }

    if (rawUrl.includes("..") || decodedUrl.includes("..")) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Forbidden: Path traversal prohibited", status: 403, code: "PATH_TRAVERSAL" }));
      return;
    }

    const url = new URL(rawUrl, `http://${req.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname;

    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };

    const sendError = (statusCode: number, message: string, code?: string, traceId?: string) => {
      const payload: Record<string, unknown> = {
        error: message,
        status: statusCode,
      };
      if (code) payload.code = code;
      if (traceId) payload.traceId = traceId;
      sendJson(statusCode, payload);
    };

    const readJsonBody = async (): Promise<JsonBodyResult> => {
      // Strict Content-Type validation
      const contentType = req.headers["content-type"];
      if (!contentType) {
        return { ok: false, status: 415, error: "Unsupported Media Type: Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" };
      }
      const ct = contentType.trim().toLowerCase();
      if (ct !== "application/json" && !ct.startsWith("application/json;")) {
        return { ok: false, status: 415, error: "Unsupported Media Type: Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" };
      }

      return new Promise((resolve) => {
        let body = "";
        let tooLarge = false;

        req.on("data", (chunk) => {
          if (tooLarge) return;
          body += chunk.toString();
          if (body.length > 1e6) {
            tooLarge = true;
            resolve({ ok: false, status: 413, error: "Payload Too Large: request body exceeds 1MB limit", code: "PAYLOAD_TOO_LARGE" });
          }
        });

        req.on("end", () => {
          if (tooLarge) return;
          if (!body.trim()) {
            resolve({ ok: true, body: {} });
            return;
          }
          try {
            const parsed = JSON.parse(body);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
              resolve({ ok: false, status: 400, error: "Bad Request: JSON body must be an object", code: "INVALID_JSON" });
              return;
            }
            resolve({ ok: true, body: parsed as Record<string, unknown> });
          } catch {
            resolve({ ok: false, status: 400, error: "Bad Request: Malformed JSON syntax", code: "MALFORMED_JSON" });
          }
        });

        req.on("error", (err) => {
          resolve({ ok: false, status: 400, error: `Bad Request: ${err.message}`, code: "READ_ERROR" });
        });
      });
    };

    try {
      // 1. API Endpoints (Support /api/v1/ and /api/ prefixes)
      const isV1 = pathname.startsWith("/api/v1/");
      const isUnversioned = pathname.startsWith("/api/");
      if (isV1 || isUnversioned) {
        const subPath = isV1
          ? pathname.substring("/api/v1".length)
          : pathname.substring("/api".length);

        // GET /status
        if (subPath === "/status" && req.method === "GET") {
          sendJson(200, service.getStatus());
          return;
        }

        // GET /tools
        if (subPath === "/tools" && req.method === "GET") {
          sendJson(200, service.listTools());
          return;
        }

        // GET /tools/:id
        const toolDetailMatch = subPath.match(/^\/tools\/([^/]+)$/);
        if (toolDetailMatch && req.method === "GET") {
          const id = normalizeId(toolDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid tool ID format", "INVALID_ID");
            return;
          }
          const tool = service.getTool(id);
          if (!tool) {
            sendError(404, "Tool not found", "NOT_FOUND");
            return;
          }
          sendJson(200, tool);
          return;
        }

        // GET /models
        if (subPath === "/models" && req.method === "GET") {
          sendJson(200, service.listModels());
          return;
        }

        // GET /models/:id
        const modelDetailMatch = subPath.match(/^\/models\/([^/]+)$/);
        if (modelDetailMatch && req.method === "GET") {
          const id = normalizeId(modelDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid model ID format", "INVALID_ID");
            return;
          }
          const model = service.getModel(id);
          if (!model) {
            sendError(404, "Model not found", "NOT_FOUND");
            return;
          }
          sendJson(200, model);
          return;
        }

        // GET /agents
        if (subPath === "/agents" && req.method === "GET") {
          sendJson(200, service.listAgents());
          return;
        }

        // POST /agents
        if (subPath === "/agents" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { id: rawId, name, description, model, instructions, tools, memoryScope } = bodyResult.body;
          const id = normalizeId(rawId);
          if (!id) {
            sendError(400, "Bad Request: 'id' is required and must be alphanumeric (1-128 chars)", "INVALID_ID");
            return;
          }
          if (typeof name !== "string" || !name.trim()) {
            sendError(400, "Bad Request: 'name' is required", "INVALID_NAME");
            return;
          }
          if (typeof model !== "string" || !model.trim()) {
            sendError(400, "Bad Request: 'model' is required", "INVALID_MODEL");
            return;
          }
          if (tools !== undefined && !Array.isArray(tools)) {
            sendError(400, "Bad Request: 'tools' if provided must be an array of strings", "INVALID_TOOLS");
            return;
          }

          try {
            const created = service.createAgent({
              id,
              name: name.trim(),
              description: typeof description === "string" ? description.trim() : undefined,
              model: model.trim(),
              instructions: typeof instructions === "string" ? instructions.trim() : undefined,
              tools: Array.isArray(tools) ? tools.map(String) : undefined,
              memoryScope: typeof memoryScope === "string" ? memoryScope.trim() : undefined,
            });
            sendJson(201, created);
            return;
          } catch (err) {
            if (err instanceof AgentAlreadyExistsError) {
              sendError(409, err.message, "AGENT_EXISTS");
              return;
            }
            if (err instanceof AgentValidationError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/activate
        const agentActivateMatch = subPath.match(/^\/agents\/([^/]+)\/activate$/);
        if (agentActivateMatch && req.method === "POST") {
          const id = normalizeId(agentActivateMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          try {
            const updated = service.activateAgent(id);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/deactivate
        const agentDeactivateMatch = subPath.match(/^\/agents\/([^/]+)\/deactivate$/);
        if (agentDeactivateMatch && req.method === "POST") {
          const id = normalizeId(agentDeactivateMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          try {
            const updated = service.deactivateAgent(id);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            throw err;
          }
        }

        // POST /agents/:id/executions
        const agentExecMatch = subPath.match(/^\/agents\/([^/]+)\/executions$/);
        if (agentExecMatch && req.method === "POST") {
          const id = normalizeId(agentExecMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { input, traceId: rawTraceId } = bodyResult.body;
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          try {
            const result = await service.executeAgent(id, input as Record<string, unknown>, traceId);
            sendJson(201, result);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentInactiveError) {
              sendError(400, err.message, "AGENT_INACTIVE");
              return;
            }
            throw err;
          }
        }

        // GET /agents/:id
        const agentDetailMatch = subPath.match(/^\/agents\/([^/]+)$/);
        if (agentDetailMatch && req.method === "GET") {
          const id = normalizeId(agentDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const agent = service.getAgent(id);
          if (!agent) {
            sendError(404, "Agent not found", "AGENT_NOT_FOUND");
            return;
          }
          sendJson(200, agent);
          return;
        }

        // PUT /agents/:id
        if (agentDetailMatch && req.method === "PUT") {
          const id = normalizeId(agentDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid agent ID format", "INVALID_ID");
            return;
          }
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { name, description, model, instructions, tools, memoryScope } = bodyResult.body;
          if (name !== undefined && (typeof name !== "string" || !name.trim())) {
            sendError(400, "Bad Request: 'name' cannot be empty", "INVALID_NAME");
            return;
          }
          if (model !== undefined && (typeof model !== "string" || !model.trim())) {
            sendError(400, "Bad Request: 'model' cannot be empty", "INVALID_MODEL");
            return;
          }
          if (tools !== undefined && !Array.isArray(tools)) {
            sendError(400, "Bad Request: 'tools' must be an array of strings", "INVALID_TOOLS");
            return;
          }

          try {
            const updated = service.updateAgent(id, {
              name: typeof name === "string" ? name.trim() : undefined,
              description: typeof description === "string" ? description.trim() : undefined,
              model: typeof model === "string" ? model.trim() : undefined,
              instructions: typeof instructions === "string" ? instructions.trim() : undefined,
              tools: Array.isArray(tools) ? tools.map(String) : undefined,
              memoryScope: typeof memoryScope === "string" ? memoryScope.trim() : undefined,
            });
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentValidationError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // GET /metrics
        if (subPath === "/metrics" && req.method === "GET") {
          sendJson(200, service.getMetrics());
          return;
        }

        // GET /audit
        if (subPath === "/audit" && req.method === "GET") {
          sendJson(200, service.getAuditLogs());
          return;
        }

        // GET /tasks
        if (subPath === "/tasks" && req.method === "GET") {
          sendJson(200, service.getTasks());
          return;
        }

        // POST /tasks
        if (subPath === "/tasks" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { agentId: rawAgentId, input, traceId: rawTraceId } = bodyResult.body;

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          const result = await service.submitTask(agentId, input as Record<string, unknown>, traceId);
          sendJson(201, result);
          return;
        }

        // GET /tasks/:id
        const taskMatch = subPath.match(/^\/tasks\/([^/]+)$/);
        if (taskMatch && req.method === "GET") {
          const id = normalizeId(taskMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid task ID format", "INVALID_ID");
            return;
          }
          const task = service.getTask(id);
          if (!task) {
            sendError(404, "Task not found", "NOT_FOUND");
            return;
          }
          sendJson(200, task);
          return;
        }

        // GET /executions
        if (subPath === "/executions" && req.method === "GET") {
          sendJson(200, service.getExecutions());
          return;
        }

        // POST /executions (Submit task & execution)
        if (subPath === "/executions" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { agentId: rawAgentId, input, traceId: rawTraceId } = bodyResult.body;

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            sendError(400, "Bad Request: 'input' is required and must be a non-empty object", "INVALID_INPUT");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          const result = await service.submitExecution(agentId, input as Record<string, unknown>, traceId);
          sendJson(201, result);
          return;
        }

        // GET /executions/:id/timeline
        const timelineMatch = subPath.match(/^\/executions\/([^/]+)\/timeline$/);
        if (timelineMatch && req.method === "GET") {
          const id = normalizeId(timelineMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          const timeline = service.getExecutionTimeline(id);
          sendJson(200, timeline);
          return;
        }

        // GET /executions/:id
        const execMatch = subPath.match(/^\/executions\/([^/]+)$/);
        if (execMatch && req.method === "GET") {
          const id = normalizeId(execMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid execution ID format", "INVALID_ID");
            return;
          }
          const exec = service.getExecution(id);
          if (!exec) {
            sendError(404, "Execution not found", "NOT_FOUND");
            return;
          }
          sendJson(200, exec);
          return;
        }

        // POST /orchestrate
        if (subPath === "/orchestrate" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { operations: rawOperations, traceId: rawTraceId } = bodyResult.body;

          if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
            sendError(400, "Bad Request: 'operations' must be a non-empty array", "INVALID_OPERATIONS");
            return;
          }
          if (rawOperations.length > 50) {
            sendError(400, "Bad Request: 'operations' array cannot exceed 50 operations", "OPERATIONS_LIMIT_EXCEEDED");
            return;
          }
          let traceId: string | undefined = undefined;
          if (rawTraceId !== undefined) {
            traceId = normalizeId(rawTraceId);
            if (!traceId) {
              sendError(400, "Bad Request: 'traceId' if provided must be a valid identifier (1-128 chars)", "INVALID_TRACE_ID");
              return;
            }
          }

          // Validate and normalize each operation
          const seenIds = new Set<string>();
          const normalizedOps: OperationDTO[] = [];
          for (let i = 0; i < rawOperations.length; i++) {
            const op = rawOperations[i];
            if (!op || typeof op !== "object" || Array.isArray(op)) {
              sendError(400, `Bad Request: operation at index ${i} must be an object`, "INVALID_OPERATION");
              return;
            }
            const id = normalizeId(op.id);
            if (!id) {
              sendError(400, `Bad Request: operation at index ${i} has invalid or missing 'id'`, "INVALID_OPERATION_ID");
              return;
            }
            if (seenIds.has(id)) {
              sendError(400, `Bad Request: duplicate operation id '${id}'`, "DUPLICATE_OPERATION_ID");
              return;
            }
            seenIds.add(id);

            if (op.kind !== "MODEL" && op.kind !== "TOOL") {
              sendError(400, `Bad Request: operation '${id}' must have kind 'MODEL' or 'TOOL'`, "INVALID_OPERATION_KIND");
              return;
            }
            let toolId: string | undefined = undefined;
            if (op.kind === "TOOL") {
              toolId = normalizeId(op.toolId);
              if (!toolId) {
                sendError(400, `Bad Request: tool operation '${id}' requires a valid 'toolId'`, "MISSING_TOOL_ID");
                return;
              }
            }
            if (!op.input || typeof op.input !== "object" || Array.isArray(op.input)) {
              sendError(400, `Bad Request: operation '${id}' requires an 'input' object`, "INVALID_OPERATION_INPUT");
              return;
            }
            normalizedOps.push({
              kind: op.kind,
              id,
              model: typeof op.model === "string" ? op.model.trim() : undefined,
              toolId,
              input: op.input as Record<string, unknown>,
              bindings: Array.isArray(op.bindings) ? op.bindings : undefined,
            });
          }

          const result = await service.executeOrchestration({ operations: normalizedOps, traceId });
          sendJson(200, result);
          return;
        }

        // GET /operations
        if (subPath === "/operations" && req.method === "GET") {
          sendJson(200, service.listOperations());
          return;
        }

        // POST /operations
        if (subPath === "/operations" && req.method === "POST") {
          const bodyResult = await readJsonBody();
          if (!bodyResult.ok) {
            sendError(bodyResult.status, bodyResult.error, bodyResult.code);
            return;
          }
          const { id: rawId, agentId: rawAgentId, objective: rawObjective, budget: rawBudget, metadata } = bodyResult.body;

          let id: string | undefined = undefined;
          if (rawId !== undefined) {
            id = normalizeId(rawId);
            if (!id) {
              sendError(400, "Bad Request: 'id' if provided must be alphanumeric (1-128 chars)", "INVALID_ID");
              return;
            }
          }

          const agentId = normalizeId(rawAgentId);
          if (!agentId) {
            sendError(400, "Bad Request: 'agentId' is required and must be alphanumeric (1-128 chars)", "INVALID_AGENT_ID");
            return;
          }

          if (typeof rawObjective !== "string" || !rawObjective.trim()) {
            sendError(400, "Bad Request: 'objective' is required and must be a non-empty string", "INVALID_OBJECTIVE");
            return;
          }
          if (rawObjective.length > 4096) {
            sendError(400, "Bad Request: 'objective' cannot exceed 4096 characters", "INVALID_OBJECTIVE");
            return;
          }

          if (!rawBudget || typeof rawBudget !== "object" || Array.isArray(rawBudget)) {
            sendError(400, "Bad Request: 'budget' is required and must be an object", "INVALID_BUDGET");
            return;
          }

          const b = rawBudget as Record<string, unknown>;
          if (typeof b.maxSteps !== "number" || !Number.isInteger(b.maxSteps) || b.maxSteps <= 0) {
            sendError(400, "Bad Request: 'budget.maxSteps' must be a positive integer", "INVALID_BUDGET");
            return;
          }
          if (typeof b.maxDurationMs !== "number" || !Number.isInteger(b.maxDurationMs) || b.maxDurationMs <= 0) {
            sendError(400, "Bad Request: 'budget.maxDurationMs' must be a positive integer", "INVALID_BUDGET");
            return;
          }
          if (typeof b.maxToolCalls !== "number" || !Number.isInteger(b.maxToolCalls) || b.maxToolCalls < 0) {
            sendError(400, "Bad Request: 'budget.maxToolCalls' must be a non-negative integer", "INVALID_BUDGET");
            return;
          }
          if (b.maxTokens !== undefined && (typeof b.maxTokens !== "number" || !Number.isInteger(b.maxTokens) || b.maxTokens < 0)) {
            sendError(400, "Bad Request: 'budget.maxTokens' if provided must be a non-negative integer", "INVALID_BUDGET");
            return;
          }

          const budgetDto = {
            maxSteps: b.maxSteps,
            maxDurationMs: b.maxDurationMs,
            maxToolCalls: b.maxToolCalls,
            maxTokens: typeof b.maxTokens === "number" ? b.maxTokens : undefined,
          };

          try {
            const detail = await service.createOperation({
              id,
              agentId,
              objective: rawObjective.trim(),
              budget: budgetDto,
              metadata: (metadata && typeof metadata === "object" && !Array.isArray(metadata)) ? metadata as Record<string, unknown> : undefined,
            });
            sendJson(201, detail);
            return;
          } catch (err) {
            if (err instanceof AgentNotFoundError) {
              sendError(404, err.message, "AGENT_NOT_FOUND");
              return;
            }
            if (err instanceof AgentInactiveError) {
              sendError(400, err.message, "AGENT_INACTIVE");
              return;
            }
            if (err instanceof OperationConflictError) {
              sendError(409, err.message, "OPERATION_EXISTS");
              return;
            }
            if (
              err instanceof OperationValidationError ||
              err instanceof AutonomyBudgetValidationError ||
              err instanceof AutonomousOperationValidationError
            ) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            throw err;
          }
        }

        // POST /operations/:id/cancel
        const operationCancelMatch = subPath.match(/^\/operations\/([^/]+)\/cancel$/);
        if (operationCancelMatch && req.method === "POST") {
          const id = normalizeId(operationCancelMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid operation ID format", "INVALID_ID");
            return;
          }
          let reason: string | undefined = undefined;
          const contentType = req.headers["content-type"];
          if (contentType) {
            const bodyResult = await readJsonBody();
            if (bodyResult.ok && typeof bodyResult.body.reason === "string") {
              reason = bodyResult.body.reason.trim();
            }
          }
          try {
            const updated = service.cancelOperation(id, reason);
            sendJson(200, updated);
            return;
          } catch (err) {
            if (err instanceof OperationNotFoundError) {
              sendError(404, err.message, "OPERATION_NOT_FOUND");
              return;
            }
            if (err instanceof OperationConflictError) {
              sendError(409, err.message, "OPERATION_CONFLICT");
              return;
            }
            throw err;
          }
        }

        // GET /operations/:id
        const operationDetailMatch = subPath.match(/^\/operations\/([^/]+)$/);
        if (operationDetailMatch && req.method === "GET") {
          const id = normalizeId(operationDetailMatch[1]);
          if (!id) {
            sendError(400, "Bad Request: Invalid operation ID format", "INVALID_ID");
            return;
          }
          const detail = service.getOperationDetail(id);
          if (!detail) {
            sendError(404, "Operation not found", "NOT_FOUND");
            return;
          }
          sendJson(200, detail);
          return;
        }

        sendError(404, `Endpoint not found: ${req.method} ${pathname}`, "ENDPOINT_NOT_FOUND");
        return;
      }

      // 2. Static Web UI Files (Secure path-traversal prevention)
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendError(405, "Method Not Allowed", "METHOD_NOT_ALLOWED");
        return;
      }

      // Sanitize requested file path
      let reqPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      // Resolve safely within WEB_DIR
      const resolvedPath = path.resolve(WEB_DIR, "." + path.normalize("/" + reqPath));
      const relative = path.relative(WEB_DIR, resolvedPath);

      // Path traversal check: must not escape WEB_DIR
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        sendError(403, "Forbidden", "FORBIDDEN");
        return;
      }

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
        };
        const contentType = contentTypes[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(resolvedPath).pipe(res);
        return;
      }

      // SPA Fallback: serve index.html for unknown web paths
      const indexPath = path.join(WEB_DIR, "index.html");
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }

      sendError(404, "File not found", "FILE_NOT_FOUND");
    } catch (error) {
      // Security: do not leak internal stack traces to clients
      console.error("[HTTP 500] Unhandled server error:", error);
      sendError(500, "Internal Server Error", "INTERNAL_SERVER_ERROR");
    }
  });
}
