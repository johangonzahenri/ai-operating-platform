import { ModelGateway, ModelRequest, ModelResponse, ModelUnavailableError, validateModelRequest } from "../../domain/model/model-gateway.js";

export class StubModelGateway implements ModelGateway {
  constructor(private readonly failure?: Error) {}
  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);
    if (this.failure) throw new ModelUnavailableError("stub", this.failure.message);
    if (request.input.capability === "product.discovery") {
      const rawQuery = typeof request.input.userMessage === "string" ? request.input.userMessage : "";
      const ignored = new Set(["quiero", "unas", "unos", "una", "un", "para", "que", "busco", "buscar", "necesito", "por", "favor"]);
      const terms = rawQuery
        .toLocaleLowerCase("es")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2 && !ignored.has(term));
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic product discovery intent",
        output: {
          capability: "product.discovery",
          query: rawQuery,
          intent: { terms },
          candidates: [],
          products: [],
          count: 0,
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }
    return { provider: "stub", model: request.model, content: "stub response", output: { echoedInput: request.input, model: request.model }, metadata: { deterministic: true }, finishReason: "stop" };
  }
}
