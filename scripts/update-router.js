import fs from "node:fs";

let code = fs.readFileSync("src/platform/api/http-router.ts", "utf8");

const importBlock = `import {
  WorkflowValidationError,
  WorkflowNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowConcurrencyConflictError,
  WorkflowCycleError,
  WorkflowStateTransitionError,
  WorkflowExecutionError,
  NoEligibleAgentFoundError,
} from "../../domain/workflow/workflow-errors.js";\n`;

if (!code.includes("WorkflowValidationError")) {
  code = importBlock + code;
}

const marker = "          // DELETE /agents/:id/capabilities/:capId";
const markerIdx = code.indexOf(marker);
if (markerIdx === -1) {
  console.error("Marker not found!");
  process.exit(1);
}

const endOfCapDelete = code.indexOf("          }\n        }", markerIdx);
const endOfCapDeleteCRLF = code.indexOf("          }\r\n        }", markerIdx);
const targetIndex = endOfCapDeleteCRLF !== -1 ? endOfCapDeleteCRLF : endOfCapDelete;

if (targetIndex === -1) {
  console.error("End of cap delete block not found!");
  process.exit(1);
}

const isCRLF = code.includes("\r\n");
const newline = isCRLF ? "\r\n" : "\n";
const insertionPoint = targetIndex + `          }${newline}`.length;

