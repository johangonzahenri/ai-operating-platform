import { ExecutionContext } from "../execution/execution-context.js";

export type Operation = ModelOperation | ToolOperation;
export interface OperationBinding { readonly targetKey: string; readonly operationId: string; readonly sourceKey: string; }
export interface ModelOperation { readonly kind: "MODEL"; readonly id: string; readonly model: string; readonly input: Readonly<Record<string, unknown>>; readonly bindings?: readonly OperationBinding[] | undefined; readonly metadata?: Readonly<Record<string, unknown>> | undefined; }
export interface ToolOperation { readonly kind: "TOOL"; readonly id: string; readonly toolId: string; readonly input: Readonly<Record<string, unknown>>; readonly bindings?: readonly OperationBinding[] | undefined; readonly metadata?: Readonly<Record<string, unknown>> | undefined; }
export interface OrchestrationRequest { readonly execution: ExecutionContext; readonly operations: readonly Operation[]; readonly metadata?: Readonly<Record<string, unknown>> | undefined; readonly cancelled?: boolean | undefined; }
export type OperationStatus = "COMPLETED" | "FAILED" | "CANCELLED";
export interface OperationResult { readonly operationId: string; readonly status: OperationStatus; readonly output?: Readonly<Record<string, unknown>>; readonly metadata?: Readonly<Record<string, unknown>>; readonly error?: Error; }
export interface OrchestrationResult { readonly status: "COMPLETED" | "FAILED" | "CANCELLED"; readonly operations: readonly OperationResult[]; readonly output?: Readonly<Record<string, unknown>>; }
export class OrchestrationValidationError extends Error { constructor(message: string) { super(message); this.name = "OrchestrationValidationError"; } }
export class OperationExecutionError extends Error { constructor(readonly operationId: string, message: string, readonly cause?: Error) { super(message); this.name = "OperationExecutionError"; } }
export interface Orchestrator { execute(request: OrchestrationRequest): Promise<OrchestrationResult>; }
