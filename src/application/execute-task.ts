import { AgentDefinition } from "../domain/agent/agent.js";
import { event, EventPublisher } from "../domain/events/events.js";
import { ModelGateway } from "../domain/model/model-gateway.js";
import { Task, TaskError, TaskRepository } from "../domain/task/task.js";

export class ExecuteTask {
  constructor(
    private readonly tasks: TaskRepository, private readonly models: ModelGateway,
    private readonly events: EventPublisher, private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(task: Task, agent: AgentDefinition): Promise<Task> {
    let current = task.transition("QUEUED"); this.persist(current, "task.created");
    current = current.transition("RUNNING"); this.persist(current, "task.started");
    this.events.publish(event("agent.started", current.traceId, agent.id));
    this.events.publish(event("model.requested", current.traceId, current.id, { model: agent.model }));
    try {
      const response = await this.models.generate({ traceId: current.traceId, model: agent.model, input: current.request.input });
      this.events.publish(event("model.completed", current.traceId, current.id, { provider: response.provider }));
      current = current.complete(response.output, this.now()); this.persist(current, "task.completed");
      this.events.publish(event("agent.completed", current.traceId, agent.id));
      return current;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown model failure";
      this.events.publish(event("model.failed", current.traceId, current.id, { message }));
      current = current.fail(new TaskError("MODEL_FAILURE", message)); this.persist(current, "task.failed");
      this.events.publish(event("agent.failed", current.traceId, agent.id, { message }));
      return current;
    }
  }

  private persist(task: Task, type: "task.created" | "task.started" | "task.completed" | "task.failed"): void {
    this.tasks.save(task); this.events.publish(event(type, task.traceId, task.id, { status: task.status }));
  }
}
