/**
 * Platform API Client for Web Platform Control Plane.
 * Communicates strictly via HTTP REST contracts (/api/v1).
 * Zero internal imports from domain, application, or infrastructure.
 */

const BASE_PATH = "/api/v1";

async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_PATH}${path}`, {
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

export async function getStatus() {
  return request("/status");
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

export async function getAuditLogs() {
  return request("/audit");
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
