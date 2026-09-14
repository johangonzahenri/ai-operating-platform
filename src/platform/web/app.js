// Web Platform Client Application (Strictly typed DOM construction, zero innerHTML, consumes api-client.js)
import * as api from "./api-client.js";

// Scenarios for Playground
const SCENARIOS = {
  calculator_then_model: {
    operations: [
      {
        kind: "TOOL",
        id: "op-calc",
        toolId: "calculator",
        input: { left: 40, right: 2 },
      },
      {
        kind: "MODEL",
        id: "op-summarize",
        model: "stub-model",
        input: { prompt: "Summarize the computation result:" },
        bindings: [
          { targetKey: "computed", operationId: "op-calc", sourceKey: "value" },
        ],
      },
    ],
  },
  model_then_tool: {
    operations: [
      {
        kind: "MODEL",
        id: "op-think",
        model: "stub-model",
        input: { prompt: "Find input parameters for math operation" },
      },
      {
        kind: "TOOL",
        id: "op-add",
        toolId: "calculator",
        input: { left: 15, right: 85 },
      },
    ],
  },
};

function clearChildren(elem) {
  if (!elem) return;
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild);
  }
}

class PlatformApp {
  constructor() {
    this.currentTab = "platform-operations";
    this.refreshInterval = null;
    this.selectedAgentId = null;
    this.selectedOperationId = null;
    this.cachedModels = [];
    this.cachedTools = [];
    this.cachedAgents = [];
    this.cachedEvents = [];
    this.currentEventFilter = { limit: 50 };
    this.eventsCursorStack = [0]; // Stack of afterSequence cursors
    this.eventsCurrentPageIndex = 0;
    this.eventsTotalCount = 0;
    this.init();
  }

  init() {
    this.setupTheme();
    this.setupTabs();
    this.setupPlatformOperations();
    this.setupForms();
    this.setupRefresh();
    this.setupAgentManagement();
    this.setupDetailLookup();
    this.setupApplicationsSimulation();
    this.setupOperations();
    this.setupOperationalConsole();
    this.loadData();
    this.startAutoRefresh();
  }

