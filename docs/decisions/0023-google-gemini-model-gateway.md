# 0023. Google Gemini & Vertex AI Model Gateway Adapter

## Status

Accepted

## Context

Prior to Phase 55 (Prompt 101), the AI Operating Platform provided production adapters for OpenAI (`OpenAIModelGateway`), Anthropic (`AnthropicModelGateway`), and Ollama (`OllamaModelGateway`) in `src/infrastructure/model/`. However, there was no native adapter for the Google Gemini / Vertex AI model family (**GAP-01**).

Applications relying on multimodal reasoning, large context windows (1M+ tokens), or Google Cloud deployment models had to rely on stubs or external middleware.

## Decision

We implement `GeminiModelGateway` in `src/infrastructure/model/gemini/gemini-model-gateway.ts` adhering strictly to hexagonal architecture and the `ModelGateway` / `ModelProviderAdapter` domain contracts:

1. **Native REST Integration**: Connects to the Google Generative Language API (`https://generativelanguage.googleapis.com/v1beta`) with standard payload serialization (`contents`, `parts`, `systemInstruction`, `generationConfig`, `tools`).
2. **Model Catalog**:
   - `gemini-1.5-pro` (2M context window, multimodal, tool calling)
   - `gemini-1.5-flash` (1M context window, fast latency)
   - `gemini-2.0-flash` (1M context window, next-generation)
3. **Capabilities**: Declares full support for `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`, `VISION`, and `STREAMING`.
4. **Structured Output**: Native parsing of JSON responses with `generateStructured`.
5. **Domain Error Mapping**:
   - HTTP 401/403 $\to$ `ModelAuthenticationError`
   - HTTP 429 $\to$ `ModelRateLimitError`
   - HTTP 400 $\to$ `ModelInvalidRequestError`
   - HTTP 503/504 $\to$ `ModelUnavailableError` / `ModelTimeoutError`
6. **Factory Integration**: Registered in `ProviderFactory`, `createDefaultProviderFactory`, and configured via `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_BASE_URL`.

## Consequences

- **GAP-01 is permanently resolved**.
- The platform supports the top 4 AI ecosystems (OpenAI, Anthropic, Ollama, Google Gemini) under an identical unified interface.
- 0 regressions introduced; full deterministic fallback to `StubModelGateway` preserved when unconfigured.
