import crypto from "node:crypto";
import { EventPublisher, event } from "../../domain/events/events.js";
import { Execution, ExecutionRepository } from "../../domain/execution/execution.js";
import { Task, TaskError, TaskRepository } from "../../domain/task/task.js";
import { AutonomousOperation } from "../../domain/autonomy/autonomous-operation.js";
import { OperationRepositoryPort } from "../../domain/autonomy/operation-repository.js";
import { RecoveryPort, RecoveryResult, TransactionRunner } from "../ports/recovery-port.js";
import { DurableEventStore } from "../ports/durable-event-port.js";

export interface RestartRecoveryServiceDependencies {
  readonly tasks: TaskRepository & { list(): readonly Task[] };
  readonly executions: ExecutionRepository & { list(): readonly Execution[] };
  readonly operations?: (OperationRepositoryPort & { list(): readonly AutonomousOperation[] }) | undefined;
  readonly events?: EventPublisher | undefined;
  readonly eventStore?: DurableEventStore | undefined;
  readonly transactionRunner?: TransactionRunner | undefined;
  readonly now?: () => Date;
}

/**
 * Application service orchestrating crash recovery and restart reconciliation.
 * Inspects persisted tasks, executions, and autonomous operations upon process startup,
 * transitioning any in-flight or stale entities into clean, immutable terminal states.
 */
export class RestartRecoveryService implements RecoveryPort {
  private readonly tasks: TaskRepository & { list(): readonly Task[] };
  private readonly executions: ExecutionRepository & { list(): readonly Execution[] };
  private readonly operations?: (OperationRepositoryPort & { list(): readonly AutonomousOperation[] }) | undefined;
  private readonly events?: EventPublisher | undefined;
  private readonly eventStore?: DurableEventStore | undefined;
  private readonly transactionRunner: TransactionRunner;
  private readonly now: () => Date;

