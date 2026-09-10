import crypto from "node:crypto";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionRepository, Execution, ExecutionCancelledError } from "../../domain/execution/execution.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ExecutionStrategy } from "../../domain/execution/execution-strategy.js";
import { Runtime, RuntimeResult } from "../../domain/execution/runtime.js";
import { Task, TaskError, TaskRepository } from "../../domain/task/task.js";
import { AgentDefinition } from "../../domain/agent/agent.js";
import { DurableEventStore } from "../ports/durable-event-port.js";
import { TransactionRunner } from "../ports/recovery-port.js";

export interface IdGenerator { next(): string; }

/** Application service owning task/execution lifecycle, persistence and lifecycle events. */
export class CoreRuntime implements Runtime {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly executions: ExecutionRepository,
    private readonly strategy: ExecutionStrategy,
    private readonly events: EventPublisher,
    private readonly ids: IdGenerator = { next: () => crypto.randomUUID() },
    private readonly now: () => Date = () => new Date(),
    private readonly eventStore?: DurableEventStore,
    private readonly transactionRunner: TransactionRunner = { run: (fn) => fn() },
  ) {}

  async execute(task: Task, agent: AgentDefinition): Promise<RuntimeResult> {
    const context = ExecutionContext.create(task.traceId, this.ids.next(), task.id, {}, this.now()).withInput(task.request.input);
    this.events.publish(event("context.created", context.traceId, context.executionId, {}, undefined, undefined, { taskId: context.taskId, executionId: context.executionId }));
    let execution = Execution.create(context.executionId, task.id, task.traceId, context.createdAt);
    this.saveExecution(execution, "execution.created");
    let currentTask = task.transition("QUEUED"); this.saveTask(currentTask, "task.created");
    execution = execution.start(this.now()); this.saveExecution(execution, "execution.started");
    currentTask = currentTask.transition("RUNNING"); this.saveTask(currentTask, "task.started");
    this.events.publish(event("agent.started", task.traceId, agent.id, {}, undefined, undefined, { taskId: task.id, executionId: execution.id }));
    try {
      const result = await this.strategy.execute(context, currentTask, agent);
      execution = execution.complete(result.metadata, this.now()); this.saveExecution(execution, "execution.completed");
      currentTask = currentTask.complete(result.output, this.now()); this.saveTask(currentTask, "task.completed");
      this.events.publish(event("agent.completed", task.traceId, agent.id, {}, undefined, undefined, { taskId: task.id, executionId: execution.id }));
      return { task: currentTask, execution, context };
    } catch (cause) {
      if (cause instanceof ExecutionCancelledError) {
        execution = execution.cancel(this.now()); this.saveExecution(execution, "execution.cancelled");
        currentTask = currentTask.transition("CANCELLED"); this.saveTask(currentTask, "task.cancelled");
        return { task: currentTask, execution, context };
      }
      const message = cause instanceof Error ? cause.message : "Unknown execution failure";
      const error = new TaskError("EXECUTION_FAILURE", message);
      execution = execution.fail(error, this.now()); this.saveExecution(execution, "execution.failed", { code: error.code, message: error.message });
      currentTask = currentTask.fail(error); this.saveTask(currentTask, "task.failed", { code: error.code, message: error.message });
      this.events.publish(event("agent.failed", task.traceId, agent.id, { code: error.code }, undefined, undefined, { taskId: task.id, executionId: execution.id }));
      return { task: currentTask, execution, context };
    }
  }

  private saveTask(
    task: Task,
    type: "task.created" | "task.started" | "task.completed" | "task.failed" | "task.cancelled",
    payload: Readonly<Record<string, unknown>> = {}
  ): void {
    const eventPayload = Object.freeze({ status: task.status, ...payload });
    const eventId = this.ids.next();
    const eventTime = this.now();

    this.transactionRunner.run(() => {
      this.tasks.save(task);
      if (this.eventStore) {
        this.eventStore.append({
          eventId,
          eventType: type,
          aggregateType: "task",
          aggregateId: task.id,
          traceId: task.traceId,
          correlationId: task.traceId,
          occurredAt: eventTime,
          payload: eventPayload,
          schemaVersion: 1,
        });
      }
    });

    this.events.publish(
      event(type, task.traceId, task.id, eventPayload, eventId, eventTime, { taskId: task.id })
    );
  }

  private saveExecution(
    execution: Execution,
    type: "execution.created" | "execution.started" | "execution.completed" | "execution.failed" | "execution.cancelled",
    payload: Readonly<Record<string, unknown>> = {}
  ): void {
    const eventPayload = Object.freeze({ status: execution.status, ...payload });
    const eventId = this.ids.next();
    const eventTime = this.now();

    this.transactionRunner.run(() => {
      this.executions.save(execution);
      if (this.eventStore) {
        this.eventStore.append({
          eventId,
          eventType: type,
          aggregateType: "execution",
          aggregateId: execution.id,
          traceId: execution.traceId,
          correlationId: execution.traceId,
          causationId: execution.taskId,
          occurredAt: eventTime,
          payload: eventPayload,
          schemaVersion: 1,
        });
      }
    });

    this.events.publish(
      event(type, execution.traceId, execution.id, eventPayload, eventId, eventTime, {
        taskId: execution.taskId,
        executionId: execution.id,
      })
    );
  }
}
