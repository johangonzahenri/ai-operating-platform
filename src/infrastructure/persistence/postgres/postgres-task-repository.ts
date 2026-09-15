import { Task, TaskRepository } from "../../../domain/task/task.js";

export interface PostgresQueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export class PostgresTaskRepository implements TaskRepository {
  private readonly fallbackMemory = new Map<string, Task>();

  constructor(private readonly client?: PostgresQueryClient) {}

  save(task: Task): void {
    this.fallbackMemory.set(task.id, task);

    if (this.client) {
      const sql = `
        INSERT INTO platform_tasks (task_id, trace_id, agent_id, status, input, result, error, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (task_id) DO UPDATE SET
          status = EXCLUDED.status,
          result = EXCLUDED.result,
          error = EXCLUDED.error;
      `;
      this.client.query(sql, [
        task.id,
        task.traceId,
        task.request.agentId,
        task.status,
        JSON.stringify(task.request.input),
        task.result ? JSON.stringify(task.result) : null,
        task.error ? JSON.stringify(task.error) : null,
        task.createdAt.toISOString(),
      ]).catch(() => {
        // Fallback retains state in memory on async persistence error
      });
    }
  }

  findById(id: string): Task | undefined {
    return this.fallbackMemory.get(id);
  }

  list(): readonly Task[] {
    return Array.from(this.fallbackMemory.values());
  }

  mapRowToTask(row: any): Task {
    return Task.rehydrate({
      id: row.task_id,
      traceId: row.trace_id,
      request: {
        agentId: row.agent_id,
        input: typeof row.input === "string" ? JSON.parse(row.input) : row.input,
      },
      status: row.status,
      result: row.result ? (typeof row.result === "string" ? JSON.parse(row.result) : row.result) : undefined,
      error: row.error ? (typeof row.error === "string" ? JSON.parse(row.error) : row.error) : undefined,
      createdAt: new Date(row.created_at),
    });
  }
}
