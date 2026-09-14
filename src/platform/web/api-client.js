/**
 * Platform API Client for Web Platform Control Plane.
 * Communicates strictly via HTTP REST contracts (/api/v1).
 * Zero internal imports from domain, application, or infrastructure.
 */

const BASE_PATH = "/api/v1";
const PLATFORM_BASE_PATH = "/api/platform/v1";

async function request(path, options = {}, basePath = BASE_PATH) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${basePath}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data?.error || `HTTP ${response.status}: ${response.statusText}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function platformRequest(path, options = {}) {
  return request(path, options, PLATFORM_BASE_PATH);
}

export async function getPlatformHealth() {
  return platformRequest("/health");
}

export async function getPlatformAgents() {
  return platformRequest("/agents");
}

export async function createPlatformTask(agentId, objective, traceId) {
  return platformRequest("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, input: { objective }, ...(traceId ? { traceId } : {}) }),
  });
}

export async function executePlatformTask(taskId) {
  return platformRequest(`/tasks/${encodeURIComponent(taskId)}/execute`, { method: "POST" });
}

export async function getPlatformExecution(executionId) {
  return platformRequest(`/executions/${encodeURIComponent(executionId)}`);
}

export async function getPlatformExecutionEvents(executionId) {
  return platformRequest(`/executions/${encodeURIComponent(executionId)}/events`);
}

export async function getStatus() {
  return request("/status");
}

export async function getHealth() {
  return request("/health");
}

export async function getEvents(options = {}) {
  const params = new URLSearchParams();
  if (options.limit !== undefined && options.limit !== "") params.set("limit", String(options.limit));
  if (options.afterSequence !== undefined && options.afterSequence !== "") params.set("afterSequence", String(options.afterSequence));
  if (options.beforeSequence !== undefined && options.beforeSequence !== "") params.set("beforeSequence", String(options.beforeSequence));
  if (options.taskId) params.set("taskId", options.taskId);
  if (options.executionId) params.set("executionId", options.executionId);
  if (options.agentId) params.set("agentId", options.agentId);
  if (options.traceId) params.set("traceId", options.traceId);
  if (options.correlationId) params.set("correlationId", options.correlationId);
  if (options.eventType) params.set("eventType", options.eventType);
  if (options.aggregateType) params.set("aggregateType", options.aggregateType);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);

  const qs = params.toString();
  return request(qs ? `/events?${qs}` : "/events");
}

export async function getEvent(id) {
  return request(`/events/${encodeURIComponent(id)}`);
}

export async function getExecutions() {
  return request("/executions");
}

export async function getExecution(id) {
  return request(`/executions/${encodeURIComponent(id)}`);
}

export async function getExecutionTimeline(id) {
  return request(`/executions/${encodeURIComponent(id)}/timeline`);
}

export async function getModels() {
  return request("/models");
}

export async function getModel(id) {
  return request(`/models/${encodeURIComponent(id)}`);
}

export async function getTools() {
  return request("/tools");
}

export async function getTool(id) {
  return request(`/tools/${encodeURIComponent(id)}`);
}

export async function getMetrics() {
  return request("/metrics");
}

export async function getAuditLogs(options = {}) {
  const params = new URLSearchParams();
  if (options.executionId) params.set("executionId", options.executionId);
  const qs = params.toString();
  return request(qs ? `/audit?${qs}` : "/audit");
}


export async function getAgents() {
  return request("/agents");
}

export async function getAgent(id) {
  return request(`/agents/${encodeURIComponent(id)}`);
}

export async function createAgent(data) {
  return request("/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateAgent(id, data) {
  return request(`/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function activateAgent(id) {
  return request(`/agents/${encodeURIComponent(id)}/activate`, {
    method: "POST",
  });
}

export async function deactivateAgent(id) {
  return request(`/agents/${encodeURIComponent(id)}/deactivate`, {
    method: "POST",
  });
}

export async function executeAgent(id, input, traceId) {
  return request(`/agents/${encodeURIComponent(id)}/executions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, traceId }),
  });
}

export async function submitExecution(agentId, input, traceId) {
  return request("/executions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, input, traceId }),
  });
}

export async function submitOrchestration(operations, traceId) {
  return request("/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations, traceId }),
  });
}

export async function getOperations() {
  return request("/operations");
}

export async function getOperation(id) {
  return request(`/operations/${encodeURIComponent(id)}`);
}

export async function createOperation(data) {
  return request("/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function cancelOperation(id, reason) {
  return request(`/operations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function getCrashRecoveryHistory() {
  return request("/diagnostics/recovery/history");
}

export async function getTraceDiagnostics(traceId) {
  return request(`/diagnostics/traces/${encodeURIComponent(traceId)}`);
}

export async function getTaskDiagnostics(taskId) {
  return request(`/diagnostics/tasks/${encodeURIComponent(taskId)}/timeline`);
}

export async function getTasks() {
  return request("/tasks");
}

export async function getTask(id) {
  return request(`/tasks/${encodeURIComponent(id)}`);
}
