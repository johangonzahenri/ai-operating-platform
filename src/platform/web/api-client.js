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

// ============================================================================
// Team Resource Budget & Quota API (Prompt 103)
// ============================================================================

export async function getTeamBudget(teamId) {
  return request(`/teams/${encodeURIComponent(teamId)}/budget`);
}

export async function createTeamBudget(teamId, data) {
  return request(`/teams/${encodeURIComponent(teamId)}/budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTeamBudget(teamId, data) {
  return request(`/teams/${encodeURIComponent(teamId)}/budget`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function authorizeTeamResourceConsumption(teamId, data) {
  return request(`/teams/${encodeURIComponent(teamId)}/budget/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Reactive Operational Streaming (Prompt 108 / Phase 59)
// ============================================================================

/**
 * Connect to the Server-Sent Events operational stream.
 * @param {Object} [options]
 * @param {string} [options.tenantId]
 * @param {string} [options.agentId]
 * @param {string} [options.executionId]
 * @param {string} [options.traceId]
 * @param {string} [options.eventType]
 * @param {number} [options.lastEventId]
 * @param {Function} [options.onEvent]
 * @param {Function} [options.onError]
 * @param {Function} [options.onOpen]
 * @returns {{ close: Function }}
 */
export function connectEventStream(options = {}) {
  const params = new URLSearchParams();
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.agentId) params.set("agentId", options.agentId);
  if (options.executionId) params.set("executionId", options.executionId);
  if (options.traceId) params.set("traceId", options.traceId);
  if (options.eventType) params.set("eventType", options.eventType);
  if (options.lastEventId !== undefined) params.set("lastEventId", String(options.lastEventId));

  const qs = params.toString();
  const url = `${BASE_PATH}/events/stream${qs ? `?${qs}` : ""}`;

  if (typeof EventSource !== "undefined") {
    const es = new EventSource(url);
    es.onopen = () => {
      options.onOpen?.();
    };
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onEvent?.({ id: e.lastEventId, event: "message", data });
      } catch {
        options.onEvent?.({ id: e.lastEventId, event: "message", data: e.data });
      }
    };
    es.onerror = (err) => {
      options.onError?.(err);
    };
    return {
      close: () => {
        es.close();
      },
    };
  }

  // Fallback: fetch streaming
  let aborted = false;
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;

  (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          ...(options.lastEventId !== undefined ? { "Last-Event-ID": String(options.lastEventId) } : {}),
        },
        signal: ac?.signal,
      });

      if (!res.ok) {
        options.onError?.(new Error(`Event stream connection failed: HTTP ${res.status}`));
        return;
      }

      options.onOpen?.();

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let currentId;
          let currentEvent;
          let currentDataStr = "";

          for (const line of lines) {
            if (line.startsWith("id: ")) currentId = line.substring(4).trim();
            else if (line.startsWith("event: ")) currentEvent = line.substring(7).trim();
            else if (line.startsWith("data: ")) currentDataStr = line.substring(6).trim();
          }

          if (currentDataStr) {
            try {
              const data = JSON.parse(currentDataStr);
              options.onEvent?.({ id: currentId, event: currentEvent, data });
            } catch {
              options.onEvent?.({ id: currentId, event: currentEvent, data: currentDataStr });
            }
          }
        }
      }
    } catch (err) {
      if (!aborted) {
        options.onError?.(err);
      }
    }
  })();

  return {
    close: () => {
      aborted = true;
      ac?.abort();
    },
  };
}

// --- Organizational Agent Coordination (Prompt 109) ---

export async function getTeamCoordinations(teamId, options = {}) {
  const params = new URLSearchParams();
  if (options.limit !== undefined && options.limit !== "") params.set("limit", String(options.limit));
  if (options.offset !== undefined && options.offset !== "") params.set("offset", String(options.offset));
  const qs = params.toString();
  return request(`/teams/${encodeURIComponent(teamId)}/coordinations${qs ? `?${qs}` : ""}`);
}

