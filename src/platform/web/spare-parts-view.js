/**
 * src/platform/web/spare-parts-view.js
 * Frontend UI Component for Spare Parts Search, Reactive Filtering & Side-by-Side Comparison.
 *
 * SECURITY INVARIANT:
 * STRICT 0 innerHTML, 0 outerHTML, 0 insertAdjacentHTML, 0 eval.
 * Deterministic DOM tree construction with createElement, textContent, appendChild, classList.
 * XSS-safe text rendering.
 *
 * TRUTH INVARIANT:
 * UNKNOWN !== 0. Undisclosed shipping/taxes are rendered as "Unknown / Pending", never $0.
 * Incompatible offers are flagged with NOT_FIT badge and disabled from side-by-side selection.
 */

function clearNode(elem) {
  if (!elem) return;
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild);
  }
}

export class SparePartsView {
  constructor(options = {}) {
    this.container = null;
    this.apiClient = options.apiClient || null;
    this.onCompareChange = options.onCompareChange || null;

    // State
    this.selectedVehicle = {
      make: "",
      model: "",
      year: "",
      generation: "",
      engine: "",
      market: "",
    };
    this.searchQuery = "";
    this.filters = {
      minPrice: null,
      maxPrice: null,
      fitmentVerdict: "ALL",
      onlyInStock: false,
      minSellerTrust: 0,
    };
    this.searchResults = null; // Last search response
    this.activeCluster = null; // Current selected cluster
    this.selectedOfferIds = new Set(); // Up to 4 offers for comparison
    this.isLoading = false;
    this.errorMessage = null;

    // Pre-populated demo vehicle dataset for quick user selection
    this.vehicleCatalog = [
      { make: "Toyota", model: "Corolla", year: 2020, generation: "E210", engine: "1.8L 2ZR-FAE", market: "CL" },
      { make: "Toyota", model: "Corolla", year: 2016, generation: "E170", engine: "1.8L 2ZR-FE", market: "CL" },
      { make: "Toyota", model: "Yaris", year: 2019, generation: "XP150", engine: "1.5L 2NR-FE", market: "CL" },
      { make: "Nissan", model: "Versa", year: 2021, generation: "N18", engine: "1.6L HR16DE", market: "CL" },
      { make: "Hyundai", model: "Accent", year: 2018, generation: "RB", engine: "1.4L Kappa", market: "CL" },
    ];
  }

  mount(container) {
    this.container = container;
    this.render();
  }

  setResults(results) {
    this.searchResults = results;
    this.isLoading = false;
    this.errorMessage = null;
    this.selectedOfferIds.clear();

    if (results && results.clusters && results.clusters.length > 0) {
      this.activeCluster = results.clusters[0];
    } else {
      this.activeCluster = null;
    }
    this.render();
  }

  setLoading(loading) {
    this.isLoading = loading;
    if (loading) {
      this.errorMessage = null;
    }
    this.render();
  }

  setError(errorMsg) {
    this.errorMessage = errorMsg;
    this.isLoading = false;
    this.render();
  }

  render() {
    if (!this.container) return;
    clearNode(this.container);

    const root = document.createElement("div");
    root.className = "sp-layout";

    // 1. Header Banner & Title
    root.appendChild(this.buildHeader());

    // 2. Vehicle Selector Card
    root.appendChild(this.buildVehicleSelectorCard());

    // 3. Search Bar Card
    root.appendChild(this.buildSearchBarCard());

    // 4. Source Status Tracker (if search results exist)
    if (this.searchResults && this.searchResults.sourceReports) {
      root.appendChild(this.buildSourceStatusPanel());
    }

    // 5. Loading / Error / Empty / Content View
    if (this.isLoading) {
      root.appendChild(this.buildLoadingState());
    } else if (this.errorMessage) {
      root.appendChild(this.buildErrorState());
    } else if (!this.searchResults) {
      root.appendChild(this.buildInitialState());
    } else if (this.searchResults.clustersCount === 0) {
      root.appendChild(this.buildNoResultsState());
    } else {
      // Main 2-column or split layout: Filters Sidebar + Results / Comparison Drawer
      const mainGrid = document.createElement("div");
      mainGrid.className = "sp-main-grid";

      mainGrid.appendChild(this.buildFilterSidebar());
      mainGrid.appendChild(this.buildResultsPanel());

      root.appendChild(mainGrid);

      // Side-by-Side Comparison Section (if offers selected)
      if (this.selectedOfferIds.size > 0) {
        root.appendChild(this.buildSideBySideComparisonSection());
      }
    }

    this.container.appendChild(root);
  }

  // -------------------------------------------------------------
  // Section Builders
  // -------------------------------------------------------------

