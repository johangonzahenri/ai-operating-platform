# Model Gateway Architecture Reference

## 1. Overview

The `ModelGateway` is the exclusive point of entry for the AI Operating Platform Core Engine to request model inference. It completely shields domain logic, task execution strategies, and agents from knowing:
- What provider is handling the request (OpenAI, Anthropic, Ollama, local models).
- How the provider's HTTP payload or authentication headers are formed.
- What SDK or network library is used.
- How internal vendor error codes are structured.

```text
                ┌─────────────────┐
                │   Core Runtime  │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   Model Router  │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │  Model Gateway  │
                └───────┬─────────┘
                        │
         ┌──────────────┼──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
    OpenAI Adapter Anthropic Adapter Ollama Adapter Stub Adapter
         │              │              │              │
         ▼              ▼              ▼              ▼
       OpenAI        Anthropic       Ollama       Deterministic
```

---

## 2. Core Contracts

### `ModelCapability`
Explicit capabilities queried prior to execution:
- `TEXT_GENERATION`: Standard text completion / conversation.
- `STRUCTURED_OUTPUT`: Reliable JSON object generation conforming to schema.
- `TOOL_CALLING`: Function calling / tool dispatching.
- `VISION`: Multimodal image processing.
- `EMBEDDINGS`: Vector embeddings.
- `STREAMING`: Incremental token delivery.

Pre-execution check:
```typescript
const isSupported = await gateway.supports(modelId, "STRUCTURED_OUTPUT");
if (!isSupported) throw new ModelCapabilityUnsupportedError(modelId, "STRUCTURED_OUTPUT");
```

### `ModelRouter`
Evaluates incoming requests and determines the target model and provider:
1. Resolves model definition and provider.
2. Evaluates `SecurityBoundaryEnforcer` against the caller's `SecurityContext`.
3. Verifies required capabilities.
4. Generates an authorized fallback chain.

### `DefaultModelGateway`
Coordinates execution with:
- **Request Validation**: Enforces trace ID, non-empty model, valid input, and bounded payload size (1MB limit).
- **Bounded Retries**: Transient errors (`ModelRateLimitError`, `ModelTimeoutError`, `ModelUnavailableError`) retry with exponential backoff up to `maxRetries`. Authentication and validation errors fail immediately.
- **Controlled Fallback**: If the primary provider fails due to network/outage, the gateway attempts allowed fallback providers in sequence.
- **Structured Output Validation**: `generateStructured(request, schema)` parses JSON safely, checks required schema properties, and returns strongly-typed results. Untrusted model responses cannot bypass system boundaries.

---

## 3. Provider Error Normalization

Provider adapters translate vendor-specific HTTP error codes into standardized platform exceptions:

| Platform Error | Code | Retry Eligible? | Description |
|---|---|:---:|---|
| `ModelValidationError` | `MODEL_INVALID_REQUEST` | No | Malformed request, missing field, or payload exceeded |
| `ModelAuthenticationError` | `MODEL_AUTHENTICATION_ERROR` | No | Invalid or missing API credentials |
| `ModelRateLimitError` | `MODEL_RATE_LIMIT_ERROR` | Yes | HTTP 429 rate limit exceeded |
| `ModelTimeoutError` | `MODEL_TIMEOUT_ERROR` | Yes | Request exceeded client timeout |
| `ModelUnavailableError` | `MODEL_UNAVAILABLE` | Yes | Provider unreachable, 503, or connection failure |
| `ModelStructuredOutputError` | `OUTPUT_INVALID` | No | Model produced invalid JSON or failed schema validation |
| `ModelCapabilityUnsupportedError` | `CAPABILITY_UNSUPPORTED` | No | Requested capability not offered by selected model |

---

## 4. Security & Isolation Invariants

1. **RBAC Enforcement**: Model invocation requires `model.invoke` permission verified via `SecurityBoundaryEnforcer`.
2. **Model Allowlist**: Principals and agents are restricted to configured model allowlists.
3. **Zero Secret Leakage**: API keys and auth headers are never logged, persisted to SQLite, or returned in task events.
4. **Offline Tests**: All unit and integration test suites run strictly offline using deterministic stubs or mocked fetch functions.
