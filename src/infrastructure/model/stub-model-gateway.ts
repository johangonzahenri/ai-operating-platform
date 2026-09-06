import { ModelGateway, ModelRequest, ModelResponse } from "../../domain/model/model-gateway.js";

export class StubModelGateway implements ModelGateway {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    return { provider: "stub", output: { echoedInput: request.input, model: request.model } };
  }
}
