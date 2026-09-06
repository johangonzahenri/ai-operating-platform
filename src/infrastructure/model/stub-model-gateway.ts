import { ModelGateway, ModelRequest, ModelResponse, ModelUnavailableError, validateModelRequest } from "../../domain/model/model-gateway.js";

export class StubModelGateway implements ModelGateway {
  constructor(private readonly failure?: Error) {}
  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);
    if (this.failure) throw new ModelUnavailableError("stub", this.failure.message);
    return { provider: "stub", model: request.model, content: "stub response", output: { echoedInput: request.input, model: request.model }, metadata: { deterministic: true }, finishReason: "stop" };
  }
}
