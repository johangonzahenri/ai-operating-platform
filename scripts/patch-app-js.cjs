const fs = require("fs");
const path = require("path");

const filePath = path.resolve(__dirname, "../src/platform/web/app.js");
let code = fs.readFileSync(filePath, "utf8");

// 1. Add this.setupCredentials() in init()
if (!code.includes("this.setupCredentials();")) {
  code = code.replace("this.setupOrganizations();", "this.setupOrganizations();\n    this.setupCredentials();");
}

// 2. Add properties in constructor
if (!code.includes("this.cachedCredentials = [];")) {
  code = code.replace("this.cachedEvents = [];", "this.cachedEvents = [];\n    this.cachedCredentials = [];\n    this.credSearchQuery = \"\";\n    this.credStatusFilter = \"ALL\";");
}

// 3. Add credential methods
const setupCredentialsCode = `
  setupCredentials() {
    const openBtn = document.getElementById("open-create-cred-btn");
    const closeBtn = document.getElementById("close-create-cred-btn");
    const createPanel = document.getElementById("create-cred-panel");
    const createForm = document.getElementById("create-cred-form");
    const refreshBtn = document.getElementById("refresh-creds-btn");
    const searchInput = document.getElementById("cred-search-input");
    const statusFilter = document.getElementById("cred-status-filter");
    const clearFilterBtn = document.getElementById("cred-clear-filter-btn");
    const closeRawKeyBtn = document.getElementById("close-raw-key-btn");
    const copyRawKeyBtn = document.getElementById("copy-raw-key-btn");
    const rawKeyPanel = document.getElementById("raw-key-revealed-panel");
    const closeRotateBtn = document.getElementById("close-rotate-cred-btn");
    const rotatePanel = document.getElementById("rotate-cred-panel");
    const rotateForm = document.getElementById("rotate-cred-form");

    if (openBtn && createPanel) {
      openBtn.addEventListener("click", () => {
        createPanel.style.display = "block";
      });
    }
    if (closeBtn && createPanel) {
      closeBtn.addEventListener("click", () => {
        createPanel.style.display = "none";
      });
    }
    if (closeRotateBtn && rotatePanel) {
      closeRotateBtn.addEventListener("click", () => {
        rotatePanel.style.display = "none";
      });
    }
    if (closeRawKeyBtn && rawKeyPanel) {
      closeRawKeyBtn.addEventListener("click", () => {
        rawKeyPanel.style.display = "none";
      });
    }
    if (copyRawKeyBtn) {
      copyRawKeyBtn.addEventListener("click", () => {
        const input = document.getElementById("raw-key-display");
        if (input && input.value) {
          navigator.clipboard.writeText(input.value).then(() => {
            copyRawKeyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyRawKeyBtn.textContent = "Copy Key";
            }, 2000);
          }).catch(() => {
            input.select();
            document.execCommand("copy");
            copyRawKeyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyRawKeyBtn.textContent = "Copy Key";
            }, 2000);
          });
        }
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.loadCredentials();
      });
    }
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.credSearchQuery = e.target.value.toLowerCase().trim();
        this.renderCredentials();
      });
    }
    if (statusFilter) {
      statusFilter.addEventListener("change", (e) => {
        this.credStatusFilter = e.target.value;
        this.renderCredentials();
      });
    }
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (statusFilter) statusFilter.value = "ALL";
        this.credSearchQuery = "";
        this.credStatusFilter = "ALL";
        this.renderCredentials();
      });
    }
    if (createForm) {
      createForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("cred-name-input")?.value?.trim();
        const principalId = document.getElementById("cred-principal-id-input")?.value?.trim();
        const principalType = document.getElementById("cred-principal-type-select")?.value;
        const tenantId = document.getElementById("cred-tenant-id-input")?.value?.trim();
        const applicationId = document.getElementById("cred-app-id-input")?.value?.trim();
        const scopesRaw = document.getElementById("cred-scopes-input")?.value?.trim() || "";
        const expiryMs = parseInt(document.getElementById("cred-expiry-select")?.value || "0", 10);

        const scopes = scopesRaw.split(",").map((s) => s.trim()).filter(Boolean);

        try {
          const result = await api.createCredential({
            name,
            principalId,
            principalType,
            tenantId,
            applicationId,
            scopes,
            expiresInMs: expiryMs > 0 ? expiryMs : undefined,
          });

          if (createPanel) createPanel.style.display = "none";
          createForm.reset();

          // Reveal raw key strictly once
          const rawKeyDisplay = document.getElementById("raw-key-display");
          if (rawKeyDisplay && result.rawKey) {
            rawKeyDisplay.value = result.rawKey;
            if (rawKeyPanel) rawKeyPanel.style.display = "block";
          }

          await this.loadCredentials();
        } catch (err) {
          alert(\`Failed to create credential: \${err.message}\`);
        }
      });
    }

    if (rotateForm) {
      rotateForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("rotate-cred-target-id")?.value;
        const reason = document.getElementById("rotate-cred-reason-input")?.value?.trim();
        const graceMs = parseInt(document.getElementById("rotate-cred-grace-select")?.value || "0", 10);

        try {
          const result = await api.rotateCredential(id, {
            reason,
            gracePeriodMs: graceMs > 0 ? graceMs : undefined,
          });

          if (rotatePanel) rotatePanel.style.display = "none";
          rotateForm.reset();

          // Reveal new raw key strictly once
          const rawKeyDisplay = document.getElementById("raw-key-display");
          if (rawKeyDisplay && result.newRawKey) {
            rawKeyDisplay.value = result.newRawKey;
            if (rawKeyPanel) rawKeyPanel.style.display = "block";
          }

          await this.loadCredentials();
        } catch (err) {
          alert(\`Failed to rotate credential: \${err.message}\`);
        }
      });
    }

    this.loadCredentials();
  }

  async loadCredentials() {
    try {
      const res = await api.getCredentials();
      this.cachedCredentials = res.credentials || [];
      this.renderCredentials();
    } catch (err) {
      console.warn("Failed to load credentials:", err);
    }
  }

  renderCredentials() {
    const tbody = document.getElementById("credentials-tbody");
    const countBadge = document.getElementById("credentials-count-badge");
    if (!tbody) return;

    clearChildren(tbody);

    let list = this.cachedCredentials || [];
    if (this.credStatusFilter && this.credStatusFilter !== "ALL") {
      list = list.filter((c) => c.status === this.credStatusFilter);
    }
    if (this.credSearchQuery) {
      const q = this.credSearchQuery;
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.keyPrefix && c.keyPrefix.toLowerCase().includes(q)) ||
          (c.principalId && c.principalId.toLowerCase().includes(q)) ||
          (c.tenantId && c.tenantId.toLowerCase().includes(q)) ||
          (c.applicationId && c.applicationId.toLowerCase().includes(q))
      );
    }

    if (countBadge) {
      countBadge.textContent = \`\${list.length} credential\${list.length === 1 ? "" : "s"}\`;
    }

    if (list.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 10;
      td.className = "empty-state";
      td.textContent = "No API credentials found matching current filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    list.forEach((c) => {
      const tr = document.createElement("tr");

      // Name
      const tdName = document.createElement("td");
      const nameStrong = document.createElement("strong");
      nameStrong.textContent = c.name;
      tdName.appendChild(nameStrong);

      // Prefix
      const tdPrefix = document.createElement("td");
      const codePrefix = document.createElement("code");
      codePrefix.className = "code-text";
      codePrefix.textContent = c.keyPrefix || "aop_live_***";
      tdPrefix.appendChild(codePrefix);

      // Principal
      const tdPrincipal = document.createElement("td");
      const spanPrinc = document.createElement("span");
      spanPrinc.className = "badge badge-neutral";
      spanPrinc.textContent = \`\${c.principalType || "SERVICE"}:\${c.principalId}\`;
      tdPrincipal.appendChild(spanPrinc);

      // Tenant
      const tdTenant = document.createElement("td");
      const codeTenant = document.createElement("code");
      codeTenant.textContent = c.tenantId;
      tdTenant.appendChild(codeTenant);

      // Application
      const tdApp = document.createElement("td");
      const codeApp = document.createElement("code");
      codeApp.textContent = c.applicationId;
      tdApp.appendChild(codeApp);

      // Scopes
      const tdScopes = document.createElement("td");
      const scopes = c.scopes || [];
      const scopesContainer = document.createElement("div");
      scopesContainer.style.display = "flex";
      scopesContainer.style.flexWrap = "wrap";
      scopesContainer.style.gap = "0.25rem";
      scopes.slice(0, 3).forEach((sc) => {
        const scBadge = document.createElement("span");
        scBadge.className = "badge badge-info";
        scBadge.style.fontSize = "0.7rem";
        scBadge.textContent = sc;
        scopesContainer.appendChild(scBadge);
      });
      if (scopes.length > 3) {
        const moreBadge = document.createElement("span");
        moreBadge.className = "badge badge-neutral";
        moreBadge.style.fontSize = "0.7rem";
        moreBadge.textContent = \`+\${scopes.length - 3}\`;
        scopesContainer.appendChild(moreBadge);
      }
      tdScopes.appendChild(scopesContainer);

      // Status
      const tdStatus = document.createElement("td");
      const statusBadge = document.createElement("span");
      if (c.status === "ACTIVE") {
        statusBadge.className = "badge badge-success";
        statusBadge.textContent = "ACTIVE";
      } else if (c.status === "EXPIRED") {
        statusBadge.className = "badge badge-warning";
        statusBadge.textContent = "EXPIRED";
      } else {
        statusBadge.className = "badge badge-error";
        statusBadge.textContent = "REVOKED";
      }
      tdStatus.appendChild(statusBadge);

      // Last Used
      const tdLastUsed = document.createElement("td");
      tdLastUsed.style.fontSize = "0.8rem";
      tdLastUsed.textContent = c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "Never";

      // Expires At
      const tdExpires = document.createElement("td");
      tdExpires.style.fontSize = "0.8rem";
      tdExpires.textContent = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never";

      // Actions
      const tdActions = document.createElement("td");
      const actionsDiv = document.createElement("div");
      actionsDiv.style.display = "flex";
      actionsDiv.style.gap = "0.35rem";

      if (c.status === "ACTIVE") {
        const rotateBtn = document.createElement("button");
        rotateBtn.className = "btn btn-xs btn-warning";
        rotateBtn.textContent = "Rotate";
        rotateBtn.addEventListener("click", () => {
          const targetIdInput = document.getElementById("rotate-cred-target-id");
          const idDisplay = document.getElementById("rotate-cred-id-display");
          const rotatePanel = document.getElementById("rotate-cred-panel");
          if (targetIdInput) targetIdInput.value = c.id;
          if (idDisplay) idDisplay.textContent = c.id;
          if (rotatePanel) rotatePanel.style.display = "block";
        });

        const revokeBtn = document.createElement("button");
        revokeBtn.className = "btn btn-xs btn-danger";
        revokeBtn.textContent = "Revoke";
        revokeBtn.addEventListener("click", () => {
          this.showConfirmationModal(
            "Revoke Credential",
            \`Are you sure you want to revoke API credential "\${c.name}" (\${c.id})? All subsequent requests using this key will immediately be rejected fail-closed.\`,
            async () => {
              try {
                await api.revokeCredential(c.id, { reason: "Revoked by operator via Security Center" });
                await this.loadCredentials();
              } catch (err) {
                alert(\`Failed to revoke credential: \${err.message}\`);
              }
            }
          );
        });

        actionsDiv.append(rotateBtn, revokeBtn);
      } else {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-xs btn-secondary";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          this.showConfirmationModal(
            "Delete Credential Record",
            \`Delete revoked credential "\${c.name}" record?\`,
            async () => {
              try {
                await api.deleteCredential(c.id);
                await this.loadCredentials();
              } catch (err) {
                alert(\`Failed to delete credential: \${err.message}\`);
              }
            }
          );
        });
        actionsDiv.appendChild(deleteBtn);
      }

      tdActions.appendChild(actionsDiv);
      tr.append(tdName, tdPrefix, tdPrincipal, tdTenant, tdApp, tdScopes, tdStatus, tdLastUsed, tdExpires, tdActions);
      tbody.appendChild(tr);
    });
  }
`;

if (!code.includes("setupCredentials()")) {
  code = code.replace("  setupDemoReset() {", setupCredentialsCode + "\n  setupDemoReset() {");
}

fs.writeFileSync(filePath, code, "utf8");
console.log("Successfully patched app.js");
