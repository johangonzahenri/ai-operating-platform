import { AuditLog, Observation } from "../../domain/observability/observability.js";
export class InMemoryAuditLog implements AuditLog {
  readonly observations: Observation[] = [];
  record(observation: Observation): void { this.observations.push(observation); }
  findByTraceId(traceId: string) { return this.observations.filter((item) => item.traceId === traceId); }
  findByExecutionId(executionId: string) { return this.observations.filter((item) => item.executionId === executionId); }
  findByOperationId(operationId: string) { return this.observations.filter((item) => item.operationId === operationId); }
}
