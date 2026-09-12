# AI OPERATING PLATFORM - PROMPT 31 DELIVERY REPORT

## Auditoría inicial

Prompt 30 had a provider-neutral tool loop, but the second model request
carried `toolResults` without a complete conversation history. Provider
adapters therefore could not reliably reconstruct a real multi-turn protocol.
The existing Registry, Policy, Dispatcher, Runtime, and EventPublisher were
reused.

## Cambios arquitectónicos

- Added neutral `ModelMessage` history for user, assistant/tool-call, and tool
  result turns.
- Core now appends assistant calls and tool observations to that history.
- Added centralized validated `ExecutionLimits`.
- OpenAI translates history to assistant `tool_calls` and `tool` messages.
- Anthropic translates history to assistant `tool_use` and user
  `tool_result` blocks.
- Ollama now uses `/api/chat`, history messages, and function tools.
- Execution Contract fields for rounds/tools/final result are optional and
  backward-compatible.

## Seguridad y errores

The model still only proposes names and arguments. Agent allow-list, registry
schema validation, policy, and dispatcher remain mandatory. Tool timeout,
execution timeout, round/call limits, provider errors, and policy rejection
remain observable through the existing execution lifecycle. Credentials never
enter neutral history, events, DTOs, or Tentaciones.

## Tests

Provider contract tests use fetch doubles and verify tool definitions, IDs,
arguments, assistant history, tool results, and provider-specific protocols.
Core tests verify successful multi-turn observation, final response, trace
propagation, event order, and unknown-tool rejection. No external service or
credential is required.

## Validación

Run `npm run build`, `npm run check`, the focused model-gateway/tool-calling
tests, and Tentaciones `npm test`, `npm run build`, and `npm run check`.
Real-provider and Ollama smoke tests remain explicitly skipped when the
corresponding service or credentials are unavailable.

## Riesgos restantes

Provider-specific streaming and native multi-turn retry semantics are not part
of this milestone. Tool failures are returned as controlled observations;
policy and unknown-tool violations terminate the execution fail-closed.

## Siguiente milestone

Persist conversation history in execution metadata/event projections and add
configurable recovery policies for retryable provider and tool failures.
