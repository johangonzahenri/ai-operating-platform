# PROMPT 33 DELIVERY REPORT

## 1. Auditoría inicial

The existing runtime already persisted provider/model metadata and emitted
model/tool lifecycle events. Execution repositories exposed timestamps and
result metadata; the Platform API returned those records, but the execution
contract did not project them consistently. Prompt 32's console therefore
could not safely display tool-call details.

## 2. Fuente de verdad

No second observability architecture was introduced. The projection combines
the existing execution projection (`startedAt`, `completedAt`, status, result
metadata) with existing audit observations for the same execution. The runtime
remains authoritative.

## 3. Cambios realizados

- Extended `ExecutionDTO` and `ExecutionContract` with optional operational
  fields.
- Added `execution-observability.ts` as a pure read-only projection.
- Enriched existing execution API responses; no parallel endpoint was added.
- Added tool-call arguments/results to existing model tool events.
- Added final result to existing final-response/runtime metadata.
- Added bounded recursive redaction for credential-like keys.
- Updated the Prompt 32 console with current activity and real tool-call cards.
- Added deterministic projection and console contract tests.
- Added `EXECUTION_OBSERVABILITY.md`.

## 4. Observability behavior

Provider/model are taken from real metadata/events and remain absent when not
available. Current round/tool, statuses, call IDs, duration, errors, final
result, and current activity are derived from the correlated execution
timeline. Duration uses real timestamps.

## 5. Security

The projection redacts API keys, authorization, tokens, secrets, passwords,
cookies, credentials, headers, environment values, and private-key-like
fields. The browser continues to use `textContent`; it never calls a model
provider directly.

## 6. Tests and validation

- Focused Prompt 33 tests: 7/7 PASS.
- `npm run build`: PASS after the final changes.
- `npm run check`: PASS after the final projection changes.
- `npm run build`: PASS.
- Tentaciones `npm test`: PASS.
- Tentaciones `npm run build`: PASS.
- Tentaciones `npm run check`: PASS.
- `git diff --check`: PASS.

No successful detached HTTP smoke test is claimed; the environment terminated
the server process before it opened its port.

## 7. Limitaciones y riesgos

Historical events emitted before tool arguments/results were added cannot
reconstruct fields that were never persisted. Tool execution start/completion
events do not carry a tool-call ID in the legacy dispatcher, so call duration
uses the correlated model result timestamps. Streaming provider telemetry is
not part of this milestone.

## 8. Próximo milestone

Add a versioned execution-observability schema and persist explicit tool-call
correlation in the existing event payloads for all legacy dispatcher paths,
without introducing another store.
