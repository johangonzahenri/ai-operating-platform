import { AutonomousOperation } from "./autonomous-operation.js";
import { Decision } from "./decision.js";
import { Observation } from "./observation.js";
import { Plan } from "./plan.js";

export interface OperationRecord {
  readonly operation: AutonomousOperation;
  readonly plan?: Plan | undefined;
  readonly observations: readonly Observation[];
  readonly decisions: readonly Decision[];
}

export interface OperationRepositoryPort {
  save(
    operation: AutonomousOperation,
    details?: {
      readonly plan?: Plan | undefined;
      readonly observations?: readonly Observation[] | undefined;
      readonly decisions?: readonly Decision[] | undefined;
    }
  ): void;
  findById(id: string): AutonomousOperation | undefined;
  findRecordById(id: string): OperationRecord | undefined;
  list(): readonly AutonomousOperation[];
  listRecords(): readonly OperationRecord[];
}