const workflowRoutes = `
          // ====================================================================
          // Workflow Orchestration Routes (Prompt 111)
          // ====================================================================
          const handleWorkflowError = (err: any) => {
            if (err instanceof WorkflowValidationError || err instanceof WorkflowCycleError || err instanceof WorkflowStateTransitionError) {
              sendError(400, err.message, "VALIDATION_ERROR");
              return;
            }
            if (err instanceof WorkflowNotFoundError) {
              sendError(404, err.message, "WORKFLOW_NOT_FOUND");
              return;
            }
            if (err instanceof WorkflowInstanceNotFoundError) {
              sendError(404, err.message, "WORKFLOW_INSTANCE_NOT_FOUND");
              return;
            }
            if (err instanceof WorkflowConcurrencyConflictError) {
              sendError(409, err.message, "CONCURRENCY_CONFLICT");
              return;
            }
            if (err instanceof NoEligibleAgentFoundError) {
              sendError(422, err.message, "NO_ELIGIBLE_AGENT");
              return;
            }
            if (err instanceof WorkflowExecutionError) {
              sendError(500, err.message, "WORKFLOW_EXECUTION_ERROR");
              return;
            }
            sendError(500, err.message || "Internal workflow error", "WORKFLOW_ERROR");
          };

          // GET /workflows
          if (subPath === "/workflows" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const defs = await service.getWorkflowOrchestratorService().listDefinitions(tenantId);
              sendJson(200, defs.map((d) => service.toWorkflowDefinitionDTO(d)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows
          if (subPath === "/workflows" && req.method === "POST") {
            const authCheck = await authenticateAndAuthorize("workflow.create", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as any;
            try {
              const created = await service.getWorkflowOrchestratorService().createDefinition({
                id: body.id,
                tenantId,
                name: body.name,
                description: body.description,
                status: body.status,
                steps: body.steps ?? [],
              });
              sendJson(201, service.toWorkflowDefinitionDTO(created));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/instances
          if (subPath === "/workflows/instances" && req.method === "GET") {
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", undefined, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const instances = await service.getWorkflowOrchestratorService().listInstances(tenantId);
              sendJson(200, instances.map((i) => service.toWorkflowInstanceDTO(i)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/instances/:instanceId
          const wfInstGetMatch = subPath.match(/^\\/workflows\\/instances\\/([^/]+)$/);
          if (wfInstGetMatch && req.method === "GET") {
            const instanceId = normalizeId(wfInstGetMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const inst = await service.getWorkflowOrchestratorService().getInstance(instanceId, tenantId);
              sendJson(200, service.toWorkflowInstanceDTO(inst));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/advance
          const wfInstAdvanceMatch = subPath.match(/^\\/workflows\\/instances\\/([^/]+)\\/advance$/);
          if (wfInstAdvanceMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstAdvanceMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.execute", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const result = await service.getWorkflowOrchestratorService().advanceWorkflow(instanceId, tenantId);
              sendJson(200, {
                instance: service.toWorkflowInstanceDTO(result.instance),
                executedSteps: result.executedSteps,
              });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/pause
          const wfInstPauseMatch = subPath.match(/^\\/workflows\\/instances\\/([^/]+)\\/pause$/);
          if (wfInstPauseMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstPauseMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as { reason?: string }) : {};
            try {
              const paused = await service.getWorkflowOrchestratorService().pauseWorkflow(instanceId, tenantId, body.reason);
              sendJson(200, service.toWorkflowInstanceDTO(paused));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/resume
          const wfInstResumeMatch = subPath.match(/^\\/workflows\\/instances\\/([^/]+)\\/resume$/);
          if (wfInstResumeMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstResumeMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const resumed = await service.getWorkflowOrchestratorService().resumeWorkflow(instanceId, tenantId);
              sendJson(200, service.toWorkflowInstanceDTO(resumed));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/instances/:instanceId/cancel
          const wfInstCancelMatch = subPath.match(/^\\/workflows\\/instances\\/([^/]+)\\/cancel$/);
          if (wfInstCancelMatch && req.method === "POST") {
            const instanceId = normalizeId(wfInstCancelMatch[1]);
            if (!instanceId) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", instanceId, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as { reason?: string }) : {};
            try {
              const cancelled = await service.getWorkflowOrchestratorService().cancelWorkflow(instanceId, tenantId, body.reason);
              sendJson(200, service.toWorkflowInstanceDTO(cancelled));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/:id
          const wfGetMatch = subPath.match(/^\\/workflows\\/([^/]+)$/);
          if (wfGetMatch && req.method === "GET") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const def = await service.getWorkflowOrchestratorService().getDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(def));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // PUT /workflows/:id
          if (wfGetMatch && req.method === "PUT") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            if (!bodyResult.ok) {
              sendError(bodyResult.status, bodyResult.error, bodyResult.code);
              return;
            }
            const body = bodyResult.body as any;
            try {
              const updated = await service.getWorkflowOrchestratorService().updateDefinition(id, tenantId, {
                name: body.name,
                description: body.description,
                status: body.status,
                steps: body.steps,
              });
              sendJson(200, service.toWorkflowDefinitionDTO(updated));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/activate
          const wfActivateMatch = subPath.match(/^\\/workflows\\/([^/]+)\\/activate$/);
          if (wfActivateMatch && req.method === "POST") {
            const id = normalizeId(wfActivateMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const activated = await service.getWorkflowOrchestratorService().activateDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(activated));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/archive
          const wfArchiveMatch = subPath.match(/^\\/workflows\\/([^/]+)\\/archive$/);
          if (wfArchiveMatch && req.method === "POST") {
            const id = normalizeId(wfArchiveMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.update", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const archived = await service.getWorkflowOrchestratorService().archiveDefinition(id, tenantId);
              sendJson(200, service.toWorkflowDefinitionDTO(archived));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // DELETE /workflows/:id
          if (wfGetMatch && req.method === "DELETE") {
            const id = normalizeId(wfGetMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.delete", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const deleted = await service.getWorkflowOrchestratorService().deleteDefinition(id, tenantId);
              if (!deleted) {
                sendError(404, \`Workflow definition '\${id}' not found\`, "WORKFLOW_NOT_FOUND");
                return;
              }
              sendJson(200, { ok: true, id, deleted: true });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // POST /workflows/:id/instances or POST /workflows/:id/start
          const wfStartMatch = subPath.match(/^\\/workflows\\/([^/]+)\\/(instances|start)$/);
          if (wfStartMatch && req.method === "POST") {
            const id = normalizeId(wfStartMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.execute", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            const bodyResult = await readJsonBody();
            const body = bodyResult.ok ? (bodyResult.body as any) : {};
            try {
              const result = await service.getWorkflowOrchestratorService().startWorkflow({
                definitionId: id,
                tenantId,
                initiatedBy: body.initiatedBy ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id,
                initialInput: body.initialInput,
                autoAdvance: body.autoAdvance !== false,
              });
              sendJson(201, {
                instance: service.toWorkflowInstanceDTO(result.instance),
                executedSteps: result.executedSteps,
              });
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }

          // GET /workflows/:id/instances
          const wfListInstMatch = subPath.match(/^\\/workflows\\/([^/]+)\\/instances$/);
          if (wfListInstMatch && req.method === "GET") {
            const id = normalizeId(wfListInstMatch[1]);
            if (!id) {
              sendError(400, "Bad Request: Invalid ID format", "INVALID_ID");
              return;
            }
            const authCheck = await authenticateAndAuthorize("workflow.read", "API", id, reqCtx.tenantId);
            if (!authCheck.ok) {
              sendError(authCheck.status, authCheck.message, authCheck.code);
              return;
            }
            const tenantId = authCheck.context?.tenantId ?? reqCtx.tenantId;
            try {
              const instances = await service.getWorkflowOrchestratorService().listInstancesByDefinition(id, tenantId);
              sendJson(200, instances.map((i) => service.toWorkflowInstanceDTO(i)));
              return;
            } catch (err: any) {
              handleWorkflowError(err);
              return;
            }
          }
`;

code = code.slice(0, insertionPoint) + workflowRoutes + code.slice(insertionPoint);
fs.writeFileSync("src/platform/api/http-router.ts", code, "utf8");
console.log("Successfully updated http-router.ts with workflow routes!");