export async function requestTeamCoordination(teamId, payload) {
  return request(`/teams/${encodeURIComponent(teamId)}/coordinations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getCoordination(id) {
  return request(`/coordinations/${encodeURIComponent(id)}`);
}

// --- Agent Role, Responsibility & Capability Governance (Prompt 110) ---

export async function getAgentProfile(agentId) {
  return request(`/agents/${encodeURIComponent(agentId)}/profile`);
}

export async function createAgentProfile(agentId, profileData) {
  return request(`/agents/${encodeURIComponent(agentId)}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profileData),
  });
}

export async function updateAgentProfile(agentId, patch) {
  return request(`/agents/${encodeURIComponent(agentId)}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function addAgentCapability(agentId, capabilityData) {
  return request(`/agents/${encodeURIComponent(agentId)}/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(capabilityData),
  });
}

export async function removeAgentCapability(agentId, capabilityId, expectedVersion) {
  return request(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: expectedVersion !== undefined ? JSON.stringify({ expectedVersion }) : undefined,
  });
}

export async function verifyAgentCapability(agentId, capabilityId, data = {}) {
  return request(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function disableAgentCapability(agentId, capabilityId, expectedVersion) {
  return request(`/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: expectedVersion !== undefined ? JSON.stringify({ expectedVersion }) : undefined,
  });
}

export async function discoverAgents(criteria = {}) {
  return request("/agents/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(criteria),
  });
}

// --- Workflow Orchestration & Governed Task Assignment (Prompt 111) ---

export async function listWorkflowDefinitions() {
  return request("/workflows");
}

export async function createWorkflowDefinition(def) {
  return request("/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
}

export async function getWorkflowDefinition(id) {
  return request(`/workflows/${encodeURIComponent(id)}`);
}

export async function updateWorkflowDefinition(id, patch) {
  return request(`/workflows/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function activateWorkflowDefinition(id) {
  return request(`/workflows/${encodeURIComponent(id)}/activate`, {
    method: "POST",
  });
}

export async function archiveWorkflowDefinition(id) {
  return request(`/workflows/${encodeURIComponent(id)}/archive`, {
    method: "POST",
  });
}

export async function deleteWorkflowDefinition(id) {
  return request(`/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function startWorkflow(definitionId, options = {}) {
  return request(`/workflows/${encodeURIComponent(definitionId)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
}

export async function listWorkflowInstances(definitionId) {
  if (definitionId) {
    return request(`/workflows/${encodeURIComponent(definitionId)}/instances`);
  }
  return request("/workflows/instances");
}

export async function getWorkflowInstance(instanceId) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}`);
}

export async function advanceWorkflow(instanceId) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/advance`, {
    method: "POST",
  });
}

export async function pauseWorkflow(instanceId, reason) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function resumeWorkflow(instanceId) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/resume`, {
    method: "POST",
  });
}

export async function cancelWorkflow(instanceId, reason) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// --- Workflow Verification & Result Validation (Prompt 112 / Phase 63) ---

export async function verifyWorkflowStep(verifyParams) {
  return request("/verifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyParams),
  });
}

export async function listVerifications(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return request(qs ? `/verifications?${qs}` : "/verifications");
}

export async function getVerification(id) {
  return request(`/verifications/${encodeURIComponent(id)}`);
}

export async function listVerificationsByInstance(instanceId) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/verifications`);
}

export async function listVerificationsByExecution(executionId) {
  return request(`/executions/${encodeURIComponent(executionId)}/verifications`);
}

// --- Human Oversight, Approval & Escalation Governance (Prompt 113 / Phase 64) ---

export async function requestApproval(params) {
  return request("/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function listApprovals(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.status) params.set("status", options.status);
  if (options.workflowInstanceId) params.set("workflowInstanceId", options.workflowInstanceId);
  if (options.workflowStepId) params.set("workflowStepId", options.workflowStepId);
  const qs = params.toString();
  return request(qs ? `/approvals?${qs}` : "/approvals");
}

export async function getApproval(id) {
  return request(`/approvals/${encodeURIComponent(id)}`);
}

export async function startApprovalReview(id, body = {}) {
  return request(`/approvals/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function approveApprovalRequest(id, body = {}) {
  return request(`/approvals/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function rejectApprovalRequest(id, body) {
  return request(`/approvals/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function cancelApprovalRequest(id, body = {}) {
  return request(`/approvals/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function escalateApprovalRequest(id, body) {
  return request(`/approvals/${encodeURIComponent(id)}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listApprovalsByInstance(instanceId) {
  return request(`/workflows/instances/${encodeURIComponent(instanceId)}/approvals`);
}

// --- Agent Lifecycle & Evaluation Governance (Phase 65) ---

export async function getAgentLifecycle(agentId) {
  return request(`/agents/${encodeURIComponent(agentId)}/lifecycle`);
}

export async function activateAgentLifecycle(agentId, body = {}) {
  return request(`/agents/${encodeURIComponent(agentId)}/lifecycle/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function suspendAgentLifecycle(agentId, body) {
  return request(`/agents/${encodeURIComponent(agentId)}/lifecycle/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function revokeAgentLifecycle(agentId, body) {
  return request(`/agents/${encodeURIComponent(agentId)}/lifecycle/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deprecateAgentLifecycle(agentId, body) {
  return request(`/agents/${encodeURIComponent(agentId)}/lifecycle/deprecate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createAgentEvaluation(agentId, body) {
  return request(`/agents/${encodeURIComponent(agentId)}/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listAgentEvaluations(agentId, options = {}) {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  const qs = params.toString();
  return request(qs ? `/agents/${encodeURIComponent(agentId)}/evaluations?${qs}` : `/agents/${encodeURIComponent(agentId)}/evaluations`);
}

export async function getLatestAgentEvaluation(agentId, type = "CAPABILITY_CHECK") {
  return request(`/agents/${encodeURIComponent(agentId)}/evaluations/latest?type=${encodeURIComponent(type)}`);
}

export async function checkAgentEligibility(agentId, options = {}) {
  const params = new URLSearchParams();
  if (options.requiredCapability) params.set("requiredCapability", options.requiredCapability);
  if (options.requireVerifiedCapability) params.set("requireVerifiedCapability", "true");
  const qs = params.toString();
  return request(qs ? `/agents/${encodeURIComponent(agentId)}/eligibility?${qs}` : `/agents/${encodeURIComponent(agentId)}/eligibility`);
}

// --- AI Solutions Factory & Blueprint Governance (Phase 66) ---

export async function createSolution(body) {
  return request("/solutions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listSolutions(options = {}) {
  const params = new URLSearchParams();
  if (options.lifecycleState) params.set("lifecycleState", options.lifecycleState);
  if (options.ownerPrincipalId) params.set("ownerPrincipalId", options.ownerPrincipalId);
  if (options.search) params.set("search", options.search);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  const qs = params.toString();
  return request(qs ? `/solutions?${qs}` : "/solutions");
}

export async function getSolution(solutionId) {
  return request(`/solutions/${encodeURIComponent(solutionId)}`);
}

export async function updateSolution(solutionId, body) {
  return request(`/solutions/${encodeURIComponent(solutionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function validateSolution(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function publishSolution(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createSolutionVersion(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listSolutionVersions(solutionId) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/versions`);
}

export async function getSolutionVersion(solutionId, version) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/versions/${encodeURIComponent(version)}`);
}

export async function getSolutionBlueprint(solutionId) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/blueprint`);
}

export async function archiveSolution(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deprecateSolution(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/deprecate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function instantiateSolution(solutionId, body = {}) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/instantiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listSolutionInstances(solutionId) {
  return request(`/solutions/${encodeURIComponent(solutionId)}/instances`);
}

// ============================================================================
// AI Enterprise Operating System & Executive Governance API (Prompt 116 / Phase 67)
// ============================================================================

export async function createEnterprise(data) {
  return request("/business/enterprises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getEnterprise(enterpriseId) {
  return request(`/business/enterprises/${encodeURIComponent(enterpriseId)}`);
}

export async function listEnterprises() {
  return request("/business/enterprises");
}

export async function updateEnterprise(enterpriseId, data) {
  return request(`/business/enterprises/${encodeURIComponent(enterpriseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createBusinessObjective(data) {
  return request("/business/objectives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getBusinessObjective(objectiveId) {
  return request(`/business/objectives/${encodeURIComponent(objectiveId)}`);
}

export async function listBusinessObjectives(enterpriseId) {
  const query = enterpriseId ? `?enterpriseId=${encodeURIComponent(enterpriseId)}` : "";
  return request(`/business/objectives${query}`);
}

export async function transitionBusinessObjectiveStatus(objectiveId, data) {
  return request(`/business/objectives/${encodeURIComponent(objectiveId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createBusinessInitiative(data) {
  return request("/business/initiatives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getBusinessInitiative(initiativeId) {
  return request(`/business/initiatives/${encodeURIComponent(initiativeId)}`);
}

export async function listBusinessInitiatives(objectiveId) {
  const query = objectiveId ? `?objectiveId=${encodeURIComponent(objectiveId)}` : "";
  return request(`/business/initiatives${query}`);
}

export async function transitionBusinessInitiativeStatus(initiativeId, data) {
  return request(`/business/initiatives/${encodeURIComponent(initiativeId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createBusinessMetric(data) {
  return request("/business/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getBusinessMetric(metricId) {
  return request(`/business/metrics/${encodeURIComponent(metricId)}`);
}

export async function listBusinessMetrics(enterpriseId) {
  const query = enterpriseId ? `?enterpriseId=${encodeURIComponent(enterpriseId)}` : "";
  return request(`/business/metrics${query}`);
}

export async function recordBusinessMetricMeasurement(metricId, data) {
  return request(`/business/metrics/${encodeURIComponent(metricId)}/measurements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function createExecutiveDecision(data) {
  return request("/business/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getExecutiveDecision(decisionId) {
  return request(`/business/decisions/${encodeURIComponent(decisionId)}`);
}

export async function listExecutiveDecisions(enterpriseId) {
  const query = enterpriseId ? `?enterpriseId=${encodeURIComponent(enterpriseId)}` : "";
  return request(`/business/decisions${query}`);
}

export async function getBusinessOperatingContext() {
  return request("/business/context");
}

// ============================================================================
// Executive Orchestrator & Closed-Loop Operations API (Prompt 117 / Phase 68)
// ============================================================================

export async function startExecutiveCycle(data) {
  return request("/executive/cycles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listExecutiveCycles(enterpriseId) {
  const query = enterpriseId ? `?enterpriseId=${encodeURIComponent(enterpriseId)}` : "";
  return request(`/executive/cycles${query}`);
}

export async function getExecutiveCycle(cycleId) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}`);
}

export async function getExecutiveCycleContext(cycleId) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/context`);
}

export async function getExecutiveCycleAnalysis(cycleId) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/analysis`);
}

export async function getExecutiveCyclePlan(cycleId) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/plan`);
}

export async function approveExecutivePlan(cycleId, data) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function executeExecutivePlanAction(cycleId, data) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/execute-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function reassessExecutiveCycle(cycleId, data) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/reassess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function completeExecutiveCycle(cycleId) {
  return request(`/executive/cycles/${encodeURIComponent(cycleId)}/complete`, {
    method: "POST",
  });
}

// --- Autonomous Operations Runtime & Continuous Governance (Phase 69) ---

export async function getAutonomousRuntimeState() {
  return request("/autonomous/runtime");
}

export async function startAutonomousRuntime() {
  return request("/autonomous/runtime/start", {
    method: "POST",
  });
}

export async function stopAutonomousRuntime() {
  return request("/autonomous/runtime/stop", {
    method: "POST",
  });
}

export async function pauseAutonomousRuntime() {
  return request("/autonomous/runtime/pause", {
    method: "POST",
  });
}

export async function resumeAutonomousRuntime() {
  return request("/autonomous/runtime/resume", {
    method: "POST",
  });
}

export async function listAutonomousTriggers(enterpriseId) {
  const query = enterpriseId ? `?enterpriseId=${encodeURIComponent(enterpriseId)}` : "";
  return request(`/autonomous/triggers${query}`);
}

export async function createAutonomousTrigger(data) {
  return request("/autonomous/triggers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function enableAutonomousTrigger(triggerId) {
  return request(`/autonomous/triggers/${encodeURIComponent(triggerId)}/enable`, {
    method: "POST",
  });
}

export async function disableAutonomousTrigger(triggerId) {
  return request(`/autonomous/triggers/${encodeURIComponent(triggerId)}/disable`, {
    method: "POST",
  });
}

export async function fireAutonomousTrigger(triggerId) {
  return request(`/autonomous/triggers/${encodeURIComponent(triggerId)}/fire`, {
    method: "POST",
  });
}

export async function getCredentials(options = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.principalId) params.set("principalId", options.principalId);
  if (options.applicationId) params.set("applicationId", options.applicationId);
  const qs = params.toString();
  return request(qs ? `/credentials?${qs}` : "/credentials");
}

export async function getCredential(id) {
  return request(`/credentials/${encodeURIComponent(id)}`);
}

export async function createCredential(data) {
  return request("/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function rotateCredential(id, data = {}) {
  return request(`/credentials/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function revokeCredential(id, data = {}) {
  return request(`/credentials/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteCredential(id) {
  return request(`/credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Enterprise Network Topology & Secure API Exposure (Phase 72) ---

export async function getNetworkDiagnostics() {
  return request("/diagnostics/network");
}

// --- Multi-Enterprise Governance & Portfolio Operating Model (Prompt 122 - Phase 75) ---

export async function getPortfolios() {
  return request("/portfolios");
}

export async function getPortfolio(id) {
  return request(`/portfolios/${encodeURIComponent(id)}`);
}

export async function createPortfolio(data) {
  return request("/portfolios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function addEnterpriseToPortfolio(portfolioId, data) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}/enterprises`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function removeEnterpriseFromPortfolio(portfolioId, enterpriseId) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}/enterprises/${encodeURIComponent(enterpriseId)}`, {
    method: "DELETE",
  });
}

export async function getPortfolioOperatingContext(portfolioId) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}/context`);
}

export async function grantMandate(data) {
  return request("/portfolios/mandates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getPortfolioMandates(portfolioId) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}/mandates`);
}

export async function revokeMandate(mandateId, data = {}) {
  return request(`/mandates/${encodeURIComponent(mandateId)}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function validateCrossEnterpriseAuthority(data) {
  return request("/portfolios/validate-authority", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getPortfolioObjectives(portfolioId) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}/objectives`);
}

export async function createPortfolioObjective(data) {
  return request("/portfolios/objectives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function activatePortfolioObjective(objectiveId) {
  return request(`/portfolio-objectives/${encodeURIComponent(objectiveId)}/activate`, {
    method: "POST",
  });
}

export async function linkEnterpriseObjective(portfolioObjectiveId, data) {
  return request(`/portfolio-objectives/${encodeURIComponent(portfolioObjectiveId)}/link-enterprise-objective`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function aggregatePortfolioMetrics(objectiveId, data = {}) {
  return request(`/portfolio-objectives/${encodeURIComponent(objectiveId)}/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Governed Mandate Reconciliation (Phase 77) ---

export async function reconcileMandate(mandateId, data = {}) {
  return request(`/mandates/${encodeURIComponent(mandateId)}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function reconcileExpiredMandates(data = {}) {
  return request("/mandates/reconcile-expired", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Governance & Compliance Evidence Export (Phase 78) ---

export async function exportEvidence(data = {}) {
  return request("/governance/evidence/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

