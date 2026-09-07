import { ModelProjection, ModelQueryPort } from "../../application/ports/query-ports.js";

export class InMemoryModelRegistry implements ModelQueryPort {
  private readonly models = new Map<string, ModelProjection>();

  constructor(initialModels: readonly ModelProjection[] = []) {
    for (const m of initialModels) {
      this.models.set(m.id, m);
    }
  }

  register(model: ModelProjection): void {
    this.models.set(model.id, model);
  }

  list(): readonly ModelProjection[] {
    return Array.from(this.models.values());
  }

  findById(id: string): ModelProjection | undefined {
    return this.models.get(id);
  }
}
