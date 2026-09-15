export interface ScheduledTaskDefinition {
  readonly id: string;
  readonly name: string;
  readonly cronExpression: string; // e.g. "0 * * * *" or "*/15 * * * *"
  readonly operationType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  readonly lastRunAt?: string | undefined;
  readonly nextRunAt?: string | undefined;
}

export interface TaskExecutionRecord {
  readonly taskId: string;
  readonly executedAt: string;
  readonly status: "SUCCESS" | "FAILED";
  readonly durationMs: number;
  readonly error?: string | undefined;
}

export class SchedulerService {
  private readonly tasks: Map<string, ScheduledTaskDefinition> = new Map();
  private readonly executionHistory: TaskExecutionRecord[] = [];

  registerTask(task: ScheduledTaskDefinition): void {
    if (!task.id || !task.name) {
      throw new Error("Scheduled task requires valid id and name");
    }
    if (!this.isValidCron(task.cronExpression)) {
      throw new Error(`Invalid cron expression: ${task.cronExpression}. Standard 5-field cron required.`);
    }
    this.tasks.set(task.id, task);
  }

  getTask(id: string): ScheduledTaskDefinition | undefined {
    return this.tasks.get(id);
  }

  listTasks(): readonly ScheduledTaskDefinition[] {
    return Array.from(this.tasks.values());
  }

  deleteTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  isValidCron(expr: string): boolean {
    const parts = expr.trim().split(/\s+/);
    return parts.length === 5;
  }

  recordExecution(rec: TaskExecutionRecord): void {
    this.executionHistory.push(rec);
    if (this.executionHistory.length > 500) {
      this.executionHistory.shift();
    }
  }

  getExecutionHistory(taskId?: string): readonly TaskExecutionRecord[] {
    return taskId
      ? this.executionHistory.filter((r) => r.taskId === taskId)
      : [...this.executionHistory];
  }
}
