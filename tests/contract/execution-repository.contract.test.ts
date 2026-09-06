import assert from "node:assert/strict";
import test from "node:test";
import { Execution, ExecutionRepository } from "../../src/domain/execution/execution.js";
import { InMemoryExecutionRepository } from "../../src/infrastructure/persistence/in-memory-execution-repository.js";

const repositoryContract = (name: string, repository: ExecutionRepository): void => test(`${name} persists executions by identity`, () => {
  const execution = Execution.create("execution-1", "task-1", "trace-1"); repository.save(execution);
  assert.equal(repository.findById(execution.id), execution); assert.equal(repository.findById("unknown"), undefined);
});
repositoryContract("InMemoryExecutionRepository", new InMemoryExecutionRepository());
