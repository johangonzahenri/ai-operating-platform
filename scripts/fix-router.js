import fs from "node:fs";

let code = fs.readFileSync("src/platform/api/http-router.ts", "utf8");

// 1. Update POST /workflows
const oldCreate = `            const body = bodyResult.body as any;
            try {
              const created = await service.getWorkflowOrchestratorService().createDefinition({
                id: body.id,
                tenantId,
                name: body.name,
                description: body.description,
                status: body.status,
                steps: body.steps ?? [],
              });`;

const newCreate = `            const body = bodyResult.body as any;
            try {
              const created = await service.getWorkflowOrchestratorService().createDefinition({
                id: body.id || randomUUID(),
                tenantId,
                organizationId: body.organizationId || "default-org",
                areaId: body.areaId,
                teamId: body.teamId,
                name: body.name,
                description: body.description,
                steps: body.steps ?? [],
              });`;

code = code.replace(oldCreate, newCreate);

// 2. Update POST /workflows/:id/start
const oldStart = `            const body = bodyResult.body as any;
            try {
              const result = await service.getWorkflowOrchestratorService().startWorkflow({
                definitionId: id,
                tenantId,
                initiatedBy: body.initiatedBy ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id,
                initialInput: body.initialInput,
                autoAdvance: body.autoAdvance !== false,
              });`;

const newStart = `            const body = bodyResult.body as any;
            try {
              const result = await service.getWorkflowOrchestratorService().startWorkflow({
                id: body.id,
                definitionId: id,
                tenantId,
                initiatorId: body.initiatorId ?? body.initiatedBy ?? authCheck.context?.principal?.id ?? reqCtx.principal?.id ?? "system",
                input: body.input ?? body.initialInput ?? {},
                correlationId: body.correlationId,
                autoAdvance: body.autoAdvance !== false,
              });`;

code = code.replace(oldStart, newStart);

fs.writeFileSync("src/platform/api/http-router.ts", code, "utf8");
console.log("Updated http-router.ts!");
