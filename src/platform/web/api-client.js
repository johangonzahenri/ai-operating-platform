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

export async function getTasks(options = {}) {
  const params = new URLSearchParams();
  if (options.limit !== undefined && options.limit !== "") params.set("limit", String(options.limit));
  if (options.offset !== undefined && options.offset !== "") params.set("offset", String(options.offset));
  if (options.agentId) params.set("agentId", options.agentId);
  if (options.status) params.set("status", options.status);
  const qs = params.toString();
  return request(qs ? `/tasks?${qs}` : "/tasks");
}

export async function getTask(id) {
  return request(`/tasks/${encodeURIComponent(id)}`);
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

export async function cancelPlatformTask(taskId, reason) {
  return platformRequest(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function cancelTask(taskId, reason) {
  return request(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function getApplications() {
  return request("/applications");
}

export async function getApplication(id) {
  return request(`/applications/${encodeURIComponent(id)}`);
}

// --- SaaS Control Plane & Tenant API Methods (Prompt 82) ---

export async function getTenants() {
  return request("/tenants");
}

export async function getTenant(id) {
  return request(`/tenants/${encodeURIComponent(id)}`);
}

export async function getTenantDashboard(id) {
  return request(`/tenants/${encodeURIComponent(id)}/dashboard`);
}

export async function getUsageSummary() {
  return request("/usage");
}

export async function getCapabilities() {
  return request("/capabilities");
}

export async function getGovernancePolicies() {
  return request("/governance/policies");
}

export async function getGovernanceApplications() {
  return request("/governance/applications");
}

export async function getGovernanceAuditTrail() {
  return request("/governance/audit");
}

// --- Integrations & Truth API Methods (Prompt 85 & 87) ---

export async function getIntegrations() {
  return request("/integrations");
}

export async function getIntegration(id) {
  return request(`/integrations/${encodeURIComponent(id)}`);
}

export async function verifyIntegration(id) {
  return request(`/integrations/${encodeURIComponent(id)}/verify`, {
    method: "POST",
  });
}

export async function verifyAllIntegrations() {
  return request("/integrations/verify-all", {
    method: "POST",
  });
}

export async function resetDemo() {
  return request("/demo/reset", {
    method: "POST",
  });
}

// --- Application Factory & Ecosystem API Methods (Prompts 91-93) ---

export async function getApplicationAnalytics(id) {
  return request(`/applications/${encodeURIComponent(id)}/analytics`);
}

export async function updateApplicationLifecycle(id, state, reason) {
  return request(`/applications/${encodeURIComponent(id)}/lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, reason }),
  });
}

export async function generateApplication(input) {
  return request("/factory/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function validateApplication(manifest, tenantId) {
  return request("/factory/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest, tenantId }),
  });
}

export async function registerApplication(manifest, tenantId) {
  return request("/factory/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest, tenantId }),
  });
}

// --- Enterprise Observability & Diagnostics (Prompt 98) ---

export async function getLiveness() {
  return request("/health/live");
}

export async function getReadiness() {
  return request("/health/ready");
}

export async function getDiagnostics() {
  return request("/diagnostics");
}

export async function getObservabilityMetrics() {
  return request("/observability/metrics");
}

export async function getObservabilityLogs(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.level) params.set("level", options.level);
  const qs = params.toString();
  return request(qs ? `/observability/logs?${qs}` : "/observability/logs");
}

export async function getObservabilityDependencies() {
  return request("/observability/dependencies");
}

// --- Document Generation (Prompt 98) ---

export async function generateDocument(input) {
  return request("/documents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// --- Business Devices & Print Operations (Prompt 98) ---

export async function getDevices(options = {}) {
  const params = new URLSearchParams();
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.type) params.set("type", options.type);
  if (options.status) params.set("status", options.status);
  const qs = params.toString();
  return request(qs ? `/devices?${qs}` : "/devices");
}

export async function getDevice(id) {
  return request(`/devices/${encodeURIComponent(id)}`);
}

export async function registerDevice(deviceData) {
  return request("/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deviceData),
  });
}

export async function updateDevice(id, patch) {
  return request(`/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function unregisterDevice(id) {
  return request(`/devices/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getDeviceHealth(id) {
  return request(`/devices/${encodeURIComponent(id)}/health`);
}

export async function getDeviceCapabilities(id) {
  return request(`/devices/${encodeURIComponent(id)}/capabilities`);
}

export async function getDeviceStatus(id) {
  return request(`/devices/${encodeURIComponent(id)}/status`);
}

export async function getDeviceConsumables(id) {
  return request(`/devices/${encodeURIComponent(id)}/consumables`);
}

export async function submitPrintJob(deviceId, input, idempotencyKey) {
  const headers = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return request(`/devices/${encodeURIComponent(deviceId)}/print-jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}

export async function getPrintJobs(deviceId) {
  return request(`/devices/${encodeURIComponent(deviceId)}/print-jobs`);
}

export async function getPrintJob(deviceId, jobId) {
  return request(`/devices/${encodeURIComponent(deviceId)}/print-jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelPrintJob(deviceId, jobId, reason) {
  return request(`/devices/${encodeURIComponent(deviceId)}/print-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// ============================================================================
// Virtual Organization & Teams API (Prompt 102)
// Strictly routed via /api/v1/*
// ============================================================================

export async function getOrganizations() {
  return request("/organizations");
}

export async function getOrganization(id) {
  return request(`/organizations/${encodeURIComponent(id)}`);
}

export async function createOrganization(data) {
  return request("/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(id, data) {
  return request(`/organizations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getOrganizationAreas(orgId) {
  return request(`/organizations/${encodeURIComponent(orgId)}/areas`);
}

export async function createArea(orgId, data) {
  return request(`/organizations/${encodeURIComponent(orgId)}/areas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getArea(areaId) {
  return request(`/areas/${encodeURIComponent(areaId)}`);
}

export async function getAreaTeams(areaId) {
  return request(`/areas/${encodeURIComponent(areaId)}/teams`);
}

export async function createTeam(areaId, data) {
  return request(`/areas/${encodeURIComponent(areaId)}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getTeam(teamId) {
  return request(`/teams/${encodeURIComponent(teamId)}`);
}

export async function getTeamAgents(teamId) {
  return request(`/teams/${encodeURIComponent(teamId)}/agents`);
}

export async function assignAgentToTeam(teamId, data) {
  return request(`/teams/${encodeURIComponent(teamId)}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function removeAgentFromTeam(teamId, agentId) {
  return request(`/teams/${encodeURIComponent(teamId)}/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
}

export async function getOrganizationHierarchy(orgId) {
  return request(`/organizations/${encodeURIComponent(orgId)}/hierarchy`);
}
