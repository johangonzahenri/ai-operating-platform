import fs from "node:fs";

// 1. Update src/platform-client/index.ts
let clientCode = fs.readFileSync("src/platform-client/index.ts", "utf8");
const hasCRLF = clientCode.includes("\r\n");
const newline = hasCRLF ? "\r\n" : "\n";

// Add DTO imports
const dtoImportTarget = "  AgentDiscoveryCriteriaDTO,";
const dtoImports = `  WorkflowStepDefinitionDTO,${newline}  WorkflowDefinitionDTO,${newline}  CreateWorkflowDefinitionRequestDTO,${newline}  UpdateWorkflowDefinitionRequestDTO,${newline}  WorkflowStepStateDTO,${newline}  WorkflowInstanceDTO,${newline}  StartWorkflowRequestDTO,${newline}  AdvanceWorkflowResultDTO,`;

clientCode = clientCode.replace(dtoImportTarget, `${dtoImportTarget}${newline}${dtoImports}`);

// Add workflows property in createPlatformClient
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
    async start(definitionId: string, options?: { initiatedBy?: string; initialInput?: Record<string, unknown>; autoAdvance?: boolean }): Promise<AdvanceWorkflowResultDTO> {
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

const clientMarker = "    agentProfiles,";
clientCode = clientCode.replace(clientMarker, `${clientMarker}${newline}    workflows,`);

// Insert workflows in createPlatformClient before return
const beforeReturnMarker = "  return {";
clientCode = clientCode.replace(beforeReturnMarker, `${workflowsBlock}${newline}  return {`);

// Add export types at bottom
const exportTypeMarker = "  AgentDiscoveryCriteriaDTO,";
const lastIndex = clientCode.lastIndexOf(exportTypeMarker);
if (lastIndex !== -1) {
  clientCode = clientCode.slice(0, lastIndex + exportTypeMarker.length) + `${newline}${dtoImports}` + clientCode.slice(lastIndex + exportTypeMarker.length);
}

fs.writeFileSync("src/platform-client/index.ts", clientCode, "utf8");
console.log("Updated platform-client/index.ts!");

// 2. Update src/platform/web/api-client.js
let webClientCode = fs.readFileSync("src/platform/web/api-client.js", "utf8");
const webNewline = webClientCode.includes("\r\n") ? "\r\n" : "\n";

const webMethods = `
// --- Workflow Orchestration & Governed Task Assignment (Prompt 111) ---

export async function listWorkflowDefinitions() {
  return request("/workflows");
}

export async function createWorkflowDefinition(def) {
  return request("/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
}

export async function getWorkflowDefinition(id) {
  return request(\`/workflows/\${encodeURIComponent(id)}\`);
}

export async function updateWorkflowDefinition(id, patch) {
  return request(\`/workflows/\${encodeURIComponent(id)}\`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function activateWorkflowDefinition(id) {
  return request(\`/workflows/\${encodeURIComponent(id)}/activate\`, {
    method: "POST",
  });
}

export async function archiveWorkflowDefinition(id) {
  return request(\`/workflows/\${encodeURIComponent(id)}/archive\`, {
    method: "POST",
  });
}

export async function deleteWorkflowDefinition(id) {
  return request(\`/workflows/\${encodeURIComponent(id)}\`, {
    method: "DELETE",
  });
}

export async function startWorkflow(definitionId, options = {}) {
  return request(\`/workflows/\${encodeURIComponent(definitionId)}/start\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
}

export async function listWorkflowInstances(definitionId) {
  if (definitionId) {
    return request(\`/workflows/\${encodeURIComponent(definitionId)}/instances\`);
  }
  return request("/workflows/instances");
}

export async function getWorkflowInstance(instanceId) {
  return request(\`/workflows/instances/\${encodeURIComponent(instanceId)}\`);
}

export async function advanceWorkflow(instanceId) {
  return request(\`/workflows/instances/\${encodeURIComponent(instanceId)}/advance\`, {
    method: "POST",
  });
}

export async function pauseWorkflow(instanceId, reason) {
  return request(\`/workflows/instances/\${encodeURIComponent(instanceId)}/pause\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function resumeWorkflow(instanceId) {
  return request(\`/workflows/instances/\${encodeURIComponent(instanceId)}/resume\`, {
    method: "POST",
  });
}

export async function cancelWorkflow(instanceId, reason) {
  return request(\`/workflows/instances/\${encodeURIComponent(instanceId)}/cancel\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
`;

webClientCode = webClientCode.trimEnd() + webNewline + webMethods;
fs.writeFileSync("src/platform/web/api-client.js", webClientCode, "utf8");
console.log("Updated platform/web/api-client.js!");
