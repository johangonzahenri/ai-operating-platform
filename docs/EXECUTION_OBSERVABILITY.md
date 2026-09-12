# Execution Observability Projection

Execution observability is a read-only projection at the existing Platform API
boundary. The Core execution state and audited lifecycle events remain the
single source of truth; the projection does not execute tools, authorize
requests, or create a second repository/event store.

## Source and contract

`PlatformService` projects execution metadata and the execution audit timeline
into the existing `ExecutionDTO` returned by:

- `GET /api/platform/v1/executions/:executionId`
- `GET /api/platform/v1/executions/:executionId/events`

Optional fields include provider, model, current round/tool, counts, errors,
current activity, duration, final result, and correlated tool-call
observations. Older executions remain valid because all new fields are
optional.

## Tool lifecycle

The runtime already emits requested, authorized, rejected, result-returned,
model-failed, and final-response events. The projection correlates each call by
`toolCallId`, keeps `toolName` and round, derives duration from event
timestamps, and reports `REQUESTED`, `AUTHORIZED`, `REJECTED`, `COMPLETED`, or
`FAILED`. Tool arguments and results pass through bounded recursive redaction
for credential-like keys before entering the DTO.

## Current activity and duration

Activity is derived from the latest real model/tool/execution event, with
`Unknown` when no safe inference is possible. Duration is
`completedAt - startedAt`, or `now - startedAt` for a running execution. No
visual timer is used as a source of truth.

## Console and security

The Operational Intelligence Console consumes these fields through the
existing platform endpoints. It renders absent values as `Not reported` and
uses safe DOM text APIs. Provider keys, authorization headers, cookies,
environment values, and internal credentials are not exposed to the browser.

## Validation and limits

Deterministic tests cover provider/model absence, lifecycle status, call
correlation, duration, final result, redaction, console contract, and
backward compatibility. Streaming, historical migration of old executions,
and a live provider smoke test are outside this milestone.
