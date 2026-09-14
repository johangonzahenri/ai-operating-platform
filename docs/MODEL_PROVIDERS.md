# Model Providers Configuration & Adapters Reference

## 1. Environment Configuration

All model providers are configured via environment variables or explicitly passed configuration objects. No API keys or tokens are hardcoded.

| Variable | Provider | Default | Description |
|---|---|---|---|
| `MODEL_PROVIDER` | All | `stub` | Default provider (`stub`, `openai`, `anthropic`, `ollama`) |
| `MODEL_NAME` | All | Provider default | Default model identifier |
| `MODEL_REQUEST_TIMEOUT_MS` | All | `30000` | Client request timeout in milliseconds |
| `MODEL_MAX_RETRIES` | All | `2` | Maximum retry attempts on transient failures |
| `OPENAI_API_KEY` | OpenAI | `undefined` | OpenAI bearer API key |
| `OPENAI_MODEL` | OpenAI | `gpt-4o-mini` | Default OpenAI model |
| `OPENAI_BASE_URL` | OpenAI | `https://api.openai.com/v1` | Base API endpoint |
| `ANTHROPIC_API_KEY` | Anthropic | `undefined` | Anthropic `x-api-key` |
| `ANTHROPIC_MODEL` | Anthropic | `claude-3-5-haiku-latest` | Default Anthropic model |
| `ANTHROPIC_BASE_URL` | Anthropic | `https://api.anthropic.com` | Base API endpoint |
| `OLLAMA_BASE_URL` | Ollama | `http://127.0.0.1:11434` | Local Ollama HTTP daemon endpoint |
| `OLLAMA_MODEL` | Ollama | `llama3` | Default Ollama model |

---

## 2. Adapter Implementations

### OpenAI Adapter (`OpenAIModelGateway`)
- **Protocol**: REST `POST /v1/chat/completions`
- **Supported Capabilities**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`, `VISION`, `STREAMING`
- **Authentication**: `Authorization: Bearer <OPENAI_API_KEY>`
- **Fail-Closed**: If `OPENAI_API_KEY` is absent in production, throws `ModelAuthenticationError` before network contact.

### Anthropic Adapter (`AnthropicModelGateway`)
- **Protocol**: REST `POST /v1/messages`
- **Supported Capabilities**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`, `STREAMING`
- **Authentication**: `x-api-key: <ANTHROPIC_API_KEY>`
- **System Instructions**: Automatically mapped to the top-level `system` property of Anthropic messages.

### Ollama Adapter (`OllamaModelGateway`)
- **Protocol**: REST `POST /api/chat`
- **Supported Capabilities**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`
- **Local Resilience**: Gracefully maps connection errors (`ECONNREFUSED`) to `ModelUnavailableError` to trigger fallback without crashing the process.

### Deterministic Stub Adapter (`StubModelGateway`)
- **Role**: Primary adapter for unit, integration, and CI test suites.
- **Characteristics**: 0 network overhead, zero cost, deterministic response payloads, simulates product discovery intents for Tentaciones.

---

## 3. Registering New Adapters

Any new provider can be added by implementing `ModelProviderAdapter` without modifying domain or application logic:

```typescript
import { ModelProviderAdapter } from "./application/ports/model-provider-port.js";

export class CustomProviderAdapter implements ModelProviderAdapter {
  readonly providerId = "custom";
  
  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Custom protocol translation
  }
  
  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    // Return available models
  }
  
  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    // Return capability support
  }
}
```

Register in `ProviderFactory`:
```typescript
providerFactory.registerAdapter(new CustomProviderAdapter());
```
