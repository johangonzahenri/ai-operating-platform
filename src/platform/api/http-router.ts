import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PlatformService } from "./platform-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, "../web");

export function createHttpServer(service: PlatformService): http.Server {
  return http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };

    const sendError = (statusCode: number, message: string) => {
      sendJson(statusCode, { error: message, status: statusCode });
    };

    const readJsonBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
          if (body.length > 1e6) {
            req.destroy();
            reject(new Error("Payload too large"));
          }
        });
        req.on("end", () => {
          if (!body.trim()) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error("Invalid JSON body"));
          }
        });
        req.on("error", reject);
      });
    };

    try {
      // 1. API Endpoints
      if (pathname.startsWith("/api/")) {
        // GET /api/status
        if (pathname === "/api/status" && req.method === "GET") {
          sendJson(200, service.getStatus());
          return;
        }

        // GET /api/tools
        if (pathname === "/api/tools" && req.method === "GET") {
          sendJson(200, service.listTools());
          return;
        }

        // GET /api/metrics
        if (pathname === "/api/metrics" && req.method === "GET") {
          sendJson(200, service.getMetrics());
          return;
        }

        // GET /api/audit
        if (pathname === "/api/audit" && req.method === "GET") {
          sendJson(200, service.getAuditLogs());
          return;
        }

        // GET /api/tasks
        if (pathname === "/api/tasks" && req.method === "GET") {
          sendJson(200, service.getTasks());
          return;
        }

        // POST /api/tasks
        if (pathname === "/api/tasks" && req.method === "POST") {
          const body = await readJsonBody();
          if (!body.agentId || !body.input) {
            sendError(400, "Missing agentId or input in request body");
            return;
          }
          const result = await service.submitTask(body.agentId, body.input, body.traceId);
          sendJson(201, result);
          return;
        }

        // GET /api/tasks/:id
        const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
        if (taskMatch && req.method === "GET") {
          const task = service.getTask(taskMatch[1]);
          if (!task) {
            sendError(404, "Task not found");
            return;
          }
          sendJson(200, task);
          return;
        }

        // GET /api/executions
        if (pathname === "/api/executions" && req.method === "GET") {
          sendJson(200, service.getExecutions());
          return;
        }

        // GET /api/executions/:id/timeline
        const timelineMatch = pathname.match(/^\/api\/executions\/([^/]+)\/timeline$/);
        if (timelineMatch && req.method === "GET") {
          const timeline = service.getExecutionTimeline(timelineMatch[1]);
          sendJson(200, timeline);
          return;
        }

        // GET /api/executions/:id
        const execMatch = pathname.match(/^\/api\/executions\/([^/]+)$/);
        if (execMatch && req.method === "GET") {
          const exec = service.getExecution(execMatch[1]);
          if (!exec) {
            sendError(404, "Execution not found");
            return;
          }
          sendJson(200, exec);
          return;
        }

        // POST /api/orchestrate
        if (pathname === "/api/orchestrate" && req.method === "POST") {
          const body = await readJsonBody();
          if (!body.operations || !Array.isArray(body.operations)) {
            sendError(400, "Request requires 'operations' array");
            return;
          }
          const result = await service.executeOrchestration(body);
          sendJson(200, result);
          return;
        }

        sendError(404, `Endpoint not found: ${req.method} ${pathname}`);
        return;
      }

      // 2. Static Web UI Files
      let filePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      const safePath = path.normalize(path.join(WEB_DIR, filePath));

      if (!safePath.startsWith(WEB_DIR)) {
        sendError(403, "Forbidden");
        return;
      }

      if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const contentTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
        };
        const contentType = contentTypes[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(safePath).pipe(res);
        return;
      }

      // Fallback for SPA navigation: serve index.html
      const indexPath = path.join(WEB_DIR, "index.html");
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }

      sendError(404, "File not found");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Internal Server Error";
      sendError(500, msg);
    }
  });
}
