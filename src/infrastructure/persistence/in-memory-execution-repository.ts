import { Execution, ExecutionRepository } from "../../domain/execution/execution.js";

export class InMemoryExecutionRepository implements ExecutionRepository {
  private readonly records = new Map<string, Execution>();
  save(execution: Execution): void { this.records.set(execution.id, execution); }
  findById(id: string): Execution | undefined { return this.records.get(id); }
}
