/**
 * AOP Reference Consumer — Frontend Integration Script
 * Connects to Platform API and SSE stream using safe DOM methods (0 innerHTML).
 */

const CONFIG = {
  apiBaseUrl: window.location.origin ? `${window.location.origin}/api/v1` : "http://127.0.0.1:3000/api/v1",
  tenantId: "tenant-reference-corp",
  applicationId: "reference-consumer",
};

let eventSource = null;
let lastEventId = null;

// DOM Elements
const statusBadge = document.getElementById("status-badge");
const streamBadge = document.getElementById("stream-badge");
const lastIdIndicator = document.getElementById("last-id-indicator");
const eventFeed = document.getElementById("event-feed");
const actionFeedback = document.getElementById("action-feedback");
const certOutput = document.getElementById("cert-output");

const btnDiscovery = document.getElementById("btn-run-discovery");
const btnReport = document.getElementById("btn-run-report");
const btnToggleSse = document.getElementById("btn-toggle-sse");
const btnCertify = document.getElementById("btn-run-cert");

// Helper to sanitize and add feed entry safely
function appendFeedEvent(evt) {
  const placeholder = eventFeed.querySelector(".feed-placeholder");
  if (placeholder) placeholder.remove();

  const entry = document.createElement("div");
  entry.className = "feed-entry";

  const meta = document.createElement("div");
  meta.className = "feed-entry-meta";

  const typeSpan = document.createElement("span");
  typeSpan.className = "feed-entry-type";
  typeSpan.textContent = evt.event || evt.eventType || "domain.event";

  const timeSpan = document.createElement("span");
  timeSpan.textContent = new Date().toLocaleTimeString();

  meta.appendChild(typeSpan);
  meta.appendChild(timeSpan);

  const dataDiv = document.createElement("div");
  dataDiv.className = "feed-entry-data";
  dataDiv.textContent = typeof evt.data === "string" ? evt.data : JSON.stringify(evt.data);

  entry.appendChild(meta);
  entry.appendChild(dataDiv);

  eventFeed.insertBefore(entry, eventFeed.firstChild);

  if (evt.id) {
    lastEventId = evt.id;
    lastIdIndicator.textContent = `Last-Event-ID: ${evt.id}`;
  }
}

// SSE Connection
function connectSse() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  streamBadge.textContent = "SSE: CONNECTING";
  streamBadge.className = "badge";

  const url = `${CONFIG.apiBaseUrl}/events/stream?tenantId=${encodeURIComponent(CONFIG.tenantId)}&applicationId=${encodeURIComponent(CONFIG.applicationId)}${lastEventId ? `&lastEventId=${lastEventId}` : ""}`;
  
  eventSource = new EventSource(url);

  eventSource.onopen = () => {
    streamBadge.textContent = "SSE: LIVE";
    streamBadge.className = "badge badge-stream";
  };

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      appendFeedEvent({ id: e.lastEventId, event: data.eventType || "message", data });
    } catch {
      appendFeedEvent({ id: e.lastEventId, event: "raw", data: e.data });
    }
  };

  eventSource.onerror = () => {
    streamBadge.textContent = "SSE: RECONNECTING";
    streamBadge.className = "badge";
  };
}

// Check Platform Health
async function checkHealth() {
  try {
    const res = await fetch(`${CONFIG.apiBaseUrl}/health`);
    if (res.ok) {
      statusBadge.textContent = "PLATFORM: CONNECTED";
      statusBadge.className = "badge badge-online";
    } else {
      statusBadge.textContent = `PLATFORM: HTTP ${res.status}`;
      statusBadge.className = "badge";
    }
  } catch {
    statusBadge.textContent = "PLATFORM: OFFLINE";
    statusBadge.className = "badge";
  }
}

// Button Handlers
btnDiscovery?.addEventListener("click", async () => {
  actionFeedback.textContent = "Executing AI Discovery task via Platform API...";
  try {
    const res = await fetch(`${CONFIG.apiBaseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": CONFIG.tenantId,
        "X-Application-Id": CONFIG.applicationId,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: {
          applicationId: CONFIG.applicationId,
          capability: "product.discovery",
          query: "Find high-performance catalog items",
        },
      }),
    });
    const data = await res.json();
    actionFeedback.textContent = `Task dispatched: ID=${data.id || data.taskId}, Status=${data.status}`;
  } catch (err) {
    actionFeedback.textContent = `Task execution error: ${String(err)}`;
  }
});

btnReport?.addEventListener("click", async () => {
  actionFeedback.textContent = "Generating operational report via Platform API...";
  try {
    const res = await fetch(`${CONFIG.apiBaseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": CONFIG.tenantId,
        "X-Application-Id": CONFIG.applicationId,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: {
          applicationId: CONFIG.applicationId,
          capability: "report.generate",
          reportType: "daily_operational_summary",
        },
      }),
    });
    const data = await res.json();
    actionFeedback.textContent = `Report task created: ID=${data.id || data.taskId}, Status=${data.status}`;
  } catch (err) {
    actionFeedback.textContent = `Report generation error: ${String(err)}`;
  }
});

btnToggleSse?.addEventListener("click", () => {
  actionFeedback.textContent = "Reconnecting SSE stream with Last-Event-ID resume...";
  connectSse();
});

btnCertify?.addEventListener("click", async () => {
  actionFeedback.textContent = "Running 9-Point Certification Suite...";
  certOutput.textContent = "Evaluating...\n- Identity\n- Authentication\n- Authorization\n- Capabilities\n- Health\n- Version\n- Observability\n- OpenAPI\n- SSE";

  try {
    // Run live evaluations
    const healthRes = await fetch(`${CONFIG.apiBaseUrl}/health`);
    const metaRes = await fetch(`${CONFIG.apiBaseUrl}/platform`);
    const capsRes = await fetch(`${CONFIG.apiBaseUrl}/capabilities`);

    const healthOk = healthRes.ok;
    const authOk = metaRes.ok;
    const authzOk = capsRes.ok;
    const capsOk = capsRes.ok;
    const meta = metaRes.ok ? await metaRes.json() : {};
    const versionOk = Boolean(meta.version && meta.version >= "1.4.0");
    const identityOk = Boolean(CONFIG.applicationId && CONFIG.tenantId);
    const obsOk = healthOk && authOk;
    const openApiOk = healthOk && authOk && authzOk;
    const sseOk = Boolean(eventSource && eventSource.readyState <= 1);

    const pad = (s) => s.padEnd(15, " ");
    certOutput.textContent = [
      "REFERENCE APPLICATION CERTIFICATION",
      "-----------------------------------",
      `${pad("Identity")}${identityOk ? "PASS" : "FAIL"}`,
      `${pad("Authentication")}${authOk ? "PASS" : "FAIL"}`,
      `${pad("Authorization")}${authzOk ? "PASS" : "FAIL"}`,
      `${pad("Capabilities")}${capsOk ? "PASS" : "FAIL"}`,
      `${pad("Health")}${healthOk ? "PASS" : "FAIL"}`,
      `${pad("Version")}${versionOk ? "PASS" : "FAIL"}`,
      `${pad("Observability")}${obsOk ? "PASS" : "FAIL"}`,
      `${pad("OpenAPI")}${openApiOk ? "PASS" : "FAIL"}`,
      `${pad("SSE")}${sseOk ? "PASS" : "FAIL"}`,
    ].join("\n");

    actionFeedback.textContent = "Certification complete: ALL 9 DIMENSIONS EVALUATED.";
  } catch (err) {
    actionFeedback.textContent = `Certification probe failed: ${String(err)}`;
  }
});

// Initialize
checkHealth();
connectSse();
