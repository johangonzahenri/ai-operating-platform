// Web Platform Client Application
const API_BASE = window.location.origin;

// Scenarios for Playground
const SCENARIOS = {
  calculator_then_model: {
    operations: [
      {
        kind: "TOOL",
        id: "op-calc",
        toolId: "calculator",
        input: { left: 40, right: 2 }
      },
      {
        kind: "MODEL",
        id: "op-summarize",
        model: "stub-model",
        input: { prompt: "Summarize the computation result:" },
        bindings: [
          { targetKey: "computed", operationId: "op-calc", sourceKey: "value" }
        ]
      }
    ]
  },
  model_then_tool: {
    operations: [
      {
        kind: "MODEL",
        id: "op-think",
        model: "stub-model",
        input: { prompt: "Find input parameters for math operation" }
      },
      {
        kind: "TOOL",
        id: "op-add",
        toolId: "calculator",
        input: { left: 15, right: 85 }
      }
    ]
  }
};

class PlatformApp {
  constructor() {
    this.currentTab = "overview";
    this.refreshInterval = null;
    this.init();
  }

  init() {
    this.setupTabs();
    this.setupForms();
    this.setupRefresh();
    this.loadData();
    this.startAutoRefresh();
  }

  setupTabs() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.getAttribute("data-tab");
        this.switchTab(tab);
      });
    });

    const closeTimelineBtn = document.getElementById("close-timeline-btn");
    if (closeTimelineBtn) {
      closeTimelineBtn.addEventListener("click", () => {
        document.getElementById("timeline-panel").style.display = "none";
      });
    }
  }

  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });

    document.querySelectorAll(".tab-view").forEach((view) => {
      view.classList.toggle("active", view.id === `tab-${tab}`);
    });

    const titles = {
      overview: { title: "Platform Overview", sub: "Real-time status, execution telemetry, and governance" },
      executions: { title: "Execution Explorer", sub: "Audit trails and correlated event timelines" },
      governance: { title: "Policy & Governance", sub: "Fail-closed evaluation history and policy outcomes" },
      playground: { title: "Execution Playground", sub: "Dispatch coordinated tasks and test sequential workflows" }
    };

    const info = titles[tab] || titles.overview;
    document.getElementById("view-title").textContent = info.title;
    document.getElementById("view-subtitle").textContent = info.sub;
  }

  setupForms() {
    // Task submission
    const taskForm = document.getElementById("task-form");
    if (taskForm) {
      taskForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const agentId = document.getElementById("task-agent-id").value;
        let input;
        try {
          input = JSON.parse(document.getElementById("task-input").value);
        } catch {
          alert("Invalid JSON input for task");
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/api/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, input })
          });
          const data = await res.json();
          this.displayPlaygroundResult(data, res.status === 201 ? "COMPLETED" : "FAILED");
          this.loadData();
        } catch (err) {
          this.displayPlaygroundResult({ error: err.message }, "FAILED");
        }
      });
    }

    // Orchestration submission
    const orchScenario = document.getElementById("orchestrate-scenario");
    const orchPayload = document.getElementById("orchestrate-payload");
    if (orchScenario && orchPayload) {
      orchPayload.value = JSON.stringify(SCENARIOS.calculator_then_model, null, 2);
      orchScenario.addEventListener("change", () => {
        const scenario = SCENARIOS[orchScenario.value];
        if (scenario) {
          orchPayload.value = JSON.stringify(scenario, null, 2);
        }
      });
    }

    const orchForm = document.getElementById("orchestrate-form");
    if (orchForm) {
      orchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        let payload;
        try {
          payload = JSON.parse(document.getElementById("orchestrate-payload").value);
        } catch {
          alert("Invalid JSON for orchestration request");
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/api/orchestrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          this.displayPlaygroundResult(data, data.status ?? "FAILED");
          this.loadData();
        } catch (err) {
          this.displayPlaygroundResult({ error: err.message }, "FAILED");
        }
      });
    }
  }

  displayPlaygroundResult(data, status) {
    const card = document.getElementById("playground-result-card");
    const badge = document.getElementById("playground-status-badge");
    const pre = document.getElementById("playground-result-json");

    card.style.display = "block";
    badge.textContent = status;
    badge.className = `badge badge-${status === "COMPLETED" ? "success" : "danger"}`;
    pre.textContent = JSON.stringify(data, null, 2);
    card.scrollIntoView({ behavior: "smooth" });
  }

  setupRefresh() {
    document.getElementById("refresh-btn")?.addEventListener("click", () => {
      this.loadData();
    });
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, 4000);
  }

  async loadData() {
    try {
      const [statusRes, execsRes, auditRes, toolsRes] = await Promise.all([
        fetch(`${API_BASE}/api/status`),
        fetch(`${API_BASE}/api/executions`),
        fetch(`${API_BASE}/api/audit`),
        fetch(`${API_BASE}/api/tools`)
      ]);

      if (statusRes.ok) {
        const status = await statusRes.json();
        this.renderStatus(status);
      }

      if (execsRes.ok) {
        const executions = await execsRes.json();
        this.renderExecutions(executions);
      }

      if (auditRes.ok) {
        const audit = await auditRes.json();
        this.renderAudit(audit);
      }

      if (toolsRes.ok) {
        const tools = await toolsRes.json();
        this.renderTools(tools);
      }
    } catch (err) {
      document.getElementById("engine-status").textContent = "Engine: Offline";
      document.querySelector(".pulse-dot").style.backgroundColor = "var(--accent-red)";
    }
  }

  renderStatus(status) {
    document.getElementById("engine-status").textContent = `Engine: Online (${status.version})`;
    document.querySelector(".pulse-dot").style.backgroundColor = "var(--accent-green)";
    document.getElementById("uptime-display").textContent = `Uptime: ${status.uptimeSeconds}s`;

    document.getElementById("metric-executions").textContent = status.executionsCount;
    document.getElementById("metric-tasks").textContent = status.tasksCount;
    document.getElementById("metric-tools").textContent = status.toolsCount;

    const policyEvals = (status.metrics.counters["policy.evaluated:"] ?? 0) +
      (status.metrics.counters["policy.allowed:"] ?? 0) +
      (status.metrics.counters["policy.denied:"] ?? 0);
    document.getElementById("metric-policy-evals").textContent = policyEvals;

    // Render counters table
    const tbody = document.getElementById("counters-tbody");
    const entries = Object.entries(status.metrics.counters);
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" class="empty-state">No metric counters incremented yet</td></tr>`;
    } else {
      tbody.innerHTML = entries
        .map(([key, val]) => `<tr><td><code>${key}</code></td><td><strong>${val}</strong></td></tr>`)
        .join("");
    }
  }

  renderExecutions(executions) {
    document.getElementById("executions-count-badge").textContent = executions.length;
    const tbody = document.getElementById("executions-tbody");

    if (executions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No executions recorded yet. Use the Playground to run one!</td></tr>`;
      return;
    }

    tbody.innerHTML = executions
      .slice(-15)
      .reverse()
      .map(
        (exec) => `
        <tr>
          <td><code>${exec.id.substring(0, 8)}...</code></td>
          <td><code>${exec.taskId.substring(0, 8)}...</code></td>
          <td><code>${exec.traceId.substring(0, 8)}...</code></td>
          <td><span class="badge" data-status="${exec.status}">${exec.status}</span></td>
          <td>${exec.startedAt ? new Date(exec.startedAt).toLocaleTimeString() : "-"}</td>
          <td>
            <button class="btn btn-sm btn-secondary view-timeline-btn" data-id="${exec.id}">
              Timeline
            </button>
          </td>
        </tr>
      `
      )
      .join("");

    tbody.querySelectorAll(".view-timeline-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        this.showTimeline(id);
      });
    });
  }

  async showTimeline(executionId) {
    const panel = document.getElementById("timeline-panel");
    const label = document.getElementById("timeline-exec-id");
    const container = document.getElementById("timeline-container");

    label.textContent = executionId;
    panel.style.display = "block";
    container.innerHTML = `<div class="empty-state">Loading timeline...</div>`;

    try {
      const res = await fetch(`${API_BASE}/api/executions/${executionId}/timeline`);
      if (!res.ok) throw new Error("Failed to load timeline");
      const events = await res.json();

      if (events.length === 0) {
        container.innerHTML = `<div class="empty-state">No correlated timeline events recorded for this execution.</div>`;
        return;
      }

      container.innerHTML = events
        .map(
          (ev) => `
          <div class="timeline-node">
            <div class="timeline-header">
              <span class="timeline-type">${ev.type}</span>
              <span class="timeline-time">${new Date(ev.occurredAt).toLocaleTimeString()}</span>
            </div>
            <div class="timeline-details">
              Payload: ${JSON.stringify(ev.payload)}
            </div>
          </div>
        `
        )
        .join("");

      panel.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color: var(--accent-red);">Error: ${err.message}</div>`;
    }
  }

  renderAudit(observations) {
    document.getElementById("audit-count-badge").textContent = `${observations.length} events`;
    const tbody = document.getElementById("audit-tbody");

    if (observations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No audit observations available</td></tr>`;
      return;
    }

    tbody.innerHTML = observations
      .slice(-20)
      .reverse()
      .map(
        (obs) => `
        <tr>
          <td>${new Date(obs.occurredAt).toLocaleTimeString()}</td>
          <td><code>${obs.type}</code></td>
          <td><code>${obs.traceId.substring(0, 8)}...</code></td>
          <td>${obs.operationId ? `Op: <code>${obs.operationId}</code>` : `Agg: <code>${obs.aggregateId.substring(0, 8)}...</code>`}</td>
          <td><pre style="font-size: 0.75rem; color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${JSON.stringify(obs.payload)}</pre></td>
        </tr>
      `
      )
      .join("");
  }

  renderTools(tools) {
    const list = document.getElementById("tools-list");
    if (tools.length === 0) {
      list.innerHTML = `<div class="empty-state">No tools registered</div>`;
      return;
    }

    list.innerHTML = tools
      .map(
        (tool) => `
        <div class="tool-item">
          <h4>${tool.name} <span class="badge badge-info">v${tool.version ?? "1"}</span></h4>
          <p>${tool.description}</p>
          <div style="margin-top: 0.5rem; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
            ID: <code>${tool.id}</code>
          </div>
        </div>
      `
      )
      .join("");
  }
}

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", () => {
  new PlatformApp();
});