  constructor(deps: RestartRecoveryServiceDependencies) {
    this.tasks = deps.tasks;
    this.executions = deps.executions;
    this.operations = deps.operations;
    this.events = deps.events;
    this.eventStore = deps.eventStore;
    this.transactionRunner = deps.transactionRunner ?? { run: <T>(fn: () => T): T => fn() };
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Reconciles all non-terminal tasks, executions, and autonomous operations within an atomic transaction.
   * Guarantees idempotency: repeated executions on reconciled state produce zero mutations.
   */
  reconcile(): RecoveryResult {
    return this.transactionRunner.run(() => {
      const currentTime = this.now();
      const allTasks = this.tasks.list();
      const allExecutions = this.executions.list();
      const allOperations = this.operations ? this.operations.list() : [];

      let reconciledTasks = 0;
      let alreadyTerminalTasks = 0;
      let reconciledExecutions = 0;
      let alreadyTerminalExecutions = 0;
      let reconciledOperations = 0;
      let alreadyTerminalOperations = 0;
      const errors: string[] = [];

      // 1. Reconcile Executions
      for (const execution of allExecutions) {
        if (
          execution.status === "COMPLETED" ||
          execution.status === "FAILED" ||
          execution.status === "CANCELLED"
        ) {
          alreadyTerminalExecutions++;
          continue;
        }

        const parentTask = allTasks.find((t) => t.id === execution.taskId);

        if (execution.status === "CREATED") {
          const cancelled = execution.cancel(currentTime);
          this.executions.save(cancelled);
          if (this.eventStore) {
            this.eventStore.append({
              eventId: crypto.randomUUID(),
              eventType: "execution.cancelled",
              aggregateType: "execution",
              aggregateId: cancelled.id,
              traceId: cancelled.traceId,
              correlationId: cancelled.traceId,
              causationId: cancelled.taskId,
              occurredAt: currentTime,
              payload: Object.freeze({
                status: cancelled.status,
                reason: parentTask ? "crash_recovery" : "orphan_execution",
              }),
              schemaVersion: 1,
            });
          }
          this.publishEvent(
            "execution.cancelled",
            cancelled.traceId,
            cancelled.id,
            {
              status: cancelled.status,
              reason: parentTask ? "crash_recovery" : "orphan_execution",
            },
            { taskId: cancelled.taskId, executionId: cancelled.id }
          );
          reconciledExecutions++;
        } else if (execution.status === "RUNNING") {
          const code = parentTask ? "CRASH_RECOVERY" : "ORPHAN_EXECUTION";
          const message = parentTask
            ? "Execution interrupted by system crash during runtime"
            : "Execution in RUNNING status has no associated task record upon restart";
          const error = new TaskError(code, message);
          const failed = execution.fail(error, currentTime);
          this.executions.save(failed);
          if (this.eventStore) {
            this.eventStore.append({
              eventId: crypto.randomUUID(),
              eventType: "execution.failed",
              aggregateType: "execution",
              aggregateId: failed.id,
              traceId: failed.traceId,
              correlationId: failed.traceId,
              causationId: failed.taskId,
              occurredAt: currentTime,
              payload: Object.freeze({
                status: failed.status,
                code: error.code,
                reason: parentTask ? "crash_recovery" : "orphan_execution",
              }),
              schemaVersion: 1,
            });
          }
          this.publishEvent(
            "execution.failed",
            failed.traceId,
            failed.id,
            {
              status: failed.status,
              code: error.code,
              reason: parentTask ? "crash_recovery" : "orphan_execution",
            },
            { taskId: failed.taskId, executionId: failed.id }
          );
          reconciledExecutions++;
        }
      }

      // 2. Reconcile Tasks
      for (const task of allTasks) {
        if (
          task.status === "COMPLETED" ||
          task.status === "FAILED" ||
          task.status === "CANCELLED"
        ) {
          alreadyTerminalTasks++;
          continue;
        }

        if (task.status === "RUNNING") {
          const error = new TaskError(
            "CRASH_RECOVERY",
            "Task execution interrupted by system crash"
          );
          const failed = task.fail(error);
          this.tasks.save(failed);
          if (this.eventStore) {
            this.eventStore.append({
              eventId: crypto.randomUUID(),
              eventType: "task.failed",
              aggregateType: "task",
              aggregateId: failed.id,
              traceId: failed.traceId,
              correlationId: failed.traceId,
              occurredAt: currentTime,
              payload: Object.freeze({
                status: failed.status,
                code: error.code,
                reason: "crash_recovery",
              }),
              schemaVersion: 1,
            });
          }
          this.publishEvent(
            "task.failed",
            failed.traceId,
            failed.id,
            {
              status: failed.status,
              code: error.code,
              reason: "crash_recovery",
            },
            { taskId: failed.id }
          );
          reconciledTasks++;
        } else if (
          task.status === "QUEUED" ||
          task.status === "CREATED" ||
          task.status === "WAITING"
        ) {
          const cancelled = task.transition("CANCELLED");
          this.tasks.save(cancelled);
          if (this.eventStore) {
            this.eventStore.append({
              eventId: crypto.randomUUID(),
              eventType: "task.cancelled",
              aggregateType: "task",
              aggregateId: cancelled.id,
              traceId: cancelled.traceId,
              correlationId: cancelled.traceId,
              occurredAt: currentTime,
              payload: Object.freeze({
                status: cancelled.status,
                reason: "crash_recovery",
              }),
              schemaVersion: 1,
            });
          }
          this.publishEvent(
            "task.cancelled",
            cancelled.traceId,
            cancelled.id,
            {
              status: cancelled.status,
              reason: "crash_recovery",
            },
            { taskId: cancelled.id }
          );
          reconciledTasks++;
        }
      }

      // 3. Reconcile Autonomous Operations
      if (this.operations) {
        for (const op of allOperations) {
          if (
            op.status === "COMPLETED" ||
            op.status === "FAILED" ||
            op.status === "CANCELLED" ||
            op.status === "BUDGET_EXHAUSTED"
          ) {
            alreadyTerminalOperations++;
            continue;
          }

          if (op.status === "RUNNING") {
            const failureError = {
              code: "CRASH_RECOVERY_OPERATION_TERMINATED",
              message: "Autonomous operation interrupted by system crash during execution",
            };
            const failed = op.fail(failureError, currentTime);
            this.operations.save(failed);
            if (this.eventStore) {
              this.eventStore.append({
                eventId: crypto.randomUUID(),
                eventType: "operation.failed",
                aggregateType: "operation",
                aggregateId: failed.id,
                traceId: failed.id,
                correlationId: failed.id,
                causationId: "crash_recovery",
                occurredAt: currentTime,
                payload: Object.freeze({
                  status: failed.status,
                  code: failureError.code,
                  message: failureError.message,
                  reason: "crash_recovery",
                }),
                schemaVersion: 1,
              });
            }
            this.publishOperationEvent("operation.failed", failed.id, {
              status: failed.status,
              code: failureError.code,
              message: failureError.message,
              reason: "crash_recovery",
            });
            reconciledOperations++;
          } else if (op.status === "SUBMITTED") {
            const running = op.start(currentTime);
            const cancelled = running.cancel("Operation cancelled during crash recovery restart reconciliation", currentTime);
            this.operations.save(cancelled);
            if (this.eventStore) {
              this.eventStore.append({
                eventId: crypto.randomUUID(),
                eventType: "operation.cancelled",
                aggregateType: "operation",
                aggregateId: cancelled.id,
                traceId: cancelled.id,
                correlationId: cancelled.id,
                causationId: "crash_recovery",
                occurredAt: currentTime,
                payload: Object.freeze({
                  status: cancelled.status,
                  reason: "crash_recovery",
                }),
                schemaVersion: 1,
              });
            }
            this.publishOperationEvent("operation.cancelled", cancelled.id, {
              status: cancelled.status,
              reason: "crash_recovery",
            });
            reconciledOperations++;
          }
        }
      }

      return {
        inspectedTasks: allTasks.length,
        reconciledTasks,
        alreadyTerminalTasks,
        inspectedExecutions: allExecutions.length,
        reconciledExecutions,
        alreadyTerminalExecutions,
        inspectedOperations: this.operations ? allOperations.length : undefined,
        reconciledOperations: this.operations ? reconciledOperations : undefined,
        alreadyTerminalOperations: this.operations ? alreadyTerminalOperations : undefined,
        errors: Object.freeze(errors),
      };
    });
  }

  private publishEvent(
    type: "task.cancelled" | "task.failed" | "execution.cancelled" | "execution.failed",
    traceId: string,
    aggregateId: string,
    payload: Readonly<Record<string, unknown>>,
    references: Readonly<{ taskId?: string; executionId?: string }>
  ): void {
    if (this.events) {
      this.events.publish(
        event(type, traceId, aggregateId, payload, undefined, this.now(), references)
      );
    }
  }

  private publishOperationEvent(
    type: "operation.cancelled" | "operation.failed",
    aggregateId: string,
    payload: Readonly<Record<string, unknown>>
  ): void {
    if (this.events) {
      this.events.publish(
        event(type, aggregateId, aggregateId, payload, undefined, this.now(), {})
      );
    }
  }
}