  buildHeader() {
    const card = document.createElement("div");
    card.className = "card full-width sp-header-card";

    const titleRow = document.createElement("div");
    titleRow.className = "sp-title-row";

    const titleDiv = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "Spare Parts Search & Comparison Engine";
    const sub = document.createElement("p");
    sub.className = "sp-subtitle";
    sub.textContent = "PROJ-02-SPAREPARTS · Multi-Source Automotive Search, Deterministic Fitment & Landed Cost Intelligence";
    titleDiv.append(h2, sub);

    const badgeGroup = document.createElement("div");
    badgeGroup.className = "sp-badges";

    const b1 = document.createElement("span");
    b1.className = "badge badge-primary";
    b1.textContent = "Truth: UNKNOWN ≠ 0";

    const b2 = document.createElement("span");
    b2.className = "badge badge-success";
    b2.textContent = "Zero innerHTML Sanitized";

    const b3 = document.createElement("span");
    b3.className = "badge badge-neutral";
    b3.textContent = "Cross-Reference Graph";

    badgeGroup.append(b1, b2, b3);
    titleRow.append(titleDiv, badgeGroup);
    card.appendChild(titleRow);
    return card;
  }

  buildVehicleSelectorCard() {
    const card = document.createElement("div");
    card.className = "card full-width sp-vehicle-card";

    const header = document.createElement("div");
    header.className = "card-header";
    const h3 = document.createElement("h3");
    h3.textContent = "1. Target Vehicle Compatibility Context";
    const note = document.createElement("span");
    note.className = "text-muted font-sm";
    note.textContent = "Ensures fail-closed fitment checks. Without vehicle context, fitment is UNKNOWN.";
    header.append(h3, note);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";

    // Quick presets
    const presetRow = document.createElement("div");
    presetRow.className = "sp-presets-row";

    const presetLabel = document.createElement("span");
    presetLabel.className = "text-muted font-sm";
    presetLabel.textContent = "Quick Presets:";
    presetRow.appendChild(presetLabel);

    this.vehicleCatalog.forEach(veh => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-xs btn-outline";
      btn.textContent = `${veh.make} ${veh.model} ${veh.year} (${veh.generation})`;
      btn.addEventListener("click", () => {
        this.selectedVehicle = {
          make: veh.make,
          model: veh.model,
          year: String(veh.year),
          generation: veh.generation,
          engine: veh.engine,
          market: veh.market,
        };
        this.render();
      });
      presetRow.appendChild(btn);
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-xs btn-secondary";
    clearBtn.textContent = "Clear Vehicle";
    clearBtn.addEventListener("click", () => {
      this.selectedVehicle = { make: "", model: "", year: "", generation: "", engine: "", market: "" };
      this.render();
    });
    presetRow.appendChild(clearBtn);

    body.appendChild(presetRow);

    // Form inputs grid
    const formGrid = document.createElement("div");
    formGrid.className = "sp-form-grid";

    // Make
    const gMake = this.createFormField("Vehicle Make *", "input", {
      value: this.selectedVehicle.make,
      placeholder: "e.g. Toyota, Nissan, Hyundai",
      onInput: (val) => { this.selectedVehicle.make = val; },
    });

    // Model
    const gModel = this.createFormField("Model *", "input", {
      value: this.selectedVehicle.model,
      placeholder: "e.g. Corolla, Versa, Accent",
      onInput: (val) => { this.selectedVehicle.model = val; },
    });

    // Year
    const gYear = this.createFormField("Year *", "input", {
      value: this.selectedVehicle.year,
      type: "number",
      placeholder: "e.g. 2020",
      onInput: (val) => { this.selectedVehicle.year = val; },
    });

    // Generation
    const gGen = this.createFormField("Generation (Chassis)", "input", {
      value: this.selectedVehicle.generation,
      placeholder: "e.g. E210, E170",
      onInput: (val) => { this.selectedVehicle.generation = val; },
    });

    // Engine
    const gEngine = this.createFormField("Engine Code / Displacement", "input", {
      value: this.selectedVehicle.engine,
      placeholder: "e.g. 1.8L 2ZR-FAE",
      onInput: (val) => { this.selectedVehicle.engine = val; },
    });

    // Market
    const gMarket = this.createFormField("Market Region", "input", {
      value: this.selectedVehicle.market,
      placeholder: "e.g. CL, US, EU, GLOBAL",
      onInput: (val) => { this.selectedVehicle.market = val; },
    });

    formGrid.append(gMake, gModel, gYear, gGen, gEngine, gMarket);
    body.appendChild(formGrid);

    // Active vehicle badge status
    const statusRow = document.createElement("div");
    statusRow.className = "sp-active-vehicle-bar";
    const statusLabel = document.createElement("strong");
    statusLabel.textContent = "Active Vehicle Context: ";
    const statusVal = document.createElement("span");

    if (this.selectedVehicle.make && this.selectedVehicle.model && this.selectedVehicle.year) {
      statusVal.className = "badge badge-success";
      statusVal.textContent = `${this.selectedVehicle.make} ${this.selectedVehicle.model} ${this.selectedVehicle.year} ${this.selectedVehicle.generation ? `(${this.selectedVehicle.generation})` : ""} ${this.selectedVehicle.engine || ""}`.trim();
    } else {
      statusVal.className = "badge badge-warning";
      statusVal.textContent = "None selected (Fitment verdicts will report UNKNOWN)";
    }
    statusRow.append(statusLabel, statusVal);
    body.appendChild(statusRow);

    card.appendChild(body);
    return card;
  }

  buildSearchBarCard() {
    const card = document.createElement("div");
    card.className = "card full-width sp-search-card";

    const body = document.createElement("div");
    body.className = "card-body";

    const form = document.createElement("form");
    form.className = "sp-search-form";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.executeSearch();
    });

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "form-control sp-search-input";
    searchInput.placeholder = "Enter part number (e.g. 04465-02220), aftermarket code (BOSCH-0986494657), or keyword...";
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value;
    });

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn btn-primary sp-search-submit-btn";
    submitBtn.textContent = this.isLoading ? "Searching Sources..." : "Search & Compare";
    submitBtn.disabled = this.isLoading;

    form.append(searchInput, submitBtn);
    body.appendChild(form);

    // Suggested queries
    const suggestionsRow = document.createElement("div");
    suggestionsRow.className = "sp-suggestions-row";
    const sugLabel = document.createElement("span");
    sugLabel.className = "text-muted font-sm";
    sugLabel.textContent = "Try query:";
    suggestionsRow.appendChild(sugLabel);

    const suggestions = [
      "04465-02220",
      "BOSCH 0986494657",
      "Pastillas de freno delanteras",
      "Filtro de aceite 90915-YZZD2",
    ];

    suggestions.forEach(sug => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "btn btn-xs btn-outline";
      pill.textContent = sug;
      pill.addEventListener("click", () => {
        this.searchQuery = sug;
        searchInput.value = sug;
        this.executeSearch();
      });
      suggestionsRow.appendChild(pill);
    });

    body.appendChild(suggestionsRow);
    card.appendChild(body);
    return card;
  }

  buildSourceStatusPanel() {
    const card = document.createElement("div");
    card.className = "card full-width sp-source-status-card";

    const header = document.createElement("div");
    header.className = "card-header";
    const h4 = document.createElement("h4");
    h4.textContent = "Multi-Source Orchestrator Telemetry";
    const summary = document.createElement("span");
    summary.className = "text-muted font-sm";
    summary.textContent = `${this.searchResults.sourceReports.length} Sources Queried · Total Latency: ${this.searchResults.executionTimeMs}ms · Status: ${this.searchResults.status}`;
    header.append(h4, summary);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";

    const grid = document.createElement("div");
    grid.className = "sp-source-chips-grid";

    this.searchResults.sourceReports.forEach(rep => {
      const chip = document.createElement("div");
      chip.className = `sp-source-chip sp-source-status-${rep.status.toLowerCase()}`;

      const name = document.createElement("strong");
      name.textContent = rep.sourceName || rep.sourceId;

      const badge = document.createElement("span");
      badge.className = `badge badge-${rep.status === "SUCCESS" ? "success" : (rep.status === "NO_RESULTS" ? "neutral" : "warning")}`;
      badge.textContent = rep.status;

      const meta = document.createElement("div");
      meta.className = "sp-source-meta";
      meta.textContent = `${rep.offersFound} offers · ${rep.latencyMs}ms`;

      chip.append(name, badge, meta);
      grid.appendChild(chip);
    });

    body.appendChild(grid);
    card.appendChild(body);
    return card;
  }

  buildFilterSidebar() {
    const aside = document.createElement("aside");
    aside.className = "card sp-filter-sidebar";

    const header = document.createElement("div");
    header.className = "card-header";
    const h4 = document.createElement("h4");
    h4.textContent = "Reactive Filters";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-xs btn-outline";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
      this.filters = { minPrice: null, maxPrice: null, fitmentVerdict: "ALL", onlyInStock: false, minSellerTrust: 0 };
      this.render();
    });
    header.append(h4, resetBtn);
    aside.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body sp-filters-body";

    // Fitment filter
    const fFitment = document.createElement("div");
    fFitment.className = "form-group";
    const lFitment = document.createElement("label");
    lFitment.textContent = "Vehicle Fitment";
    const sFitment = document.createElement("select");
    sFitment.className = "form-control";
    [
      { val: "ALL", label: "All Verdicts" },
      { val: "FIT", label: "FIT (Verified Compatible)" },
      { val: "UNKNOWN", label: "UNKNOWN (Undetermined)" },
      { val: "CONFLICT", label: "CONFLICT (Contradictory)" },
      { val: "NOT_FIT", label: "NOT_FIT (Incompatible)" },
    ].forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.val;
      o.textContent = opt.label;
      if (this.filters.fitmentVerdict === opt.val) o.selected = true;
      sFitment.appendChild(o);
    });
    sFitment.addEventListener("change", (e) => {
      this.filters.fitmentVerdict = e.target.value;
      this.render();
    });
    fFitment.append(lFitment, sFitment);
    body.appendChild(fFitment);

    // In Stock toggle
    const fStock = document.createElement("div");
    fStock.className = "form-group form-check";
    const cbStock = document.createElement("input");
    cbStock.type = "checkbox";
    cbStock.id = "sp-filter-stock";
    cbStock.checked = this.filters.onlyInStock;
    cbStock.addEventListener("change", (e) => {
      this.filters.onlyInStock = e.target.checked;
      this.render();
    });
    const lStock = document.createElement("label");
    lStock.htmlFor = "sp-filter-stock";
    lStock.textContent = "In Stock Only";
    fStock.append(cbStock, lStock);
    body.appendChild(fStock);

    // Seller Trust slider
    const fTrust = document.createElement("div");
    fTrust.className = "form-group";
    const lTrust = document.createElement("label");
    lTrust.textContent = `Min Seller Trust: ${(this.filters.minSellerTrust * 100).toFixed(0)}%`;
    const rTrust = document.createElement("input");
    rTrust.type = "range";
    rTrust.min = "0";
    rTrust.max = "1";
    rTrust.step = "0.05";
    rTrust.value = String(this.filters.minSellerTrust);
    rTrust.className = "form-control-range";
    rTrust.addEventListener("input", (e) => {
      this.filters.minSellerTrust = parseFloat(e.target.value);
      lTrust.textContent = `Min Seller Trust: ${(this.filters.minSellerTrust * 100).toFixed(0)}%`;
      this.render();
    });
    fTrust.append(lTrust, rTrust);
    body.appendChild(fTrust);

    // Max Price
    const fMaxPrice = document.createElement("div");
    fMaxPrice.className = "form-group";
    const lMaxPrice = document.createElement("label");
    lMaxPrice.textContent = "Max Price (Total / Base)";
    const iMaxPrice = document.createElement("input");
    iMaxPrice.type = "number";
    iMaxPrice.className = "form-control";
    iMaxPrice.placeholder = "No limit";
    if (this.filters.maxPrice !== null) iMaxPrice.value = String(this.filters.maxPrice);
    iMaxPrice.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      this.filters.maxPrice = val ? Number(val) : null;
      this.render();
    });
    fMaxPrice.append(lMaxPrice, iMaxPrice);
    body.appendChild(fMaxPrice);

    aside.appendChild(body);
    return aside;
  }

  buildResultsPanel() {
    const panel = document.createElement("div");
    panel.className = "sp-results-panel";

    if (!this.searchResults || !this.searchResults.clusters || this.searchResults.clusters.length === 0) {
      return panel;
    }

    // Cluster selector tabs if multiple clusters found
    if (this.searchResults.clusters.length > 1) {
      const clusterTabs = document.createElement("div");
      clusterTabs.className = "sp-cluster-tabs";
      this.searchResults.clusters.forEach(c => {
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = `btn btn-sm ${this.activeCluster?.clusterId === c.clusterId ? "btn-primary" : "btn-secondary"}`;
        tabBtn.textContent = `${c.canonicalBrand} ${c.canonicalPartNumber} (${c.offerCount} offers)`;
        tabBtn.addEventListener("click", () => {
          this.activeCluster = c;
          this.render();
        });
        clusterTabs.appendChild(tabBtn);
      });
      panel.appendChild(clusterTabs);
    }

    const currentCluster = this.activeCluster || this.searchResults.clusters[0];
    if (!currentCluster) return panel;

    // Cluster Info Bar
    const clusterCard = document.createElement("div");
    clusterCard.className = "card sp-cluster-banner";
    const cBody = document.createElement("div");
    cBody.className = "card-body sp-cluster-summary";

    const cMain = document.createElement("div");
    const cTitle = document.createElement("h3");
    cTitle.textContent = `${currentCluster.canonicalBrand} — Part #${currentCluster.canonicalPartNumber}`;
    const cDesc = document.createElement("p");
    cDesc.className = "text-muted";
    cDesc.textContent = currentCluster.description;
    cMain.append(cTitle, cDesc);

    const cVerdict = document.createElement("div");
    cVerdict.className = "sp-cluster-verdict";
    const vBadge = document.createElement("span");
    const verdict = currentCluster.fitmentResult?.verdict || "UNKNOWN";
    vBadge.className = `badge badge-${verdict === "FIT" ? "success" : (verdict === "NOT_FIT" ? "danger" : "warning")} badge-lg`;
    vBadge.textContent = `Fitment: ${verdict}`;
    const vExp = document.createElement("div");
    vExp.className = "text-dim font-xs";
    vExp.textContent = currentCluster.fitmentResult?.explanation || "No vehicle selected or fitment rule available.";
    cVerdict.append(vBadge, vExp);

    cBody.append(cMain, cVerdict);
    clusterCard.appendChild(cBody);
    panel.appendChild(clusterCard);

    // Apply reactive filters to comparison items
    const comparison = currentCluster.comparison;
    const filteredItems = this.applyFilters(comparison.items);

    // Results Header Count
    const countRow = document.createElement("div");
    countRow.className = "sp-results-count-row";
    const countText = document.createElement("span");
    countText.textContent = `Showing ${filteredItems.length} of ${comparison.items.length} offers for this part`;
    const clearSelectedBtn = document.createElement("button");
    clearSelectedBtn.type = "button";
    clearSelectedBtn.className = "btn btn-xs btn-secondary";
    clearSelectedBtn.textContent = `Clear Selection (${this.selectedOfferIds.size}/4)`;
    clearSelectedBtn.disabled = this.selectedOfferIds.size === 0;
    clearSelectedBtn.addEventListener("click", () => {
      this.selectedOfferIds.clear();
      this.render();
    });
    countRow.append(countText, clearSelectedBtn);
    panel.appendChild(countRow);

    if (filteredItems.length === 0) {
      const emptyFilters = document.createElement("div");
      emptyFilters.className = "card sp-empty-card";
      emptyFilters.textContent = "No offers match the current filter criteria. Try adjusting or resetting filters.";
      panel.appendChild(emptyFilters);
      return panel;
    }

    // Offer Cards List
    const cardsGrid = document.createElement("div");
    cardsGrid.className = "sp-offer-cards-grid";

    filteredItems.forEach(item => {
      cardsGrid.appendChild(this.buildOfferCard(item, comparison));
    });

    panel.appendChild(cardsGrid);
    return panel;
  }

  buildOfferCard(item, comparison) {
    const card = document.createElement("div");
    const isSelected = this.selectedOfferIds.has(item.offerId);
    card.className = `card sp-offer-card ${isSelected ? "sp-offer-card-selected" : ""}`;

    const body = document.createElement("div");
    body.className = "card-body sp-offer-body";

    // Top Row: Seller & Source, Best Pick Badges
    const topRow = document.createElement("div");
    topRow.className = "sp-card-top-row";

    const sellerInfo = document.createElement("div");
    const sellerName = document.createElement("strong");
    sellerName.className = "sp-seller-name";
    sellerName.textContent = item.sellerName;
    const sourceBadge = document.createElement("span");
    sourceBadge.className = "badge badge-neutral";
    sourceBadge.textContent = item.sourceId;
    sellerInfo.append(sellerName, sourceBadge);

    // Pick badges
    const picks = document.createElement("div");
    picks.className = "sp-picks-group";
    if (comparison.bestPriceOfferId === item.offerId) {
      const p = document.createElement("span");
      p.className = "badge badge-success";
      p.textContent = "★ Best Landed Price";
      picks.appendChild(p);
    }
    if (comparison.bestTrustOfferId === item.offerId) {
      const t = document.createElement("span");
      t.className = "badge badge-primary";
      t.textContent = "★ Highest Trust";
      picks.appendChild(t);
    }
    if (comparison.bestOverallOfferId === item.offerId) {
      const o = document.createElement("span");
      o.className = "badge badge-warning";
      o.textContent = "★ Best Value Pick";
      picks.appendChild(o);
    }

    topRow.append(sellerInfo, picks);
    body.appendChild(topRow);

    // Middle Row: Price & Landed Cost Breakdown
    const priceRow = document.createElement("div");
    priceRow.className = "sp-price-row";

    const basePriceCol = document.createElement("div");
    basePriceCol.className = "sp-price-col";
    const baseLabel = document.createElement("span");
    baseLabel.className = "sp-price-label";
    baseLabel.textContent = "Catalog Base Price:";
    const baseVal = document.createElement("span");
    baseVal.className = "sp-base-price-val";
    baseVal.textContent = this.formatCurrency(item.basePrice.amount, item.basePrice.currency);
    basePriceCol.append(baseLabel, baseVal);

    const landedPriceCol = document.createElement("div");
    landedPriceCol.className = "sp-price-col";
    const landedLabel = document.createElement("span");
    landedLabel.className = "sp-price-label";
    landedLabel.textContent = "Est. Total Landed Cost:";
    const landedVal = document.createElement("span");
    landedVal.className = "sp-landed-price-val";

    if (item.totalCost.completeness === "TOTAL_KNOWN" && item.totalCost.totalAmount !== undefined) {
      landedVal.textContent = this.formatCurrency(item.totalCost.totalAmount, item.totalCost.currency);
      landedVal.classList.add("text-success");
    } else {
      landedVal.textContent = "UNKNOWN (Costs Missing)";
      landedVal.classList.add("text-warning");
    }
    landedPriceCol.append(landedLabel, landedVal);

    priceRow.append(basePriceCol, landedPriceCol);
    body.appendChild(priceRow);

    // Landed Breakdown string
    const breakdownDiv = document.createElement("div");
    breakdownDiv.className = "sp-breakdown-text";
    breakdownDiv.textContent = item.totalCost.calculationBreakdown || "No breakdown calculated";
    body.appendChild(breakdownDiv);

    // Trust & Fitment indicators
    const metaRow = document.createElement("div");
    metaRow.className = "sp-card-meta-row";

    // Trust Score Badge
    const trustDiv = document.createElement("div");
    trustDiv.className = "sp-trust-pill";
    const trustLabel = document.createElement("span");
    trustLabel.textContent = `Seller Trust: ${(item.sellerTrust.score * 100).toFixed(0)}% (${item.sellerTrust.tier})`;
    trustDiv.appendChild(trustLabel);

    // Fitment Verdict Badge
    const fitVerdict = item.fitmentVerdict || "UNKNOWN";
    const fitBadge = document.createElement("span");
    fitBadge.className = `badge badge-${fitVerdict === "FIT" ? "success" : (fitVerdict === "NOT_FIT" ? "danger" : "warning")}`;
    fitBadge.textContent = `Fitment: ${fitVerdict}`;

    metaRow.append(trustDiv, fitBadge);
    body.appendChild(metaRow);

    // Incomparability warning if any
    if (!item.isComparable && item.incomparabilityReasons && item.incomparabilityReasons.length > 0) {
      const warnBox = document.createElement("div");
      warnBox.className = "sp-warning-box";
      warnBox.textContent = `Incomparable: ${item.incomparabilityReasons.join(" · ")}`;
      body.appendChild(warnBox);
    }

    // Bottom Action Row: Checkbox / Button to Compare
    const actionRow = document.createElement("div");
    actionRow.className = "sp-card-action-row";

    const compBtn = document.createElement("button");
    compBtn.type = "button";
    compBtn.className = `btn btn-sm ${isSelected ? "btn-danger" : "btn-secondary"}`;
    compBtn.textContent = isSelected ? "Remove from Comparison" : "Select to Compare";

    // Prevent selecting incompatible items for side-by-side or limit > 4
    if (!isSelected && item.fitmentVerdict === "NOT_FIT") {
      compBtn.disabled = true;
      compBtn.title = "Incompatible offers cannot be compared with matching parts.";
    } else if (!isSelected && this.selectedOfferIds.size >= 4) {
      compBtn.disabled = true;
      compBtn.title = "Maximum 4 offers can be compared simultaneously.";
    }

    compBtn.addEventListener("click", () => {
      if (this.selectedOfferIds.has(item.offerId)) {
        this.selectedOfferIds.delete(item.offerId);
      } else {
        this.selectedOfferIds.add(item.offerId);
      }
      this.render();
      if (this.onCompareChange) {
        this.onCompareChange(Array.from(this.selectedOfferIds));
      }
    });

    actionRow.appendChild(compBtn);
    body.appendChild(actionRow);

    card.appendChild(body);
    return card;
  }

  buildSideBySideComparisonSection() {
    const card = document.createElement("div");
    card.className = "card full-width sp-comparison-card";

    const header = document.createElement("div");
    header.className = "card-header";
    const h3 = document.createElement("h3");
    h3.textContent = `Side-by-Side Offer Comparison (${this.selectedOfferIds.size} offers selected)`;
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-xs btn-outline";
    clearBtn.textContent = "Close Comparison";
    clearBtn.addEventListener("click", () => {
      this.selectedOfferIds.clear();
      this.render();
    });
    header.append(h3, clearBtn);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";

    const currentCluster = this.activeCluster || this.searchResults.clusters[0];
    const comparison = currentCluster.comparison;
    const selectedItems = comparison.items.filter(i => this.selectedOfferIds.has(i.offerId));

    if (selectedItems.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No offers selected.";
      body.appendChild(empty);
      card.appendChild(body);
      return card;
    }

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-responsive";

    const table = document.createElement("table");
    table.className = "data-table sp-comparison-table";

    // Table Header
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");

    const thAttr = document.createElement("th");
    thAttr.textContent = "Attribute / Criterion";
    thAttr.style.width = "220px";
    trHead.appendChild(thAttr);

    selectedItems.forEach(item => {
      const th = document.createElement("th");
      const title = document.createElement("div");
      title.className = "sp-comp-th-title";
      title.textContent = item.sellerName;
      const sub = document.createElement("div");
      sub.className = "text-muted font-xs";
      sub.textContent = `Source: ${item.sourceId}`;
      th.append(title, sub);

      // Best pick badge
      if (comparison.bestOverallOfferId === item.offerId) {
        const b = document.createElement("span");
        b.className = "badge badge-warning";
        b.textContent = "★ Best Pick";
        th.appendChild(b);
      }
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Table Body
    const tbody = document.createElement("tbody");

    // Row: Base Price
    tbody.appendChild(this.buildComparisonRow("Base Price", selectedItems, (item) => {
      return this.formatCurrency(item.basePrice.amount, item.basePrice.currency);
    }));

    // Row: Shipping Cost
    tbody.appendChild(this.buildComparisonRow("Shipping Cost", selectedItems, (item) => {
      if (item.totalCost.shipping.status === "FREE") return "FREE (Disclosed)";
      if (item.totalCost.shipping.status === "KNOWN_AMOUNT") {
        return this.formatCurrency(item.totalCost.shipping.amount || 0, item.totalCost.currency);
      }
      return "UNKNOWN (Not Disclosed)";
    }));

    // Row: Taxes & Duties
    tbody.appendChild(this.buildComparisonRow("Taxes & Customs", selectedItems, (item) => {
      const taxStatus = item.totalCost.taxes.status;
      const impStatus = item.totalCost.importCosts.status;
      if (taxStatus === "KNOWN_AMOUNT" && impStatus === "NOT_APPLICABLE") {
        return `Tax: ${this.formatCurrency(item.totalCost.taxes.amount || 0, item.totalCost.currency)} | Domestic`;
      }
      if (taxStatus === "INCLUDED" && impStatus === "NOT_APPLICABLE") {
        return "Taxes Included in Price | Domestic";
      }
      if (impStatus === "KNOWN_AMOUNT") {
        return `Import Fees: ${this.formatCurrency(item.totalCost.importCosts.totalImportFees || 0, item.totalCost.currency)}`;
      }
      return "UNKNOWN / Pending Calculation";
    }));

    // Row: Total Landed Cost
    tbody.appendChild(this.buildComparisonRow("Total Landed Cost", selectedItems, (item) => {
      if (item.totalCost.completeness === "TOTAL_KNOWN" && item.totalCost.totalAmount !== undefined) {
        return `${this.formatCurrency(item.totalCost.totalAmount, item.totalCost.currency)} [KNOWN]`;
      }
      return "UNKNOWN (Missing Shipping/Tax)";
    }, true));

    // Row: Seller Trust Score
    tbody.appendChild(this.buildComparisonRow("Seller Trust Score", selectedItems, (item) => {
      return `${(item.sellerTrust.score * 100).toFixed(0)}% (${item.sellerTrust.tier})`;
    }));

    // Row: Fitment Verdict
    tbody.appendChild(this.buildComparisonRow("Fitment Verdict", selectedItems, (item) => {
      return item.fitmentVerdict || "UNKNOWN";
    }));

    // Row: Comparability
    tbody.appendChild(this.buildComparisonRow("Comparability Status", selectedItems, (item) => {
      if (item.isComparable) return "Fully Comparable";
      return `Incomparable: ${item.incomparabilityReasons?.join("; ") || "Data Incomplete"}`;
    }));

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    body.appendChild(tableWrapper);
    card.appendChild(body);
    return card;
  }

  buildComparisonRow(label, items, valueFormatter, highlight = false) {
    const tr = document.createElement("tr");
    if (highlight) tr.className = "sp-row-highlight";

    const tdLabel = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = label;
    tdLabel.appendChild(strong);
    tr.appendChild(tdLabel);

    items.forEach(item => {
      const td = document.createElement("td");
      td.textContent = valueFormatter(item);
      tr.appendChild(td);
    });

    return tr;
  }

  // -------------------------------------------------------------
  // State Placeholders
  // -------------------------------------------------------------

  buildInitialState() {
    const card = document.createElement("div");
    card.className = "card full-width sp-initial-card";
    const body = document.createElement("div");
    body.className = "card-body text-center";

    const h3 = document.createElement("h3");
    h3.textContent = "Ready to search replacement parts";
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = "Select a target vehicle or enter an OEM / aftermarket part number above to query multiple automotive sources simultaneously.";

    body.append(h3, p);
    card.appendChild(body);
    return card;
  }

  buildLoadingState() {
    const card = document.createElement("div");
    card.className = "card full-width sp-loading-card";
    const body = document.createElement("div");
    body.className = "card-body text-center";

    const spinner = document.createElement("div");
    spinner.className = "pulse-dot";
    spinner.style.width = "24px";
    spinner.style.height = "24px";
    spinner.style.margin = "0 auto 1rem auto";

    const h3 = document.createElement("h3");
    h3.textContent = "Executing Multi-Source Parallel Search...";
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = "Orchestrating agents, normalizing codes, evaluating fitment and computing landed costs.";

    body.append(spinner, h3, p);
    card.appendChild(body);
    return card;
  }

  buildErrorState() {
    const card = document.createElement("div");
    card.className = "card full-width sp-error-card";
    const body = document.createElement("div");
    body.className = "card-body";

    const h3 = document.createElement("h3");
    h3.className = "text-danger";
    h3.textContent = "Search Execution Failed";
    const p = document.createElement("p");
    p.textContent = this.errorMessage || "An unexpected error occurred during search.";

    body.append(h3, p);
    card.appendChild(body);
    return card;
  }

  buildNoResultsState() {
    const card = document.createElement("div");
    card.className = "card full-width sp-noresults-card";
    const body = document.createElement("div");
    body.className = "card-body text-center";

    const h3 = document.createElement("h3");
    h3.textContent = "No Parts Found";
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = `No listings were found matching query "${this.searchResults.queryText}". Try broadening your search or using an alternative OEM cross-reference number.`;

    body.append(h3, p);
    card.appendChild(body);
    return card;
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  createFormField(label, type, opts = {}) {
    const group = document.createElement("div");
    group.className = "form-group";

    const l = document.createElement("label");
    l.textContent = label;
    group.appendChild(l);

    const input = document.createElement(type);
    input.className = "form-control";
    if (opts.type) input.type = opts.type;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.value) input.value = opts.value;
    if (opts.onInput) {
      input.addEventListener("input", (e) => opts.onInput(e.target.value));
    }
    group.appendChild(input);

    return group;
  }

  applyFilters(items) {
    return items.filter(item => {
      // 1. Fitment verdict filter
      if (this.filters.fitmentVerdict && this.filters.fitmentVerdict !== "ALL") {
        if (item.fitmentVerdict !== this.filters.fitmentVerdict) return false;
      }

      // 2. Only in-stock
      if (this.filters.onlyInStock) {
        if (item.incomparabilityReasons?.some(r => r.toLowerCase().includes("stock"))) return false;
      }

      // 3. Minimum seller trust
      if (this.filters.minSellerTrust > 0) {
        if (item.sellerTrust.score < this.filters.minSellerTrust) return false;
      }

      // 4. Max price
      const effectivePrice = item.totalCost.totalAmount !== undefined
        ? item.totalCost.totalAmount
        : item.basePrice.amount;

      if (this.filters.maxPrice !== null && effectivePrice > this.filters.maxPrice) {
        return false;
      }

      return true;
    });
  }

  formatCurrency(amount, currency = "CLP") {
    if (amount === undefined || amount === null) return "UNKNOWN";
    if (currency === "CLP") {
      return `$${Math.round(amount).toLocaleString("es-CL")} CLP`;
    }
    if (currency === "USD") {
      return `$${amount.toFixed(2)} USD`;
    }
    return `${amount} ${currency}`;
  }

  async executeSearch() {
    if (!this.searchQuery.trim()) return;

    this.setLoading(true);

    if (this.apiClient && typeof this.apiClient.searchSpareParts === "function") {
      try {
        const res = await this.apiClient.searchSpareParts({
          query: this.searchQuery,
          vehicle: this.selectedVehicle.make && this.selectedVehicle.model && this.selectedVehicle.year
            ? {
                make: this.selectedVehicle.make,
                model: this.selectedVehicle.model,
                year: Number(this.selectedVehicle.year),
                generation: this.selectedVehicle.generation || undefined,
                engine: this.selectedVehicle.engine || undefined,
                market: this.selectedVehicle.market || undefined,
              }
            : undefined,
          options: {
            comparisonCurrency: "CLP",
            targetDestinationCountry: "CL",
          },
        });
        this.setResults(res);
      } catch (err) {
        this.setError(err?.message || "Search request failed");
      }
    } else {
      // In standalone mode or before backend wiring, inform user or load default mock
      this.setError("API Client not connected to search endpoint. Please ensure platform server is running.");
    }
  }
}
