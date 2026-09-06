export interface WorkflowDefinition { readonly id: string; readonly taskIds: readonly string[]; }
export interface WorkflowCoordinator { start(workflow: WorkflowDefinition): Promise<void>; }