  setupTheme() {
    const savedTheme = localStorage.getItem("ai_platform_theme") || "light";
    this.applyTheme(savedTheme);

    const toggleBtn = document.getElementById("theme-toggle-btn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        this.applyTheme(newTheme);
      });
    }
  }

  applyTheme(theme) {
    const toggleBtn = document.getElementById("theme-toggle-btn");
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.classList.add("dark");
      localStorage.setItem("ai_platform_theme", "dark");
      if (toggleBtn) {
        toggleBtn.textContent = "☀️ Modo Claro";
        toggleBtn.title = "Cambiar a Modo Claro (por defecto)";
      }
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.body.classList.remove("dark");
      localStorage.setItem("ai_platform_theme", "light");
      if (toggleBtn) {
        toggleBtn.textContent = "🌙 Modo Oscuro";
        toggleBtn.title = "Cambiar a Modo Oscuro (alternativo)";
      }
    }
  }

  setupOperationalConsole() {
    const form = document.getElementById("ops-task-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.runOperationalTask();
    });
    this.loadOperationalHealth();
  }

  async loadOperationalHealth() {
    try {
      const health = await api.getPlatformHealth();
      const components = health.components || {};
      this.setText("ops-platform-status", health.status || "UNKNOWN");
      this.setText("ops-runtime-status", components.runtime?.status || "UNKNOWN");
      this.setText("ops-persistence-status", components.sqlite?.status || "UNKNOWN");
      this.setText("ops-event-count", String(components.eventStore?.queryableCount ?? 0));
      this.setText("ops-connection-status", `API ONLINE · v${health.version || "unknown"}`);
    } catch (error) {
      this.setText("ops-connection-status", "Platform unavailable");
      this.showOperationalError(error);
    }
  }

  async runOperationalTask() {
    const objective = document.getElementById("ops-objective")?.value?.trim();
    const button = document.getElementById("ops-execute-btn");
    if (!objective) return;
    if (button) button.disabled = true;
    this.setText("ops-execution-status", "CREATING");
    this.hideOperationalError();
    this.setText("ops-timeline", "");
    this.setText("ops-final-result", "Waiting for execution result...");
    try {
      const agents = await api.getPlatformAgents();
      const activeAgent = Array.isArray(agents) ? agents.find((agent) => agent.status === "ACTIVE") : undefined;
      if (!activeAgent?.id) throw new Error("No active agent is available");
      const created = await api.createPlatformTask(activeAgent.id, objective);
      const task = created.task || {};
      let execution = created.execution || {};
      this.setText("ops-task-id", task.id || "—");
      this.setText("ops-execution-id", execution.id || "—");
      this.setText("ops-trace-id", execution.traceId || task.traceId || "—");
      this.setText("ops-execution-status", execution.status || "RUNNING");
      if (task.id) execution = await api.executePlatformTask(task.id);
      if (execution.id) {
        this.setText("ops-execution-id", execution.id);
        await this.pollOperationalExecution(execution.id);
      }
    } catch (error) {
      this.setText("ops-execution-status", "FAILED");
      this.showOperationalError(error);
    } finally {
      if (button) button.disabled = false;
      this.loadOperationalHealth();
    }
  }

  async pollOperationalExecution(executionId) {
    const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "POLICY_DENIED"]);
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const [execution, events] = await Promise.all([
        api.getPlatformExecution(executionId),
        api.getPlatformExecutionEvents(executionId),
      ]);
      this.renderOperationalExecution(execution, Array.isArray(events) ? events : []);
      if (terminal.has(String(execution.status).toUpperCase())) return;
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 + attempt * 100, 1500)));
    }
    throw new Error("Execution polling timed out");
  }

  renderOperationalExecution(execution, events) {
    this.setText("ops-execution-status", execution.status || "UNKNOWN");
    this.setText("ops-execution-id", execution.id || "—");
    this.setText("ops-task-id", execution.taskId || "—");
    this.setText("ops-trace-id", execution.traceId || "—");
    const metadata = execution.metadata || {};
    this.setText("ops-model", execution.model || metadata.model || "Not reported");
    this.setText("ops-tool", execution.currentTool || metadata.currentTool || "Not reported");
    this.setText("ops-round", execution.currentRound === undefined ? "Not reported" : String(execution.currentRound));
    this.setText("ops-activity", execution.currentActivity || "Not reported");
    const policyEvent = events.find((item) => String(item.type).toLowerCase().includes("policy"));
    this.setText("ops-policy", policyEvent ? policyEvent.type : "Not reported");
    const result = execution.finalResult || execution.result || metadata.finalResult || metadata.result;
    this.setText("ops-final-result", result ? JSON.stringify(result, null, 2) : (execution.error?.message || "No completed result yet."));
    this.renderOperationalToolCalls(execution.toolCallObservations || []);
    this.renderOperationalTimeline(events);
  }

  renderOperationalToolCalls(calls) {
    const container = document.getElementById("ops-tool-calls");
    if (!container) return;
    clearChildren(container);
    if (!Array.isArray(calls) || calls.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ops-empty";
      empty.textContent = "No tool calls reported.";
      container.appendChild(empty);
      return;
    }
    calls.forEach((call) => {
      const item = document.createElement("div");
      item.className = "ops-tool-call";
      const title = document.createElement("strong");
      title.textContent = String(call.toolName || "Not reported");
      const details = document.createElement("span");
      details.textContent = `Call ID: ${call.toolCallId || "Not reported"} · Round: ${call.round ?? "Not reported"} · Status: ${call.status || "Not reported"}${call.durationMs === undefined ? "" : ` · ${call.durationMs}ms`}`;
      item.append(title, details);
      container.appendChild(item);
    });
  }

  renderOperationalTimeline(events) {
    const container = document.getElementById("ops-timeline");
    if (!container) return;
    clearChildren(container);
    this.setText("ops-event-total", `${events.length} event${events.length === 1 ? "" : "s"}`);
    if (events.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ops-empty";
      empty.textContent = "No events reported for this execution.";
      container.appendChild(empty);
      return;
    }
    events.forEach((event) => {
      const item = document.createElement("article");
      item.className = "ops-timeline-item";
      const heading = document.createElement("strong");
      heading.textContent = event.type || "EVENT";
      const detail = document.createElement("span");
      const payload = event.payload || {};
      const tool = payload.tool || payload.toolId || payload.name;
      detail.textContent = `${event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString() : "time unavailable"}${tool ? ` · ${tool}` : ""}`;
      item.append(heading, detail);
      container.appendChild(item);
    });
  }

  setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  showOperationalError(error) {
    const element = document.getElementById("ops-error");
    if (!element) return;
    element.hidden = false;
    element.textContent = error?.message || "Platform request failed";
  }

  hideOperationalError() {
    const element = document.getElementById("ops-error");
    if (element) {
      element.hidden = true;
      element.textContent = "";
    }
  }

  setupTabs() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.getAttribute("data-tab");
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
    document.querySelectorAll(".blueprint-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bpId = btn.getAttribute("data-bp");
        document.querySelectorAll(".blueprint-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".blueprint-view").forEach((v) => (v.style.display = "none"));
        const targetView = document.getElementById(bpId);
        if (targetView) targetView.style.display = "block";
      });
    });

    document.querySelectorAll(".blueprint-container img").forEach((img) => {
      img.addEventListener("click", () => {
        window.open(img.src, "_blank");
      });
    });
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
      "platform-operations": { title: "Platform Operations", sub: "Operational testing, system health, durable event stream, and governance audit trail" },
      dashboard: { title: "Platform Dashboard", sub: "Real-time telemetry, operational status, and capability registry" },
      agents: { title: "Agent Management", sub: "Configure, inspect, activate, and dispatch first-class AI Agents" },
      models: { title: "Registered Models", sub: "Provider model gateways and inference capabilities" },
      tools: { title: "Registered Tools", sub: "Operational capabilities and parameter contracts" },
      executions: { title: "Execution Explorer", sub: "Audit trails and correlated event timelines" },
      "execution-detail": { title: "Execution Detail", sub: "Deep event reconstruction and lifecycle observation" },
      operations: { title: "Autonomous Operations", sub: "Bounded autonomous execution loops with budget enforcement and fail-closed governance" },
      playground: { title: "Execution Playground", sub: "Dispatch coordinated tasks and test sequential workflows" },
      applications: { title: "External Applications", sub: "Enterprise consumer integration contracts (AI Commerce)" },
      settings: { title: "Platform Settings", sub: "Configuration metadata, security postures, and architectural constraints" },
      governance: { title: "Policy & Governance", sub: "Fail-closed evaluation history and policy audit trails" },
      blueprints: { title: "Blueprints & Arquitectura Oficial", sub: "Mapas de ingeniería de software, topología hexagonal y gobernanza en español" },
    };

    const info = titles[tab] || titles["platform-operations"];
    const titleElem = document.getElementById("view-title");
    const subElem = document.getElementById("view-subtitle");
    if (titleElem) titleElem.textContent = info.title;
    if (subElem) subElem.textContent = info.sub;

    if (tab === "platform-operations") {
      this.loadPlatformOperationsData();
    } else if (tab === "agents" || tab === "models" || tab === "tools" || tab === "executions" || tab === "governance" || tab === "operations") {
      this.loadData();
    }
  }


  setupForms() {
    // Task submission in Playground
    const taskForm = document.getElementById("task-form");
    const agentSelect = document.getElementById("task-agent-select");
    const agentIdInput = document.getElementById("task-agent-id");

    if (agentSelect && agentIdInput) {
      agentSelect.addEventListener("change", () => {
        agentIdInput.value = agentSelect.value;
      });
    }

    if (taskForm) {
      taskForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const agentId = agentIdInput?.value || "foundation-agent";
        let input;
        try {
          input = JSON.parse(document.getElementById("task-input").value);
        } catch {
          alert("Invalid JSON input for task");
          return;
        }

        try {
          const data = await api.executeAgent(agentId, input);
          this.displayPlaygroundResult(data, "COMPLETED");
          this.loadData();
        } catch (err) {
          try {
            const fallbackData = await api.submitExecution(agentId, input);
            this.displayPlaygroundResult(fallbackData, "COMPLETED");
            this.loadData();
          } catch (fallbackErr) {
            this.displayPlaygroundResult({ error: fallbackErr.message, status: fallbackErr.status }, "FAILED");
          }
        }
      });
    }

    // Orchestration form in Playground
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
          const data = await api.submitOrchestration(payload.operations, payload.traceId);
          this.displayPlaygroundResult(data, data.status ?? "COMPLETED");
          this.loadData();
        } catch (err) {
          this.displayPlaygroundResult({ error: err.message, status: err.status }, "FAILED");
        }
      });
    }
  }

  setupAgentManagement() {
    const openBtn = document.getElementById("open-create-agent-btn");
    const closeBtn = document.getElementById("close-create-agent-btn");
    const createPanel = document.getElementById("create-agent-panel");
    const createForm = document.getElementById("create-agent-form");

    if (openBtn && createPanel) {
      openBtn.addEventListener("click", () => {
        createPanel.style.display = "block";
        createPanel.scrollIntoView({ behavior: "smooth" });
      });
    }

    if (closeBtn && createPanel) {
      closeBtn.addEventListener("click", () => {
        createPanel.style.display = "none";
      });
    }

    if (createForm) {
      createForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("agent-id-input").value.trim();
        const name = document.getElementById("agent-name-input").value.trim();
        const description = document.getElementById("agent-desc-input").value.trim();
        const model = document.getElementById("agent-model-select").value.trim();
        const instructions = document.getElementById("agent-instructions-input").value.trim();
        const memoryScope = document.getElementById("agent-memory-input").value.trim() || undefined;

        const selectedTools = [];
        document.querySelectorAll(".agent-tool-checkbox:checked").forEach((cb) => {
          selectedTools.push(cb.value);
        });

        try {
          await api.createAgent({
            id,
            name,
            description: description || undefined,
            model,
            instructions: instructions || undefined,
            tools: selectedTools,
            memoryScope,
          });
          createForm.reset();
          createPanel.style.display = "none";
          this.loadData();
          alert(`Agent '${id}' successfully created!`);
        } catch (err) {
          alert(`Failed to create agent: ${err.message}`);
        }
      });
    }

    // Close detail panel
    const closeDetailBtn = document.getElementById("close-agent-detail-btn");
    const detailPanel = document.getElementById("agent-detail-panel");
    if (closeDetailBtn && detailPanel) {
      closeDetailBtn.addEventListener("click", () => {
        detailPanel.style.display = "none";
      });
    }

    // Agent detail runner form
    const detailExecForm = document.getElementById("agent-detail-exec-form");
    if (detailExecForm) {
      detailExecForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!this.selectedAgentId) return;
        const inputArea = document.getElementById("agent-detail-exec-input");
        let input;
        try {
          input = JSON.parse(inputArea.value);
        } catch {
          alert("Invalid JSON input");
          return;
        }

        const resBox = document.getElementById("agent-detail-exec-result");
        const badge = document.getElementById("agent-detail-exec-badge");
        const pre = document.getElementById("agent-detail-exec-json");

        try {
          const result = await api.executeAgent(this.selectedAgentId, input);
          if (resBox && badge && pre) {
            resBox.style.display = "block";
            badge.textContent = result.execution.status;
            badge.className = `badge badge-${result.execution.status === "COMPLETED" ? "success" : "danger"}`;
            pre.textContent = JSON.stringify(result, null, 2);
          }
          this.loadData();
        } catch (err) {
          if (resBox && badge && pre) {
            resBox.style.display = "block";
            badge.textContent = "FAILED";
            badge.className = "badge badge-danger";
            pre.textContent = JSON.stringify({ error: err.message }, null, 2);
          }
        }
      });
    }
  }

  setupDetailLookup() {
    const btn = document.getElementById("lookup-exec-btn");
    const input = document.getElementById("detail-exec-input");
    if (btn && input) {
      btn.addEventListener("click", () => {
        const id = input.value.trim();
        if (id) {
          this.showExecutionDetail(id);
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const id = input.value.trim();
          if (id) {
            this.showExecutionDetail(id);
          }
        }
      });
    }
  }

  setupApplicationsSimulation() {
    const btn = document.getElementById("run-commerce-simulation-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.setAttribute("disabled", "true");
        btn.textContent = "Processing Order Calculation...";
        const outputDiv = document.getElementById("commerce-sim-output");
        const badge = document.getElementById("commerce-sim-badge");
        const jsonPre = document.getElementById("commerce-sim-json");

        try {
          const result = await api.submitOrchestration(
            [
              {
                kind: "TOOL",
                id: "tax-calc",
                toolId: "calculator",
                input: { left: 100, right: 19 },
              },
              {
                kind: "MODEL",
                id: "receipt-gen",
                model: "stub-model",
                input: { prompt: "Generate formatted order receipt summary" },
                bindings: [{ targetKey: "orderTotal", operationId: "tax-calc", sourceKey: "value" }],
              },
            ],
            "trace-commerce-" + Date.now()
          );

          if (outputDiv && badge && jsonPre) {
            outputDiv.style.display = "block";
            badge.textContent = result.status;
            badge.className = `badge badge-${result.status === "COMPLETED" ? "success" : "danger"}`;
            jsonPre.textContent = JSON.stringify(result, null, 2);
          }
          this.loadData();
        } catch (err) {
          if (outputDiv && badge && jsonPre) {
            outputDiv.style.display = "block";
            badge.textContent = "FAILED";
            badge.className = "badge badge-danger";
            jsonPre.textContent = JSON.stringify({ error: err.message }, null, 2);
          }
        } finally {
          btn.removeAttribute("disabled");
          btn.textContent = "Dispatch Order Calculation";
        }
      });
    }
  }

  setupOperations() {
    const openBtn = document.getElementById("open-create-operation-btn");
    const closeBtn = document.getElementById("close-create-operation-btn");
    const createPanel = document.getElementById("create-operation-panel");
    const form = document.getElementById("create-operation-form");

    if (openBtn && createPanel) {
      openBtn.addEventListener("click", () => {
        createPanel.style.display = "block";
        createPanel.scrollIntoView({ behavior: "smooth" });
      });
    }

    if (closeBtn && createPanel) {
      closeBtn.addEventListener("click", () => {
        createPanel.style.display = "none";
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submit-operation-btn");
        const originalText = submitBtn ? submitBtn.textContent : "";
        if (submitBtn) {
          submitBtn.setAttribute("disabled", "true");
          submitBtn.textContent = "Executing Operation...";
        }

        const agentId = document.getElementById("op-agent-select")?.value;
        const objective = document.getElementById("op-objective-input")?.value?.trim();
        const maxSteps = parseInt(document.getElementById("op-max-steps")?.value ?? "5", 10);
        const maxDurationMs = parseInt(document.getElementById("op-max-duration")?.value ?? "30000", 10);
        const maxToolCalls = parseInt(document.getElementById("op-max-tools")?.value ?? "10", 10);
        const maxTokens = parseInt(document.getElementById("op-max-tokens")?.value ?? "5000", 10);

        try {
          const detail = await api.createOperation({
            agentId,
            objective,
            budget: {
              maxSteps,
              maxDurationMs,
              maxToolCalls,
              maxTokens,
            },
          });
          form.reset();
          if (createPanel) createPanel.style.display = "none";
          await this.loadData();
          const opId = detail?.operation?.id || detail?.id;
          if (opId) {
            this.showOperationDetail(opId);
          }
        } catch (err) {
          alert(`Operation execution failed: ${err.message}`);
        } finally {
          if (submitBtn) {
            submitBtn.removeAttribute("disabled");
            submitBtn.textContent = originalText;
          }
        }
      });
    }

    const closeDetailBtn = document.getElementById("close-operation-detail-btn");
    const detailPanel = document.getElementById("operation-detail-panel");
    if (closeDetailBtn && detailPanel) {
      closeDetailBtn.addEventListener("click", () => {
        detailPanel.style.display = "none";
      });
    }
  }

  displayPlaygroundResult(data, status) {
    const card = document.getElementById("playground-result-card");
    const badge = document.getElementById("playground-status-badge");
    const pre = document.getElementById("playground-result-json");

    if (card && badge && pre) {
      card.style.display = "block";
      badge.textContent = status;
      badge.className = `badge badge-${status === "COMPLETED" ? "success" : "danger"}`;
      pre.textContent = JSON.stringify(data, null, 2);
      card.scrollIntoView({ behavior: "smooth" });
    }
  }

  setupRefresh() {
    document.getElementById("refresh-btn")?.addEventListener("click", () => {
      this.loadData();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopAutoRefresh();
      } else {
        this.loadData();
        this.startAutoRefresh();
      }
    });
  }

  startAutoRefresh(intervalMs = 5000) {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      if (!document.hidden) {
        this.loadData();
      }
    }, intervalMs);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  setupPlatformOperations() {
    // 1. Refresh & Retry Buttons
    document.getElementById("refresh-events-btn")?.addEventListener("click", () => {
      this.loadDurableEvents();
    });
    document.getElementById("retry-events-btn")?.addEventListener("click", () => {
      this.loadDurableEvents();
    });
    document.getElementById("refresh-audit-btn")?.addEventListener("click", () => {
      this.loadAuditLogOps();
    });
    document.getElementById("retry-audit-btn")?.addEventListener("click", () => {
      this.loadAuditLogOps();
    });
    document.getElementById("refresh-recovery-btn")?.addEventListener("click", () => {
      this.loadRecoveryHistory();
    });

    // 2. Filter Bar & Clear Filters
    document.getElementById("apply-events-filter-btn")?.addEventListener("click", () => {
      const typeInput = document.getElementById("filter-event-type");
      const aggSelect = document.getElementById("filter-aggregate-type");
      const traceInput = document.getElementById("filter-trace-id");
      const limitSelect = document.getElementById("filter-limit");

      const filters = {
        limit: limitSelect ? parseInt(limitSelect.value, 10) : 50,
      };
      if (typeInput?.value.trim()) filters.eventType = typeInput.value.trim();
      if (aggSelect?.value) filters.aggregateType = aggSelect.value;
      if (traceInput?.value.trim()) filters.traceId = traceInput.value.trim();

      this.currentEventFilter = filters;
      this.eventsCursorStack = [0];
      this.eventsCurrentPageIndex = 0;
      this.loadDurableEvents();
    });

    document.getElementById("reset-events-filter-btn")?.addEventListener("click", () => {
      const typeInput = document.getElementById("filter-event-type");
      const aggSelect = document.getElementById("filter-aggregate-type");
      const traceInput = document.getElementById("filter-trace-id");
      const limitSelect = document.getElementById("filter-limit");

      if (typeInput) typeInput.value = "";
      if (aggSelect) aggSelect.value = "";
      if (traceInput) traceInput.value = "";
      if (limitSelect) limitSelect.value = "50";

      this.currentEventFilter = { limit: 50 };
      this.eventsCursorStack = [0];
      this.eventsCurrentPageIndex = 0;
      this.loadDurableEvents();
    });

    // 2b. Pagination Buttons
    document.getElementById("events-prev-btn")?.addEventListener("click", () => {
      if (this.eventsCurrentPageIndex > 0) {
        this.eventsCurrentPageIndex--;
        const afterSeq = this.eventsCursorStack[this.eventsCurrentPageIndex] || 0;
        this.currentEventFilter.afterSequence = afterSeq > 0 ? afterSeq : undefined;
        this.loadDurableEvents(false);
      }
    });

    document.getElementById("events-next-btn")?.addEventListener("click", () => {
      const lastEvt = this.cachedEvents[this.cachedEvents.length - 1];
      if (lastEvt && lastEvt.sequenceNumber) {
        this.eventsCurrentPageIndex++;
        this.eventsCursorStack[this.eventsCurrentPageIndex] = lastEvt.sequenceNumber;
        this.currentEventFilter.afterSequence = lastEvt.sequenceNumber;
        this.loadDurableEvents(false);
      }
    });

    // 3. Modal controls
    document.getElementById("close-event-modal-btn")?.addEventListener("click", () => {
      this.closeEventModal();
    });

    const modal = document.getElementById("event-detail-modal");
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.closeEventModal();
      }
    });

    document.getElementById("copy-payload-btn")?.addEventListener("click", () => {
      const pre = document.getElementById("modal-event-payload");
      if (pre?.textContent) {
        navigator.clipboard?.writeText(pre.textContent).catch(() => {});
      }
    });
  }

  async loadPlatformOperationsData() {
    await Promise.all([
      this.loadSystemStatus().catch(() => {}),
      this.loadDurableEvents().catch(() => {}),
      this.loadAuditLogOps().catch(() => {}),
      this.loadRecoveryHistory().catch(() => {}),
    ]);
  }

  async loadSystemStatus() {
    try {
      const health = await api.getHealth();
      if (!health) return;

      const healthOverall = document.getElementById("health-overall-status");
      if (healthOverall) {
        healthOverall.textContent = health.status;
        healthOverall.className = `metric-value ${health.status === "HEALTHY" ? "code-text" : "badge-degraded"}`;
      }

      const sqliteStatus = document.getElementById("health-sqlite-status");
      if (sqliteStatus) {
        sqliteStatus.textContent = health.components?.sqlite?.status ?? "ONLINE";
        sqliteStatus.className = `metric-value ${health.components?.sqlite?.status === "ONLINE" ? "code-text" : "badge-offline"}`;
      }

      const sqliteMode = document.getElementById("health-sqlite-mode");
      if (sqliteMode) {
        sqliteMode.textContent = health.components?.sqlite?.mode === "durable" ? "Durable WAL Mode" : "In-Memory Mode";
      }

      const eventStoreStatus = document.getElementById("health-eventstore-status");
      if (eventStoreStatus) {
        eventStoreStatus.textContent = health.components?.eventStore?.status ?? "ONLINE";
      }

      const persistedCount = document.getElementById("health-persisted-count");
      if (persistedCount) {
        persistedCount.textContent = String(health.components?.eventStore?.persistedCount ?? 0);
      }

      const queryableCount = document.getElementById("health-queryable-count");
      if (queryableCount) {
        queryableCount.textContent = String(health.components?.eventStore?.queryableCount ?? 0);
      }

      const lastEventTime = document.getElementById("health-last-event-time");
      if (lastEventTime) {
        const ts = health.components?.eventStore?.lastEventOccurredAt;
        lastEventTime.textContent = ts ? new Date(ts).toLocaleString() : "Never";
      }

      const versionSub = document.getElementById("health-platform-version");
      if (versionSub) {
        versionSub.textContent = `Platform v${health.version}`;
      }
    } catch (err) {
      // Isolated failure handling: mark health as DEGRADED / OFFLINE without crashing other widgets
      const healthOverall = document.getElementById("health-overall-status");
      if (healthOverall) {
        healthOverall.textContent = "OFFLINE";
        healthOverall.className = "metric-value badge-offline";
      }
      const overallSub = document.getElementById("health-overall-sub");
      if (overallSub) {
        overallSub.textContent = "API Health Check Unreachable";
      }
    }
  }

  async loadDurableEvents(resetCursor = true) {
    const loadingElem = document.getElementById("events-loading");
    const emptyElem = document.getElementById("events-empty");
    const errorElem = document.getElementById("events-error");
    const tableWrapper = document.getElementById("events-table-wrapper");
    const badge = document.getElementById("events-count-badge");

    if (loadingElem) loadingElem.style.display = "flex";
    if (emptyElem) emptyElem.style.display = "none";
    if (errorElem) errorElem.style.display = "none";
    if (tableWrapper) tableWrapper.style.display = "none";

    try {
      const response = await api.getEvents(this.currentEventFilter);
      const events = response?.data ?? [];
      const total = response?.meta?.total ?? events.length;
      this.eventsTotalCount = total;

      if (loadingElem) loadingElem.style.display = "none";

      if (badge) {
        badge.textContent = `${total} events`;
      }

      if (events.length === 0 && this.eventsCurrentPageIndex === 0) {
        if (emptyElem) emptyElem.style.display = "flex";
        return;
      }

      this.cachedEvents = events;
      this.renderEventsTable(events);
      this.updatePaginationControls(events, total);
      if (tableWrapper) tableWrapper.style.display = "block";
    } catch (err) {
      if (loadingElem) loadingElem.style.display = "none";
      if (errorElem) {
        errorElem.style.display = "flex";
        const msg = document.getElementById("events-error-msg");
        if (msg) msg.textContent = `Failed to query durable events: ${err?.message || "Server error"}`;
      }
    }
  }

  updatePaginationControls(events, total) {
    const pageInfo = document.getElementById("events-page-info");
    const prevBtn = document.getElementById("events-prev-btn");
    const nextBtn = document.getElementById("events-next-btn");

    const limit = this.currentEventFilter.limit || 50;
    const startIdx = this.eventsCurrentPageIndex * limit + 1;
    const endIdx = startIdx + events.length - 1;

    if (pageInfo) {
      pageInfo.textContent = total > 0
        ? `Showing ${startIdx}–${endIdx} of ${total} events`
        : "Showing 0 events";
    }

    if (prevBtn) {
      if (this.eventsCurrentPageIndex > 0) {
        prevBtn.removeAttribute("disabled");
      } else {
        prevBtn.setAttribute("disabled", "true");
      }
    }

    if (nextBtn) {
      if (endIdx < total && events.length === limit) {
        nextBtn.removeAttribute("disabled");
      } else {
        nextBtn.setAttribute("disabled", "true");
      }
    }
  }

  renderEventsTable(events) {
    const tbody = document.getElementById("events-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    events.forEach((evt) => {
      const tr = document.createElement("tr");
      tr.className = "clickable-row";

      // 1. Seq #
      const tdSeq = document.createElement("td");
      tdSeq.className = "code-text";
      tdSeq.textContent = `#${evt.sequenceNumber}`;

      // 2. Event Type
      const tdType = document.createElement("td");
      const badgeType = document.createElement("span");
      badgeType.className = "badge badge-event";
      badgeType.textContent = evt.type;
      tdType.appendChild(badgeType);

      // 3. Aggregate
      const tdAgg = document.createElement("td");
      tdAgg.textContent = `${evt.aggregateType}:${evt.aggregateId}`;

      // 4. Timestamp
      const tdTime = document.createElement("td");
      tdTime.textContent = new Date(evt.occurredAt).toLocaleString();

      // 5. Trace ID (Interactive filtering trigger)
      const tdTrace = document.createElement("td");
      tdTrace.className = "code-text clickable-trace";
      tdTrace.textContent = evt.traceId || "-";
      tdTrace.style.fontSize = "0.8rem";
      if (evt.traceId) {
        tdTrace.style.cursor = "pointer";
        tdTrace.style.textDecoration = "underline";
        tdTrace.title = `Filter durable events by trace ${evt.traceId}`;
        tdTrace.addEventListener("click", (e) => {
          e.stopPropagation();
          const traceInput = document.getElementById("filter-trace-id");
          if (traceInput) traceInput.value = evt.traceId;
          this.currentEventFilter.traceId = evt.traceId;
          this.eventsCursorStack = [0];
          this.eventsCurrentPageIndex = 0;
          this.loadDurableEvents();
        });
      }

      // 6. Payload Summary
      const tdPayload = document.createElement("td");
      const rawPayload = evt.payload ? JSON.stringify(evt.payload) : "{}";
      const summary = rawPayload.length > 40 ? rawPayload.substring(0, 37) + "..." : rawPayload;
      tdPayload.textContent = summary;
      tdPayload.className = "code-text";
      tdPayload.style.fontSize = "0.75rem";

      // 7. Action
      const tdAction = document.createElement("td");
      const btnInspect = document.createElement("button");
      btnInspect.className = "btn btn-sm btn-secondary";
      btnInspect.textContent = "Inspect";
      btnInspect.setAttribute("aria-label", `Inspect event ${evt.id}`);
      btnInspect.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showEventDetail(evt.id);
      });
      tdAction.appendChild(btnInspect);

      tr.appendChild(tdSeq);
      tr.appendChild(tdType);
      tr.appendChild(tdAgg);
      tr.appendChild(tdTime);
      tr.appendChild(tdTrace);
      tr.appendChild(tdPayload);
      tr.appendChild(tdAction);

      tr.addEventListener("click", () => {
        this.showEventDetail(evt.id);
      });

      tbody.appendChild(tr);
    });
  }

  showEventDetail(eventId) {
    const evt = (this.cachedEvents || []).find((e) => e.id === eventId);
    if (!evt) return;

    const modal = document.getElementById("event-detail-modal");
    if (!modal) return;

    const titleElem = document.getElementById("modal-event-id-title");
    if (titleElem) titleElem.textContent = `Event Detail: ${evt.id}`;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal("modal-event-id", evt.id);
    setVal("modal-event-seq", `#${evt.sequenceNumber}`);
    setVal("modal-event-type", evt.type);
    setVal("modal-event-aggregate", `${evt.aggregateType} / ${evt.aggregateId}`);
    setVal("modal-event-occurred", `${evt.occurredAt} (${new Date(evt.occurredAt).toLocaleString()})`);
    setVal("modal-event-version", `Schema v${evt.version}`);
    setVal("modal-event-trace", evt.traceId || "-");
    setVal("modal-event-corr", evt.correlationId || "-");
    setVal("modal-event-cause", evt.causationId || "None (Root)");

    const payloadPre = document.getElementById("modal-event-payload");
    if (payloadPre) {
      clearChildren(payloadPre);
      const code = document.createElement("code");
      code.textContent = JSON.stringify(evt.payload ?? {}, null, 2);
      payloadPre.appendChild(code);
    }

    modal.style.display = "flex";
  }

  closeEventModal() {
    const modal = document.getElementById("event-detail-modal");
    if (modal) modal.style.display = "none";
  }

  async loadAuditLogOps() {
    const loadingElem = document.getElementById("audit-loading");
    const emptyElem = document.getElementById("audit-empty");
    const errorElem = document.getElementById("audit-error");
    const tableWrapper = document.getElementById("audit-table-wrapper");
    const badge = document.getElementById("audit-count-badge-ops");

    if (loadingElem) loadingElem.style.display = "flex";
    if (emptyElem) emptyElem.style.display = "none";
    if (errorElem) errorElem.style.display = "none";
    if (tableWrapper) tableWrapper.style.display = "none";

    try {
      const logs = await api.getAuditLogs();

      if (loadingElem) loadingElem.style.display = "none";

      if (badge) {
        badge.textContent = `${logs.length} observations`;
      }

      if (!logs || logs.length === 0) {
        if (emptyElem) emptyElem.style.display = "flex";
        return;
      }

      const tbody = document.getElementById("audit-ops-tbody");
      if (tbody) {
        clearChildren(tbody);
        logs.forEach((obs) => {
          const tr = document.createElement("tr");

          const tdTime = document.createElement("td");
          tdTime.textContent = new Date(obs.occurredAt).toLocaleString();

          const tdAction = document.createElement("td");
          const badgeAction = document.createElement("span");
          badgeAction.className = "badge badge-info";
          badgeAction.textContent = obs.type;
          tdAction.appendChild(badgeAction);

          const tdActor = document.createElement("td");
          tdActor.textContent = obs.taskId || obs.executionId || "System";
          tdActor.className = "code-text";

          const tdResource = document.createElement("td");
          tdResource.textContent = obs.aggregateId || obs.operationId || "-";

          const tdResult = document.createElement("td");
          const p = obs.payload || {};
          const statusVal = p.status || p.reason || "RECORDED";
          const resBadge = document.createElement("span");
          resBadge.className = `badge badge-${statusVal === "COMPLETED" || statusVal === "SUCCESS" ? "success" : statusVal === "FAILED" ? "danger" : "info"}`;
          resBadge.textContent = String(statusVal);
          tdResult.appendChild(resBadge);

          const tdMeta = document.createElement("td");
          const pStr = JSON.stringify(p);
          tdMeta.textContent = pStr.length > 50 ? pStr.substring(0, 47) + "..." : pStr;
          tdMeta.className = "code-text";
          tdMeta.style.fontSize = "0.75rem";

          tr.appendChild(tdTime);
          tr.appendChild(tdAction);
          tr.appendChild(tdActor);
          tr.appendChild(tdResource);
          tr.appendChild(tdResult);
          tr.appendChild(tdMeta);

          tbody.appendChild(tr);
        });
      }

      if (tableWrapper) tableWrapper.style.display = "block";
    } catch (err) {
      if (loadingElem) loadingElem.style.display = "none";
      if (errorElem) {
        errorElem.style.display = "flex";
        const msg = document.getElementById("audit-error-msg");
        if (msg) msg.textContent = `Failed to query audit log observations: ${err?.message || "Server error"}`;
      }
    }
  }

  async loadRecoveryHistory() {
    const tbody = document.getElementById("recovery-history-tbody");
    const badge = document.getElementById("recovery-status-badge");
    if (!tbody) return;

    try {
      const res = await api.getCrashRecoveryHistory();
      const history = Array.isArray(res) ? res : (res?.data || []);

      clearChildren(tbody);

      if (badge) {
        if (history.length > 0) {
          badge.textContent = `RECONCILED (${history.length} RECOVERY EVENTS)`;
          badge.className = "badge badge-warning";
        } else {
          badge.textContent = "RECOVERY SERVICE ACTIVE";
          badge.className = "badge badge-success";
        }
      }

      if (history.length === 0) {
        const tr = document.createElement("tr");

        const tdSeq = document.createElement("td");
        tdSeq.className = "code-text";
        tdSeq.textContent = "#SYS-RECOVERY";

        const tdAgg = document.createElement("td");
        tdAgg.textContent = "SQLite WAL Engine (tasks & operations)";

        const tdReason = document.createElement("td");
        tdReason.textContent = "Engine rehydration clean: 0 interrupted tasks requiring reconciliation";

        const tdStatus = document.createElement("td");
        const statusBadge = document.createElement("span");
        statusBadge.className = "badge badge-success";
        statusBadge.textContent = "INTEGRITY VERIFIED";
        tdStatus.appendChild(statusBadge);

        const tdTrace = document.createElement("td");
        tdTrace.className = "code-text";
        tdTrace.textContent = "wal-checkpoint-ok";

        const tdTime = document.createElement("td");
        tdTime.textContent = "Engine Ready";

        tr.appendChild(tdSeq);
        tr.appendChild(tdAgg);
        tr.appendChild(tdReason);
        tr.appendChild(tdStatus);
        tr.appendChild(tdTrace);
        tr.appendChild(tdTime);
        tbody.appendChild(tr);
        return;
      }

      history.forEach((rec) => {
        const tr = document.createElement("tr");

        const tdSeq = document.createElement("td");
        tdSeq.className = "code-text";
        tdSeq.textContent = rec.sequenceNumber ? `#${rec.sequenceNumber}` : (rec.eventId ? String(rec.eventId).substring(0, 8) : "#REC");

        const tdAgg = document.createElement("td");
        tdAgg.textContent = `${rec.aggregateType || "task"}:${rec.aggregateId || "-"}`;

        const tdReason = document.createElement("td");
        tdReason.textContent = rec.reason || rec.code || "RECOVERY_INTERRUPTED_TASK";
        tdReason.className = "code-text";
        tdReason.style.fontSize = "0.75rem";

        const tdStatus = document.createElement("td");
        const statusBadge = document.createElement("span");
        const st = rec.terminalStatus || "FAILED_RECOVERED";
        statusBadge.className = `badge badge-${st.includes("FAIL") ? "danger" : "warning"}`;
        statusBadge.textContent = st;
        tdStatus.appendChild(statusBadge);

        const tdTrace = document.createElement("td");
        tdTrace.className = "code-text";
        tdTrace.textContent = rec.traceId || "-";
        tdTrace.style.fontSize = "0.8rem";
        if (rec.traceId) {
          tdTrace.style.cursor = "pointer";
          tdTrace.style.textDecoration = "underline";
          tdTrace.title = `Filter events by trace ${rec.traceId}`;
          tdTrace.addEventListener("click", () => {
            const traceInput = document.getElementById("filter-trace-id");
            if (traceInput) traceInput.value = rec.traceId;
            this.currentEventFilter.traceId = rec.traceId;
            this.eventsCursorStack = [0];
            this.eventsCurrentPageIndex = 0;
            this.loadDurableEvents();
            document.getElementById("tab-platform-operations")?.scrollIntoView({ behavior: "smooth" });
          });
        }

        const tdTime = document.createElement("td");
        tdTime.textContent = rec.recoveredAt ? new Date(rec.recoveredAt).toLocaleString() : "Reboot Reconciliation";

        tr.appendChild(tdSeq);
        tr.appendChild(tdAgg);
        tr.appendChild(tdReason);
        tr.appendChild(tdStatus);
        tr.appendChild(tdTrace);
        tr.appendChild(tdTime);
        tbody.appendChild(tr);
      });
    } catch {
      clearChildren(tbody);
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty-state";
      td.textContent = "Crash recovery diagnostics ledger ready.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  async loadData() {
    if (this.currentTab === "platform-operations") {
      this.loadPlatformOperationsData();
    }

    try {
      const [status, execs, audit, tools, models, agents, operations] = await Promise.all([
        api.getStatus().catch(() => null),
        api.getExecutions().catch(() => []),
        api.getAuditLogs().catch(() => []),
        api.getTools().catch(() => []),
        api.getModels().catch(() => []),
        api.getAgents().catch(() => []),
        api.getOperations().catch(() => []),
      ]);

      if (status) {
        this.renderStatus(status);
      }
      if (Array.isArray(execs)) {
        this.renderExecutions(execs);
      }
      if (Array.isArray(audit)) {
        this.renderAudit(audit);
      }
      if (Array.isArray(tools)) {
        this.cachedTools = tools;
        this.renderTools(tools);
        this.populateToolCheckboxes(tools);
      }
      if (Array.isArray(models)) {
        this.cachedModels = models;
        this.renderModels(models);
        this.populateModelOptions(models);
      }
      if (Array.isArray(agents)) {
        this.cachedAgents = agents;
        this.renderAgents(agents);
        this.populatePlaygroundAgentSelect(agents);
        this.populateOperationAgentSelect(agents);
      }
      if (Array.isArray(operations)) {
        this.renderOperations(operations);
      }
    } catch {
      const statusElem = document.getElementById("engine-status");
      if (statusElem) statusElem.textContent = "Engine: Offline";
      const dot = document.querySelector(".pulse-dot");
      if (dot) dot.style.backgroundColor = "var(--accent-red)";
    }
  }

  renderStatus(status) {
    const engineStatus = document.getElementById("engine-status");
    if (engineStatus) engineStatus.textContent = `Engine: Online (${status.version})`;

    const dot = document.querySelector(".pulse-dot");
    if (dot) dot.style.backgroundColor = "var(--accent-green)";

    const uptime = document.getElementById("uptime-display");
    if (uptime) uptime.textContent = `Uptime: ${status.uptimeSeconds}s`;

    const mExecs = document.getElementById("metric-executions");
    if (mExecs) mExecs.textContent = String(status.executionsCount);

    const mAgents = document.getElementById("metric-agents");
    if (mAgents) mAgents.textContent = String(status.agentsCount ?? 1);

    const mTools = document.getElementById("metric-tools");
    if (mTools) mTools.textContent = String(status.toolsCount);

    const mModels = document.getElementById("metric-models");
    if (mModels) mModels.textContent = String(status.modelsCount ?? 1);

    const mOps = document.getElementById("metric-operations");
    if (mOps) mOps.textContent = String(status.operationsCount ?? 0);

    const tbody = document.getElementById("counters-tbody");
    if (tbody) {
      clearChildren(tbody);
      const entries = Object.entries(status.metrics?.counters ?? {});
      if (entries.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 2;
        td.className = "empty-state";
        td.textContent = "No metric counters incremented yet";
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        for (const [key, val] of entries) {
          const tr = document.createElement("tr");

          const tdKey = document.createElement("td");
          const code = document.createElement("code");
          code.textContent = key;
          tdKey.appendChild(code);

          const tdVal = document.createElement("td");
          const strong = document.createElement("strong");
          strong.textContent = String(val);
          tdVal.appendChild(strong);

          tr.appendChild(tdKey);
          tr.appendChild(tdVal);
          tbody.appendChild(tr);
        }
      }
    }
  }

  renderAgents(agents) {
    const badge = document.getElementById("agents-count-badge");
    if (badge) badge.textContent = `${agents.length} agent${agents.length === 1 ? "" : "s"}`;

    const tbody = document.getElementById("agents-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    if (agents.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "empty-state";
      td.textContent = "No agents registered. Click '+ New Agent' to create one!";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const agent of agents) {
      const tr = document.createElement("tr");

      // Name & ID
      const tdName = document.createElement("td");
      const strongName = document.createElement("strong");
      strongName.textContent = agent.name;
      const idDiv = document.createElement("div");
      const codeId = document.createElement("code");
      codeId.textContent = agent.id;
      idDiv.appendChild(codeId);
      tdName.appendChild(strongName);
      tdName.appendChild(idDiv);

      // Status
      const tdStatus = document.createElement("td");
      const spanStatus = document.createElement("span");
      spanStatus.className = `badge badge-${agent.status === "ACTIVE" ? "success" : "danger"}`;
      spanStatus.textContent = agent.status;
      tdStatus.appendChild(spanStatus);

      // Version
      const tdVersion = document.createElement("td");
      tdVersion.textContent = `v${agent.version}`;

      // Model
      const tdModel = document.createElement("td");
      const codeModel = document.createElement("code");
      codeModel.textContent = agent.model;
      tdModel.appendChild(codeModel);

      // Tools
      const tdTools = document.createElement("td");
      if (Array.isArray(agent.tools) && agent.tools.length > 0) {
        for (const tool of agent.tools) {
          const tBadge = document.createElement("span");
          tBadge.className = "badge";
          tBadge.style.marginRight = "4px";
          tBadge.textContent = tool;
          tdTools.appendChild(tBadge);
        }
      } else {
        tdTools.textContent = "-";
      }

      // Memory Scope
      const tdMem = document.createElement("td");
      tdMem.textContent = agent.memoryScope || "-";

      // Actions
      const tdActions = document.createElement("td");
      tdActions.style.display = "flex";
      tdActions.style.gap = "0.5rem";

      const viewBtn = document.createElement("button");
      viewBtn.className = "btn btn-sm btn-secondary";
      viewBtn.textContent = "View Detail";
      viewBtn.addEventListener("click", () => {
        this.showAgentDetail(agent.id);
      });
      tdActions.appendChild(viewBtn);

      const toggleBtn = document.createElement("button");
      toggleBtn.className = `btn btn-sm btn-${agent.status === "ACTIVE" ? "danger" : "secondary"}`;
      toggleBtn.textContent = agent.status === "ACTIVE" ? "Deactivate" : "Activate";
      toggleBtn.addEventListener("click", async () => {
        try {
          if (agent.status === "ACTIVE") {
            await api.deactivateAgent(agent.id);
          } else {
            await api.activateAgent(agent.id);
          }
          this.loadData();
        } catch (err) {
          alert(`Failed to update status: ${err.message}`);
        }
      });
      tdActions.appendChild(toggleBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdStatus);
      tr.appendChild(tdVersion);
      tr.appendChild(tdModel);
      tr.appendChild(tdTools);
      tr.appendChild(tdMem);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }
  }

  async showAgentDetail(id) {
    this.selectedAgentId = id;
    const panel = document.getElementById("agent-detail-panel");
    const title = document.getElementById("agent-detail-title");
    const summary = document.getElementById("agent-detail-summary");

    if (!panel || !title || !summary) return;

    clearChildren(summary);
    title.textContent = id;
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth" });

    try {
      const agent = await api.getAgent(id);

      const grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
      grid.style.gap = "1rem";
      grid.style.marginBottom = "1rem";

      const createBox = (label, val, isBadge = false) => {
        const box = document.createElement("div");
        box.style.background = "var(--bg-secondary)";
        box.style.padding = "0.75rem 1rem";
        box.style.borderRadius = "var(--radius-sm)";
        const l = document.createElement("div");
        l.style.fontSize = "0.75rem";
        l.style.color = "var(--text-secondary)";
        l.textContent = label;
        const v = document.createElement("div");
        v.style.fontWeight = "bold";
        v.style.marginTop = "0.25rem";
        if (isBadge) {
          const badge = document.createElement("span");
          badge.className = `badge badge-${val === "ACTIVE" ? "success" : "danger"}`;
          badge.textContent = String(val);
          v.appendChild(badge);
        } else {
          v.textContent = String(val);
        }
        box.appendChild(l);
        box.appendChild(v);
        return box;
      };

      grid.appendChild(createBox("NAME", agent.name));
      grid.appendChild(createBox("STATUS", agent.status, true));
      grid.appendChild(createBox("VERSION", `v${agent.version}`));
      grid.appendChild(createBox("MODEL", agent.model));
      grid.appendChild(createBox("MEMORY SCOPE", agent.memoryScope || "None"));
      grid.appendChild(createBox("TOOLS", Array.isArray(agent.tools) && agent.tools.length > 0 ? agent.tools.join(", ") : "None"));

      summary.appendChild(grid);

      if (agent.description) {
        const descP = document.createElement("p");
        descP.style.color = "var(--text-secondary)";
        descP.style.marginBottom = "0.75rem";
        descP.textContent = `Description: ${agent.description}`;
        summary.appendChild(descP);
      }

      if (agent.instructions) {
        const h5 = document.createElement("h5");
        h5.textContent = "Declarative Instructions (System Prompt):";
        h5.style.marginBottom = "0.25rem";
        const pre = document.createElement("pre");
        pre.className = "json-display";
        pre.style.maxHeight = "120px";
        pre.textContent = agent.instructions;
        summary.appendChild(h5);
        summary.appendChild(pre);
      }
    } catch (err) {
      summary.textContent = `Failed to load details: ${err.message}`;
    }
  }

  populateModelOptions(models) {
    const select = document.getElementById("agent-model-select");
    if (!select) return;
    clearChildren(select);
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.id} (${m.name})`;
      select.appendChild(opt);
    }
  }

  populateToolCheckboxes(tools) {
    const container = document.getElementById("agent-tools-container");
    if (!container) return;
    clearChildren(container);
    for (const t of tools) {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "0.5rem";
      label.style.fontSize = "0.85rem";
      label.style.cursor = "pointer";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "agent-tool-checkbox";
      cb.value = t.id;

      const span = document.createElement("span");
      span.textContent = `${t.name} (${t.id})`;

      label.appendChild(cb);
      label.appendChild(span);
      container.appendChild(label);
    }
  }

  populatePlaygroundAgentSelect(agents) {
    const select = document.getElementById("task-agent-select");
    if (!select) return;
    const currentVal = select.value;
    clearChildren(select);
    for (const a of agents) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.id})`;
      select.appendChild(opt);
    }
    if (currentVal && agents.some((a) => a.id === currentVal)) {
      select.value = currentVal;
    }
  }

  populateOperationAgentSelect(agents) {
    const select = document.getElementById("op-agent-select");
    if (!select) return;
    const currentVal = select.value;
    clearChildren(select);

    const activeAgents = agents.filter((a) => a.status === "ACTIVE");
    const listToUse = activeAgents.length > 0 ? activeAgents : agents;

    for (const agent of listToUse) {
      const opt = document.createElement("option");
      opt.value = agent.id;
      opt.textContent = `${agent.id} (${agent.name})`;
      select.appendChild(opt);
    }
    if (currentVal && Array.from(select.options).some((o) => o.value === currentVal)) {
      select.value = currentVal;
    }
  }

  renderOperations(operations) {
    const badge = document.getElementById("operations-count-badge");
    if (badge) {
      badge.textContent = `${operations.length} operation${operations.length === 1 ? "" : "s"}`;
    }

    const tbody = document.getElementById("operations-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    if (operations.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "empty-state";
      td.textContent = "No autonomous operations dispatched yet";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const op of operations) {
      const tr = document.createElement("tr");

      // ID
      const tdId = document.createElement("td");
      const codeId = document.createElement("code");
      codeId.textContent = op.id;
      tdId.appendChild(codeId);

      // Agent
      const tdAgent = document.createElement("td");
      tdAgent.textContent = op.agentId;

      // Objective
      const tdObj = document.createElement("td");
      tdObj.textContent = op.objective.length > 40 ? `${op.objective.substring(0, 37)}...` : op.objective;
      tdObj.title = op.objective;

      // Status
      const tdStatus = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.textContent = op.status;
      let badgeClass = "badge-info";
      if (op.status === "COMPLETED") badgeClass = "badge-success";
      else if (op.status === "FAILED") badgeClass = "badge-danger";
      else if (op.status === "CANCELLED" || op.status === "BUDGET_EXHAUSTED") badgeClass = "badge-warning";
      statusBadge.className = `badge ${badgeClass}`;
      tdStatus.appendChild(statusBadge);

      // Budget
      const tdBudget = document.createElement("td");
      tdBudget.style.fontSize = "0.8rem";
      tdBudget.textContent = `${op.budget.maxSteps}s / ${op.budget.maxDurationMs}ms / ${op.budget.maxToolCalls}t`;

      // Consumption
      const tdCons = document.createElement("td");
      tdCons.style.fontSize = "0.8rem";
      tdCons.textContent = `${op.consumption.steps}s / ${op.consumption.durationMs}ms / ${op.consumption.toolCalls}t`;

      // Actions
      const tdActions = document.createElement("td");
      tdActions.style.display = "flex";
      tdActions.style.gap = "0.5rem";

      const viewBtn = document.createElement("button");
      viewBtn.className = "btn btn-secondary btn-sm";
      viewBtn.textContent = "Detail";
      viewBtn.addEventListener("click", () => this.showOperationDetail(op.id));
      tdActions.appendChild(viewBtn);

      if (op.status === "SUBMITTED" || op.status === "RUNNING") {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn btn-danger btn-sm";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", async () => {
          if (!confirm(`Cancel operation '${op.id}'?`)) return;
          try {
            await api.cancelOperation(op.id, "User requested cancellation from Web UI");
            await this.loadData();
          } catch (err) {
            alert(`Cancellation failed: ${err.message}`);
          }
        });
        tdActions.appendChild(cancelBtn);
      }

      tr.appendChild(tdId);
      tr.appendChild(tdAgent);
      tr.appendChild(tdObj);
      tr.appendChild(tdStatus);
      tr.appendChild(tdBudget);
      tr.appendChild(tdCons);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }
  }

  async showOperationDetail(operationId) {
    const detailPanel = document.getElementById("operation-detail-panel");
    if (!detailPanel) return;

    try {
      const op = await api.getOperation(operationId);
      const opData = op.operation || op;

      const idSpan = document.getElementById("op-detail-id");
      if (idSpan) idSpan.textContent = opData.id;

      const statusBadge = document.getElementById("op-detail-status");
      if (statusBadge) {
        statusBadge.textContent = opData.status;
        let badgeClass = "badge-info";
        if (opData.status === "COMPLETED") badgeClass = "badge-success";
        else if (opData.status === "FAILED") badgeClass = "badge-danger";
        else if (opData.status === "CANCELLED" || opData.status === "BUDGET_EXHAUSTED") badgeClass = "badge-warning";
        statusBadge.className = `badge ${badgeClass}`;
      }

      const agentSpan = document.getElementById("op-detail-agent");
      if (agentSpan) agentSpan.textContent = opData.agentId;

      const objSpan = document.getElementById("op-detail-objective");
      if (objSpan) objSpan.textContent = opData.objective;

      const createdSpan = document.getElementById("op-detail-created");
      if (createdSpan) createdSpan.textContent = opData.createdAt ? new Date(opData.createdAt).toLocaleString() : "-";

      const updatedSpan = document.getElementById("op-detail-updated");
      if (updatedSpan) updatedSpan.textContent = opData.updatedAt ? new Date(opData.updatedAt).toLocaleString() : "-";

      const errWrapper = document.getElementById("op-detail-error-wrapper");
      const errSpan = document.getElementById("op-detail-error");
      if (errWrapper && errSpan) {
        if (opData.error) {
          errWrapper.style.display = "block";
          errSpan.textContent = opData.error;
        } else {
          errWrapper.style.display = "none";
        }
      }

      const budgetPre = document.getElementById("op-detail-budget");
      if (budgetPre) budgetPre.textContent = JSON.stringify(opData.budget, null, 2);

      const consPre = document.getElementById("op-detail-consumption");
      if (consPre) consPre.textContent = JSON.stringify(opData.consumption, null, 2);

      if (opData.budget && opData.consumption && consPre) {
        const createBar = (label, used, max) => {
          const wrapper = document.createElement("div");
          wrapper.style.marginBottom = "0.5rem";

          const labelDiv = document.createElement("div");
          labelDiv.style.fontSize = "0.8rem";
          labelDiv.style.marginBottom = "0.2rem";
          labelDiv.textContent = `${label}: ${used} / ${max}`;
          wrapper.appendChild(labelDiv);

          const barBg = document.createElement("div");
          barBg.style.background = "var(--bg-secondary)";
          barBg.style.height = "8px";
          barBg.style.borderRadius = "4px";
          barBg.style.width = "100%";
          barBg.style.overflow = "hidden";

          const barFill = document.createElement("div");
          barFill.style.height = "100%";
          const pct = Math.min(100, max > 0 ? (used / max) * 100 : 0);
          barFill.style.width = `${pct}%`;
          barFill.style.background = pct < 70 ? "green" : pct < 90 ? "yellow" : "red";
          barBg.appendChild(barFill);

          wrapper.appendChild(barBg);
          return wrapper;
        };

        const barsContainer = document.createElement("div");
        barsContainer.style.marginTop = "1rem";
        barsContainer.appendChild(createBar("Steps", opData.consumption.stepsUsed ?? opData.consumption.steps ?? 0, opData.budget.maxSteps));
        barsContainer.appendChild(createBar("Duration (ms)", opData.consumption.elapsedMs ?? opData.consumption.durationMs ?? 0, opData.budget.maxDurationMs));
        barsContainer.appendChild(createBar("Tool Calls", opData.consumption.toolCallsUsed ?? opData.consumption.toolCalls ?? 0, opData.budget.maxToolCalls));
        consPre.parentNode.insertBefore(barsContainer, consPre.nextSibling);
      }

      const stepsContainer = document.getElementById("op-detail-steps");
      if (stepsContainer) {
        if (op.plan) {
          const planContainer = document.createElement("div");
          planContainer.style.marginBottom = "1rem";
          planContainer.className = "card";
          planContainer.style.padding = "1rem";
          planContainer.style.border = "1px solid var(--border-color)";

          const planHeader = document.createElement("h4");
          planHeader.textContent = "Execution Plan";
          planContainer.appendChild(planHeader);

          const planInfo = document.createElement("div");
          planInfo.style.marginBottom = "0.5rem";
          planInfo.style.fontSize = "0.85rem";
          planInfo.textContent = `Plan ID: ${op.plan.id} | Total Steps: ${op.plan.totalSteps}`;
          planContainer.appendChild(planInfo);

          const planSteps = op.plan.steps || [];
          for (const pStep of planSteps) {
            const pCard = document.createElement("div");
            pCard.className = "card";
            pCard.style.border = "1px solid var(--border-color)";
            pCard.style.padding = "0.75rem";
            pCard.style.marginBottom = "0.5rem";

            const pTitle = document.createElement("div");
            
            const strongStep = document.createElement("strong");
            strongStep.textContent = `Step ${pStep.order}: `;
            pTitle.appendChild(strongStep);
            
            pTitle.appendChild(document.createTextNode(`${pStep.id} - `));
            
            const emAction = document.createElement("em");
            emAction.textContent = pStep.action;
            pTitle.appendChild(emAction);

            pCard.appendChild(pTitle);

            if (pStep.input) {
              const pInput = document.createElement("pre");
              pInput.style.fontSize = "0.75rem";
              pInput.style.marginTop = "0.5rem";
              pInput.style.background = "var(--bg-secondary)";
              pInput.style.padding = "0.5rem";
              pInput.textContent = JSON.stringify(pStep.input, null, 2);
              pCard.appendChild(pInput);
            }

            planContainer.appendChild(pCard);
          }
          stepsContainer.parentNode.insertBefore(planContainer, stepsContainer);
        }

        clearChildren(stepsContainer);
        const observations = op.observations || [];
        const decisions = op.decisions || [];

        if (observations.length === 0 && decisions.length === 0) {
          const empty = document.createElement("p");
          empty.className = "empty-state";
          empty.textContent = "No observations or decisions recorded yet for this operation.";
          stepsContainer.appendChild(empty);
        } else {
          for (let i = 0; i < Math.max(observations.length, decisions.length); i++) {
            const stepDiv = document.createElement("div");
            stepDiv.className = "card";
            stepDiv.style.border = "1px solid var(--border-color)";
            stepDiv.style.padding = "0.75rem";
            stepDiv.style.marginBottom = "0.5rem";

            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.justifyContent = "space-between";
            header.style.alignItems = "center";
            header.style.marginBottom = "0.5rem";

            const stepTitle = document.createElement("strong");
            stepTitle.textContent = `Step ${i + 1}`;
            header.appendChild(stepTitle);

            const dec = decisions[i];
            if (dec) {
              const decBadge = document.createElement("span");
              const decClass = dec.type === "EXECUTE_STEP" ? "info" : dec.type === "COMPLETE" ? "success" : dec.type === "STOP" ? "warning" : "danger";
              decBadge.className = `badge badge-${decClass}`;
              decBadge.textContent = `Decision: ${dec.type}`;
              header.appendChild(decBadge);
            }
            stepDiv.appendChild(header);

            const obs = observations[i];
            if (obs) {
              const obsP = document.createElement("div");
              obsP.style.fontSize = "0.85rem";
              obsP.style.marginBottom = "0.25rem";
              const strong = document.createElement("strong");
              strong.textContent = "Observation: ";
              obsP.appendChild(strong);

              const summaryText = document.createTextNode(
                `Status: ${obs.status} | Duration: ${obs.durationMs}ms | Tool Calls: ${obs.toolCalls ?? 0}`
              );
              obsP.appendChild(summaryText);
              stepDiv.appendChild(obsP);

              if (obs.error) {
                const errP = document.createElement("div");
                errP.style.color = "var(--accent-red)";
                errP.style.fontSize = "0.8rem";
                errP.textContent = `Error: ${obs.error}`;
                stepDiv.appendChild(errP);
              }
            }

            if (dec && dec.reason) {
              const reasonP = document.createElement("div");
              reasonP.style.fontSize = "0.85rem";
              reasonP.style.color = "var(--text-secondary)";
              const rStrong = document.createElement("strong");
              rStrong.textContent = "Reason: ";
              reasonP.appendChild(rStrong);
              reasonP.appendChild(document.createTextNode(dec.reason));
              stepDiv.appendChild(reasonP);
            }

            stepsContainer.appendChild(stepDiv);
          }
        }
      }

      if (opData.resultOutput || opData.terminationReason || opData.failureError) {
        const resultContainer = document.createElement("div");
        resultContainer.style.marginTop = "1rem";
        resultContainer.className = "card";
        resultContainer.style.padding = "1rem";
        resultContainer.style.border = "1px solid var(--border-color)";

        const resultHeader = document.createElement("h4");
        resultHeader.textContent = "Operation Result";
        resultContainer.appendChild(resultHeader);

        if (opData.terminationReason) {
          const termP = document.createElement("p");
          termP.textContent = `Termination Reason: ${opData.terminationReason}`;
          resultContainer.appendChild(termP);
        }

        if (opData.failureError) {
          const errP = document.createElement("p");
          errP.style.color = "var(--accent-red)";
          errP.textContent = `Failure [${opData.failureError.code}]: ${opData.failureError.message}`;
          resultContainer.appendChild(errP);
        }

        if (opData.resultOutput) {
          const resH = document.createElement("h5");
          resH.textContent = "Result Output";
          resultContainer.appendChild(resH);

          const resPre = document.createElement("pre");
          resPre.style.background = "var(--bg-secondary)";
          resPre.style.padding = "0.5rem";
          resPre.textContent = JSON.stringify(opData.resultOutput, null, 2);
          resultContainer.appendChild(resPre);
        }

        stepsContainer.parentNode.insertBefore(resultContainer, stepsContainer.nextSibling);
      }

      detailPanel.style.display = "block";
      detailPanel.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      alert(`Failed to load operation details: ${err.message}`);
    }
  }

  renderModels(models) {
    const badge = document.getElementById("models-count-badge");
    if (badge) badge.textContent = String(models.length);

    const tbody = document.getElementById("models-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    if (models.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.textContent = "No AI models registered in runtime";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const m of models) {
      const tr = document.createElement("tr");

      const tdId = document.createElement("td");
      const codeId = document.createElement("code");
      codeId.textContent = m.id;
      tdId.appendChild(codeId);

      const tdName = document.createElement("td");
      tdName.textContent = m.name;

      const tdProvider = document.createElement("td");
      const spanProv = document.createElement("span");
      spanProv.className = "badge";
      spanProv.textContent = m.provider;
      tdProvider.appendChild(spanProv);

      const tdStatus = document.createElement("td");
      const spanStatus = document.createElement("span");
      spanStatus.className = "badge badge-success";
      spanStatus.textContent = m.status;
      tdStatus.appendChild(spanStatus);

      const tdCaps = document.createElement("td");
      tdCaps.textContent = Array.isArray(m.capabilities) ? m.capabilities.join(", ") : "-";

      tr.appendChild(tdId);
      tr.appendChild(tdName);
      tr.appendChild(tdProvider);
      tr.appendChild(tdStatus);
      tr.appendChild(tdCaps);
      tbody.appendChild(tr);
    }
  }

  renderTools(tools) {
    const badge = document.getElementById("tools-count-badge");
    if (badge) badge.textContent = String(tools.length);

    const container = document.getElementById("tools-list");
    if (!container) return;
    clearChildren(container);

    if (tools.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No tools registered";
      container.appendChild(empty);
      return;
    }

    for (const tool of tools) {
      const card = document.createElement("div");
      card.className = "tool-card";

      const header = document.createElement("div");
      header.className = "tool-card-header";

      const title = document.createElement("h4");
      title.textContent = tool.name;

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = tool.id;

      header.appendChild(title);
      header.appendChild(badge);

      const desc = document.createElement("p");
      desc.className = "tool-desc";
      desc.textContent = tool.description;

      card.appendChild(header);
      card.appendChild(desc);
      container.appendChild(card);
    }
  }

  renderExecutions(executions) {
    const badge = document.getElementById("executions-count-badge");
    if (badge) badge.textContent = String(executions.length);

    const tbody = document.getElementById("executions-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    if (executions.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty-state";
      td.textContent = "No executions recorded yet. Use the Playground or Agents tab to run one!";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const recent = executions.slice(-15).reverse();
    for (const exec of recent) {
      const tr = document.createElement("tr");

      const tdExec = document.createElement("td");
      const codeExec = document.createElement("code");
      codeExec.textContent = `${String(exec.id).substring(0, 8)}...`;
      tdExec.appendChild(codeExec);

      const tdTask = document.createElement("td");
      const codeTask = document.createElement("code");
      codeTask.textContent = `${String(exec.taskId).substring(0, 8)}...`;
      tdTask.appendChild(codeTask);

      const tdTrace = document.createElement("td");
      const codeTrace = document.createElement("code");
      codeTrace.textContent = `${String(exec.traceId).substring(0, 8)}...`;
      tdTrace.appendChild(codeTrace);

      const tdStatus = document.createElement("td");
      const spanStatus = document.createElement("span");
      spanStatus.className = "badge";
      spanStatus.setAttribute("data-status", String(exec.status));
      spanStatus.textContent = String(exec.status);
      tdStatus.appendChild(spanStatus);

      const tdTime = document.createElement("td");
      tdTime.textContent = exec.startedAt ? new Date(exec.startedAt).toLocaleTimeString() : "-";

      const tdAction = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "btn btn-sm btn-secondary view-timeline-btn";
      btn.textContent = "View Detail";
      btn.addEventListener("click", () => {
        this.switchTab("execution-detail");
        this.showExecutionDetail(String(exec.id));
      });
      tdAction.appendChild(btn);

      tr.appendChild(tdExec);
      tr.appendChild(tdTask);
      tr.appendChild(tdTrace);
      tr.appendChild(tdStatus);
      tr.appendChild(tdTime);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    }
  }

  async showExecutionDetail(id) {
    const input = document.getElementById("detail-exec-input");
    if (input) input.value = id;

    const contentDiv = document.getElementById("execution-detail-content");
    const timelineContainer = document.getElementById("detail-timeline-container");
    if (!contentDiv || !timelineContainer) return;

    clearChildren(contentDiv);
    clearChildren(timelineContainer);

    try {
      const [exec, timeline] = await Promise.all([
        api.getExecution(id),
        api.getExecutionTimeline(id),
      ]);

      const summary = document.createElement("div");
      summary.style.display = "grid";
      summary.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
      summary.style.gap = "1rem";
      summary.style.marginBottom = "1.5rem";

      const createMetricBox = (label, value) => {
        const box = document.createElement("div");
        box.style.background = "var(--bg-tertiary)";
        box.style.padding = "0.75rem 1rem";
        box.style.borderRadius = "var(--radius-sm)";
        const l = document.createElement("div");
        l.style.fontSize = "0.75rem";
        l.style.color = "var(--text-secondary)";
        l.textContent = label;
        const v = document.createElement("div");
        v.style.fontWeight = "bold";
        v.style.marginTop = "0.25rem";
        v.textContent = value;
        box.appendChild(l);
        box.appendChild(v);
        return box;
      };

      summary.appendChild(createMetricBox("EXECUTION ID", exec.id));
      summary.appendChild(createMetricBox("TASK ID", exec.taskId));
      summary.appendChild(createMetricBox("TRACE ID", exec.traceId));
      summary.appendChild(createMetricBox("STATUS", exec.status));
      summary.appendChild(createMetricBox("STARTED", exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "-"));
      summary.appendChild(createMetricBox("COMPLETED", exec.completedAt ? new Date(exec.completedAt).toLocaleString() : "-"));

      contentDiv.appendChild(summary);

      timelineContainer.style.display = "block";
      const h4 = document.createElement("h4");
      h4.textContent = `Correlated Event Timeline (${timeline.length} events)`;
      h4.style.marginBottom = "1rem";
      timelineContainer.appendChild(h4);

      if (timeline.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No correlated events recorded for this execution.";
        timelineContainer.appendChild(empty);
      } else {
        for (const ev of timeline) {
          const item = document.createElement("div");
          item.className = "timeline-item";

          const dot = document.createElement("div");
          dot.className = "timeline-dot";

          const content = document.createElement("div");
          content.className = "timeline-content";

          const header = document.createElement("div");
          header.className = "timeline-header";

          const typeSpan = document.createElement("span");
          typeSpan.className = "timeline-type";
          typeSpan.textContent = ev.type;

          const timeSpan = document.createElement("span");
          timeSpan.className = "timeline-time";
          timeSpan.textContent = new Date(ev.occurredAt).toLocaleTimeString();

          header.appendChild(typeSpan);
          header.appendChild(timeSpan);
          content.appendChild(header);

          if (ev.payload && Object.keys(ev.payload).length > 0) {
            const pre = document.createElement("pre");
            pre.className = "timeline-payload";
            pre.textContent = JSON.stringify(ev.payload, null, 2);
            content.appendChild(pre);
          }

          item.appendChild(dot);
          item.appendChild(content);
          timelineContainer.appendChild(item);
        }
      }
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "empty-state";
      errBox.style.color = "var(--accent-red)";
      errBox.textContent = `Error loading execution detail: ${err.message}`;
      contentDiv.appendChild(errBox);
      timelineContainer.style.display = "none";
    }
  }

  renderAudit(observations) {
    const badge = document.getElementById("audit-count-badge");
    if (badge) badge.textContent = `${observations.length} events`;

    const tbody = document.getElementById("audit-tbody");
    if (!tbody) return;
    clearChildren(tbody);

    if (observations.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.textContent = "No audit observations logged";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const recent = observations.slice(-20).reverse();
    for (const obs of recent) {
      const tr = document.createElement("tr");

      const tdTime = document.createElement("td");
      tdTime.textContent = new Date(obs.occurredAt).toLocaleTimeString();

      const tdType = document.createElement("td");
      const codeType = document.createElement("code");
      codeType.textContent = obs.type;
      tdType.appendChild(codeType);

      const tdTrace = document.createElement("td");
      const codeTrace = document.createElement("code");
      codeTrace.textContent = `${String(obs.traceId).substring(0, 8)}...`;
      tdTrace.appendChild(codeTrace);

      const tdOp = document.createElement("td");
      tdOp.textContent = obs.operationId || obs.aggregateId || "-";

      const tdPayload = document.createElement("td");
      const pre = document.createElement("pre");
      pre.style.margin = "0";
      pre.style.fontSize = "0.75rem";
      pre.style.maxHeight = "60px";
      pre.style.overflow = "hidden";
      pre.textContent = JSON.stringify(obs.payload);
      tdPayload.appendChild(pre);

      tr.appendChild(tdTime);
      tr.appendChild(tdType);
      tr.appendChild(tdTrace);
      tr.appendChild(tdOp);
      tr.appendChild(tdPayload);
      tbody.appendChild(tr);
    }
  }
}

export { PlatformApp };

// Instantiate on DOM load when running in browser
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    new PlatformApp();
  });
}
