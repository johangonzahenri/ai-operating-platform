import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { InvalidTaskInputError } from "../../src/domain/task/task.js";
test("execution context keeps input and controlled immutable values", () => {
  const base = ExecutionContext.create("trace", "execution", "task", { source: "test" }).withInput({ query: "hello" }); const updated = base.withValue("result", { value: 2 });
  assert.deepEqual(base.input, { query: "hello" }); assert.equal(base.has("result"), false); assert.equal(updated.has("result"), true); assert.deepEqual(updated.snapshot(), { result: { value: 2 } });
});
test("execution context rejects invalid input and update keys", () => {
  const context = ExecutionContext.create("trace", "execution", "task"); assert.throws(() => context.withInput(null as unknown as Record<string, unknown>), InvalidTaskInputError); assert.throws(() => context.withValue("", 1), InvalidTaskInputError);
});
