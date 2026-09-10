import assert from "node:assert/strict";
import test from "node:test";
import { Execution, ExecutionRepository } from "../../src/domain/execution/execution.js";
import { InMemoryExecutionRepository } from "../../src/infrastructure/persistence/in-memory-execution-repository.js";
import { SqliteExecutionRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-execution-repository.js";

const repositoryContract = (name: string, factory: () => ExecutionRepository): void => {
  test(`${name} persists executions by identity`, () => {
    const repository = factory();
    const execution = Execution.create("execution-1", "task-1", "trace-1");
    repository.save(execution);
    const found = repository.findById(execution.id);
    assert.ok(found);
    assert.equal(found.id, execution.id);
    assert.equal(found.taskId, execution.taskId);
    assert.equal(found.traceId, execution.traceId);
    assert.equal(found.status, execution.status);
    if (name === "InMemoryExecutionRepository") {
      assert.equal(found, execution);
    }
    assert.equal(repository.findById("unknown"), undefined);
  });

  test(`${name} allows execution to be persisted before its Task exists`, () => {
    const repository = factory();
    const isolatedExecution = Execution.create(
      "exec-isolated-1",
      "task-never-persisted",
      "trace-iso-1"
    );
    assert.doesNotThrow(() => {
      repository.save(isolatedExecution);
    });
    const found = repository.findById("exec-isolated-1");
    assert.ok(found);
    assert.equal(found.taskId, "task-never-persisted");
  });
};

repositoryContract("InMemoryExecutionRepository", () => new InMemoryExecutionRepository());
repositoryContract("SqliteExecutionRepository", () => new SqliteExecutionRepository({ dbPath: ":memory:" }));

