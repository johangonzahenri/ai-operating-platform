import type { AuditObservationDTO, ExecutionDTO } from "../api/platform-dto.js";

const SENSITIVE_KEY = /(authorization|api[_-]?key|token|secret|password|cookie|credential|header|env|private[_-]?key)/i;

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => safeValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 64).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[redacted]" : safeValue(item, depth + 1),
  ]));
}

function payloadString(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return typeof payload[key] === "string" ? payload[key] as string : undefined;
}

export function projectExecutionObservability(
  execution: ExecutionDTO,
  events: readonly AuditObservationDTO[],
): Pick<ExecutionDTO, "provider" | "model" | "currentRound" | "currentTool" | "toolCalls" | "completedToolCalls" | "toolErrors" | "currentActivity" | "durationMs" | "finalResult" | "toolCallObservations"> {
  const metadata = execution.metadata ?? {};
  const calls = new Map<string, Record<string, unknown>>();
  let provider = typeof metadata.provider === "string" ? metadata.provider : undefined;
  let model = typeof metadata.model === "string" ? metadata.model : undefined;
  let currentRound = typeof metadata.currentRound === "number" ? metadata.currentRound : undefined;
  let currentTool = typeof metadata.currentTool === "string" ? metadata.currentTool : undefined;
  let currentActivity = "Unknown";
  let finalResult = metadata.finalResult && typeof metadata.finalResult === "object"
    ? metadata.finalResult as Readonly<Record<string, unknown>>
    : undefined;

  for (const item of events) {
    const payload = item.payload;
    provider ??= payloadString(payload, "provider");
    model ??= payloadString(payload, "model");
    if (typeof payload.round === "number") currentRound = payload.round;
    const callId = payloadString(payload, "toolCallId");
    const toolName = payloadString(payload, "toolName") ?? payloadString(payload, "toolId");
    if (callId) {
      const current = calls.get(callId) ?? {
        toolCallId: callId,
        toolName: toolName ?? "Unknown",
        round: typeof payload.round === "number" ? payload.round : undefined,
        status: "REQUESTED",
      };
      if (toolName) current.toolName = toolName;
      if (typeof payload.round === "number") current.round = payload.round;
      if (item.type === "model.tool.call.requested") {
        current.status = "REQUESTED";
        current.requestedAt = item.occurredAt;
        if ("arguments" in payload) current.arguments = safeValue(payload.arguments);
        currentActivity = "Model requested tool";
        currentTool = toolName ?? currentTool;
      } else if (item.type === "model.tool.call.authorized") {
        current.status = "AUTHORIZED";
        current.authorizedAt = item.occurredAt;
        currentActivity = "Authorizing tool";
      } else if (item.type === "model.tool.call.rejected") {
        current.status = "REJECTED";
        current.error = safeValue(payload.reason);
        current.completedAt = item.occurredAt;
        currentActivity = "Failed";
      } else if (item.type === "model.tool.result.returned") {
        current.status = payload.success === false ? "FAILED" : "COMPLETED";
        current.completedAt = item.occurredAt;
        if ("result" in payload) current.result = safeValue(payload.result);
        if ("error" in payload) current.error = safeValue(payload.error);
        const start = Date.parse(String(current.startedAt ?? current.requestedAt ?? ""));
        const end = item.occurredAt ? Date.parse(item.occurredAt) : NaN;
        if (Number.isFinite(start) && Number.isFinite(end)) current.durationMs = Math.max(0, end - start);
        currentActivity = current.status === "COMPLETED" ? "Waiting for tool result" : "Failed";
      }
      calls.set(callId, current);
    } else if (item.type === "model.requested") currentActivity = "Waiting for model";
    else if (item.type === "model.final.response") {
      currentActivity = "Completed";
      if (payload.result && typeof payload.result === "object") finalResult = safeValue(payload.result) as Readonly<Record<string, unknown>>;
    } else if (item.type === "model.failed" || item.type === "execution.failed") currentActivity = "Failed";
  }

  const observations = [...calls.values()].map((call) => Object.freeze(call));
  const completedToolCalls = observations.filter((call) => call.status === "COMPLETED").length;
  const toolErrors = observations.filter((call) => call.status === "FAILED" || call.status === "REJECTED").length;
  const start = execution.startedAt ? Date.parse(execution.startedAt) : NaN;
  const end = execution.completedAt ? Date.parse(execution.completedAt) : Date.now();
  const durationMs = Number.isFinite(start) ? Math.max(0, end - start) : undefined;
  if (execution.status === "COMPLETED") currentActivity = "Completed";
  if (execution.status === "FAILED") currentActivity = "Failed";

  return {
    provider,
    model,
    currentRound,
    currentTool,
    toolCalls: observations.length || (typeof metadata.toolCalls === "number" ? metadata.toolCalls : undefined),
    completedToolCalls,
    toolErrors,
    currentActivity,
    durationMs,
    finalResult,
    toolCallObservations: observations,
  };
}
