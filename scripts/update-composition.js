import fs from "node:fs";

// 1. Update composition.ts
let compCode = fs.readFileSync("src/interfaces/composition.ts", "utf8");

const compImports = `import {
  WorkflowDefinitionRepositoryPort,
  WorkflowInstanceRepositoryPort,
} from "../application/ports/workflow-repository-port.js";
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from "../infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import {
  SqliteWorkflowDefinitionRepository,
  SqliteWorkflowInstanceRepository,
} from "../infrastructure/persistence/sqlite/sqlite-workflow-repository.js";
import { WorkflowOrchestratorService } from "../application/workflow/workflow-orchestrator-service.js";
`;

if (!compCode.includes("WorkflowDefinitionRepositoryPort")) {
  compCode = compImports + compCode;
}

// Add options to CreatePlatformOptions
const optionsTarget = "  readonly agentProfileService?: AgentProfileService | undefined;\n";
const optionsTargetCRLF = "  readonly agentProfileService?: AgentProfileService | undefined;\r\n";
const hasCRLF = compCode.includes("\r\n");
const newline = hasCRLF ? "\r\n" : "\n";

const newOptions = `  readonly workflowDefinitionRepository?: WorkflowDefinitionRepositoryPort | undefined;${newline}  readonly workflowInstanceRepository?: WorkflowInstanceRepositoryPort | undefined;${newline}  readonly workflowOrchestratorService?: WorkflowOrchestratorService | undefined;${newline}`;

if (compCode.includes(optionsTargetCRLF)) {
  compCode = compCode.replace(optionsTargetCRLF, optionsTargetCRLF + newOptions);
} else if (compCode.includes(optionsTarget)) {
  compCode = compCode.replace(optionsTarget, optionsTarget + newOptions);
}

// Add workflow service wiring after organizationalCoordinationService
const wiringTarget = `        events,${newline}      });${newline}`;
const wiringInsert = `
  const workflowDefinitionRepository: WorkflowDefinitionRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowDefinitionRepository)
    ? (optionsOrLogger as CreatePlatformOptions).workflowDefinitionRepository!
    : dbManager
      ? new SqliteWorkflowDefinitionRepository(dbManager)
      : new InMemoryWorkflowDefinitionRepository();

  const workflowInstanceRepository: WorkflowInstanceRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowInstanceRepository)
    ? (optionsOrLogger as CreatePlatformOptions).workflowInstanceRepository!
    : dbManager
      ? new SqliteWorkflowInstanceRepository(dbManager)
      : new InMemoryWorkflowInstanceRepository();

  const workflowOrchestratorService: WorkflowOrchestratorService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowOrchestratorService)
    ? (optionsOrLogger as CreatePlatformOptions).workflowOrchestratorService!
    : new WorkflowOrchestratorService({
        definitionRepository: workflowDefinitionRepository,
        instanceRepository: workflowInstanceRepository,
        agentProfileService,
        organizationRepository,
        budgetService: teamResourceBudgetService,
        policyGateway: policy,
        runtime: agentRuntime,
        agentQuery: agents,
        events,
      });
`;

// Find organizationalCoordinationService creation
const coordPos = compCode.indexOf("const organizationalCoordinationService:");
if (coordPos !== -1) {
  const coordEnd = compCode.indexOf("});" + newline, coordPos);
  if (coordEnd !== -1) {
    const insertPos = coordEnd + ("});" + newline).length;
    compCode = compCode.slice(0, insertPos) + wiringInsert + compCode.slice(insertPos);
  }
}

// Add return fields to return object
const returnTarget = `    agentProfileService,${newline}  };`;
const returnInsert = `    agentProfileService,${newline}    workflowDefinitionRepository,${newline}    workflowInstanceRepository,${newline}    workflowOrchestratorService,${newline}  };`;

compCode = compCode.replace(returnTarget, returnInsert);

fs.writeFileSync("src/interfaces/composition.ts", compCode, "utf8");
console.log("Updated composition.ts!");

// 2. Update server.ts
let serverCode = fs.readFileSync("src/platform/server.ts", "utf8");
const serverTarget = `    agentProfileService: platform.agentProfileService,${newline}    eventStream: platform.eventStream,`;
const serverInsert = `    agentProfileService: platform.agentProfileService,${newline}    workflowOrchestratorService: platform.workflowOrchestratorService,${newline}    eventStream: platform.eventStream,`;

serverCode = serverCode.replace(serverTarget, serverInsert);
fs.writeFileSync("src/platform/server.ts", serverCode, "utf8");
console.log("Updated server.ts!");
