import { Task, TaskRepository } from "../../domain/task/task.js";

export class InMemoryTaskRepository implements TaskRepository {
  private readonly records = new Map<string, Task>();
  save(task: Task): void { this.records.set(task.id, task); }
  findById(id: string): Task | undefined { return this.records.get(id); }
}
