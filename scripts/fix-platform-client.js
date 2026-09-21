import fs from "node:fs";

let code = fs.readFileSync("src/platform-client/index.ts", "utf8");

const workflowsBlock = `  const workflows = {
    async createDefinition(body: CreateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>("/workflows", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async listDefinitions(): Promise<readonly WorkflowDefinitionDTO[]> {
      return request<readonly WorkflowDefinitionDTO[]>("/workflows");
    },
    async getDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(\`/workflows/\${encodeURIComponent(id)}\`);
    },
    async updateDefinition(id: string, body: UpdateWorkflowDefinitionRequestDTO): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(\`/workflows/\${encodeURIComponent(id)}\`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    async activateDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(\`/workflows/\${encodeURIComponent(id)}/activate\`, {
        method: "POST",
      });
    },
    async archiveDefinition(id: string): Promise<WorkflowDefinitionDTO> {
      return request<WorkflowDefinitionDTO>(\`/workflows/\${encodeURIComponent(id)}/archive\`, {
        method: "POST",
      });
    },
    async deleteDefinition(id: string): Promise<{ ok: boolean; id: string; deleted: boolean }> {
      return request<{ ok: boolean; id: string; deleted: boolean }>(\`/workflows/\${encodeURIComponent(id)}\`, {
        method: "DELETE",
      });
    },
    async start(definitionId: string, options?: { id?: string; initiatorId?: string; input?: Record<string, unknown>; correlationId?: string; autoAdvance?: boolean }): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(\`/workflows/\${encodeURIComponent(definitionId)}/start\`, {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },
    async listInstances(definitionId?: string): Promise<readonly WorkflowInstanceDTO[]> {
      if (definitionId) {
        return request<readonly WorkflowInstanceDTO[]>(\`/workflows/\${encodeURIComponent(definitionId)}/instances\`);
      }
      return request<readonly WorkflowInstanceDTO[]>("/workflows/instances");
    },
    async getInstance(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(\`/workflows/instances/\${encodeURIComponent(instanceId)}\`);
    },
    async advance(instanceId: string): Promise<AdvanceWorkflowResultDTO> {
      return request<AdvanceWorkflowResultDTO>(\`/workflows/instances/\${encodeURIComponent(instanceId)}/advance\`, {
        method: "POST",
      });
    },
    async pause(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(\`/workflows/instances/\${encodeURIComponent(instanceId)}/pause\`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    async resume(instanceId: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(\`/workflows/instances/\${encodeURIComponent(instanceId)}/resume\`, {
        method: "POST",
      });
    },
    async cancel(instanceId: string, reason?: string): Promise<WorkflowInstanceDTO> {
      return request<WorkflowInstanceDTO>(\`/workflows/instances/\${encodeURIComponent(instanceId)}/cancel\`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
  };
`;

const target = "\n  return {\n    tasks,";
const targetCRLF = "\r\n  return {\r\n    tasks,";

if (code.includes(targetCRLF)) {
  code = code.replace(targetCRLF, "\r\n" + workflowsBlock + targetCRLF);
} else if (code.includes(target)) {
  code = code.replace(target, "\n" + workflowsBlock + target);
}

fs.writeFileSync("src/platform-client/index.ts", code, "utf8");
console.log("Fixed platform-client/index.ts!");
