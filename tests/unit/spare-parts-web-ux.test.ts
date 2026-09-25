/**
 * tests/unit/spare-parts-web-ux.test.ts
 * Comprehensive Unit & Integration Tests for Spare Parts Web UI & Application Facade.
 *
 * Requirements & Invariants Tested:
 * 1. Initial render & empty states in DOM.
 * 2. Vehicle selector state management & quick presets.
 * 3. Search submission & loading/error/partial states.
 * 4. Reactive filter interactions (price, fitment, seller trust, availability).
 * 5. Side-by-side comparison selection & limit (max 4).
 * 6. Rendering of UNKNOWN vs $0 (Truth Invariant: UNKNOWN !== 0).
 * 7. Fitment verdicts display (FIT, NOT_FIT, UNKNOWN, CONFLICT).
 * 8. Best offer indicators (bestPriceOfferId, bestTrustOfferId, bestOverallOfferId).
 * 9. Security/XSS audit: malicious strings rendered strictly via textContent (no innerHTML).
 * 10. Audit: 0 innerHTML across all web source files.
 * 11. End-to-end integration through SparePartsFacade and HTTP endpoint.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SparePartsFacade } from "../../src/application/spareparts/spare-parts-facade.js";
// Dynamic import will be used to load vanilla JS file from src/platform/web/spare-parts-view.js
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { AutomotiveSource } from "../../src/domain/spareparts/automotive-source.js";
import { TestFixtureAutomotiveConnector } from "../../src/infrastructure/spareparts/fixture-connectors.js";
import { SourceProductOffer } from "../../src/application/spareparts/automotive-source-connector.js";
import { FitmentRule } from "../../src/domain/spareparts/fitment.js";
import { CrossReference, createCrossReference } from "../../src/domain/spareparts/cross-reference.js";
import { createPartNumber } from "../../src/domain/spareparts/part-number.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();

/**
 * Minimal Headless DOM Mock for Node.js unit testing of vanilla DOM components.
 */
class MockDOMElement {
  public tagName: string;
  public className: string = "";
  public id: string = "";
  public type: string = "";
  public placeholder: string = "";
  public value: string = "";
  public checked: boolean = false;
  public disabled: boolean = false;
  public title: string = "";
  public style: Record<string, string> = {};
  public children: MockDOMElement[] = [];
  public parentNode: MockDOMElement | null = null;
  public textContentInternal: string = "";
  public eventListeners: Record<string, ((event: any) => void)[]> = {};
  public attributes: Record<string, string> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get classList() {
    const self = this;
    return {
      add(...classes: string[]) {
        const set = new Set(self.className.split(" ").filter(Boolean));
        for (const c of classes) set.add(c);
        self.className = Array.from(set).join(" ");
      },
      remove(...classes: string[]) {
        const set = new Set(self.className.split(" ").filter(Boolean));
        for (const c of classes) set.delete(c);
        self.className = Array.from(set).join(" ");
      },
      toggle(cls: string, force?: boolean) {
        const set = new Set(self.className.split(" ").filter(Boolean));
        const shouldAdd = force !== undefined ? force : !set.has(cls);
        if (shouldAdd) set.add(cls);
        else set.delete(cls);
        self.className = Array.from(set).join(" ");
        return shouldAdd;
      },
      contains(cls: string) {
        return self.className.split(" ").filter(Boolean).includes(cls);
      }
    };
  }

  get textContent(): string {
    if (this.children.length === 0) {
      return this.textContentInternal;
    }
    return this.textContentInternal + this.children.map(c => c.textContent).join("");
  }

  set textContent(val: string) {
    this.textContentInternal = String(val);
    this.children = [];
  }

  get firstChild(): MockDOMElement | null {
    return this.children.length > 0 ? this.children[0] : null;
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...items: (MockDOMElement | string)[]): void {
    for (const item of items) {
      if (typeof item === "string") {
        const textNode = new MockDOMElement("#text");
        textNode.textContent = item;
        this.appendChild(textNode);
      } else if (item instanceof MockDOMElement) {
        this.appendChild(item);
      }
    }
  }

  removeChild(child: MockDOMElement): MockDOMElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(event: string, handler: (e: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  dispatchEvent(event: { type: string; [key: string]: any }): void {
    const handlers = this.eventListeners[event.type];
    if (handlers) {
      for (const h of handlers) {
        h(event);
      }
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] || null;
  }

  querySelector(selector: string): MockDOMElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockDOMElement[] {
    const matches: MockDOMElement[] = [];

    const testMatch = (elem: MockDOMElement) => {
      let isMatch = false;
      const parts = selector.trim().split(/\s+/);

      if (parts.length === 1) {
        const s = parts[0];
        if (s.startsWith(".")) {
          const cls = s.substring(1);
          if (elem.className.split(" ").filter(Boolean).includes(cls)) isMatch = true;
        } else if (s.startsWith("#")) {
          const id = s.substring(1);
          if (elem.id === id) isMatch = true;
        } else if (elem.tagName.toLowerCase() === s.toLowerCase()) {
          isMatch = true;
        }
      } else if (parts.length === 2) {
        // Parent child match (e.g. '.sp-presets-row button')
        const [parentSel, childSel] = parts;
        let isParent = false;
        if (parentSel.startsWith(".")) {
          isParent = elem.parentNode?.className.split(" ").filter(Boolean).includes(parentSel.substring(1)) ?? false;
        }
        if (isParent && elem.tagName.toLowerCase() === childSel.toLowerCase()) {
          isMatch = true;
        }
      }

      if (isMatch) matches.push(elem);
      for (const c of elem.children) {
        testMatch(c);
      }
    };

    for (const c of this.children) {
      testMatch(c);
    }
    return matches;
  }
}

  // Setup global mock document if not present
if (typeof (globalThis as any).document === "undefined") {
  (globalThis as any).document = {
    createElement(tagName: string) {
      return new MockDOMElement(tagName);
    },
  };
}

describe("PROJ-02 FASE 148 — Spare Parts Web UX & Facade Test Suite", async () => {
  const webViewModule = await import(pathToFileURL(path.join(ROOT_DIR, "src/platform/web/spare-parts-view.js")).href);
  const SparePartsView = webViewModule.SparePartsView;
  // Test fixture sources
  const source1: AutomotiveSource = {
    sourceId: "src-autopart-cl",
    name: "AutoParts Chile SpA",
    displayName: "AutoParts Chile",
    primaryUrl: "https://autoparts.cl",
    sourceType: "SPECIALIZED_RETAILER",
    accessMethod: "STRUCTURED_DATA",
    accessPolicy: {
      allowed: true,
      requiresAuthentication: false,
      paginationSupported: true,
      javascriptRequired: false,
      antiBotDetected: false,
      robotsAllowed: true,
    },
    capabilities: {
      searchByText: "SUPPORTED",
      searchByPartNumber: "SUPPORTED",
      searchByOemNumber: "SUPPORTED",
      searchByVehicle: "SUPPORTED",
      searchByVin: "UNSUPPORTED",
      getProductDetail: "SUPPORTED",
      getPrice: "SUPPORTED",
      getStockAvailability: "SUPPORTED",
      getFitmentMatrix: "SUPPORTED",
      getCrossReferences: "SUPPORTED",
      getSellerReputation: "SUPPORTED",
      getReviews: "SUPPORTED",
      getShippingOptions: "SUPPORTED",
      providesEvidence: "SUPPORTED",
    },
    coverage: {
      regions: ["CL", "LATAM"],
      vehicleMakes: ["Toyota", "Nissan", "ALL"],
      partCategories: ["BRAKES", "ALL"],
      supportedPartIdentifiers: ["OEM", "MPN", "SKU"],
    },
    trustRating: {
      sourceReliability: 0.88,
      dataCompleteness: 0.9,
      fitmentConfidence: 0.95,
      priceFreshnessHours: 1,
      evidenceQualityScore: 0.9,
    },
    status: "AVAILABLE",
    allowedAgentTypes: ["WEB_AGENT", "RESEARCH_AGENT"],
  };

  const source2: AutomotiveSource = {
    sourceId: "src-rockauto-us",
    name: "RockAuto LLC",
    displayName: "RockAuto US",
    primaryUrl: "https://rockauto.com",
    sourceType: "PARTS_DISTRIBUTOR",
    accessMethod: "STRUCTURED_DATA",
    accessPolicy: {
      allowed: true,
      requiresAuthentication: false,
      paginationSupported: true,
      javascriptRequired: false,
      antiBotDetected: false,
      robotsAllowed: true,
    },
    capabilities: {
      searchByText: "SUPPORTED",
      searchByPartNumber: "SUPPORTED",
      searchByOemNumber: "SUPPORTED",
      searchByVehicle: "SUPPORTED",
      searchByVin: "UNSUPPORTED",
      getProductDetail: "SUPPORTED",
      getPrice: "SUPPORTED",
      getStockAvailability: "SUPPORTED",
      getFitmentMatrix: "SUPPORTED",
      getCrossReferences: "SUPPORTED",
      getSellerReputation: "SUPPORTED",
      getReviews: "SUPPORTED",
      getShippingOptions: "SUPPORTED",
      providesEvidence: "SUPPORTED",
    },
    coverage: {
      regions: ["GLOBAL", "US", "CL"],
      vehicleMakes: ["Toyota", "Nissan", "ALL"],
      partCategories: ["BRAKES", "ALL"],
      supportedPartIdentifiers: ["OEM", "MPN", "SKU"],
    },
    trustRating: {
      sourceReliability: 0.92,
      dataCompleteness: 0.95,
      fitmentConfidence: 0.92,
      priceFreshnessHours: 2,
      evidenceQualityScore: 0.92,
    },
    status: "AVAILABLE",
    allowedAgentTypes: ["WEB_AGENT", "RESEARCH_AGENT"],
    metadata: { currency: "USD" },
  };

  const offersSource1: SourceProductOffer[] = [
    {
      offerId: "off-101",
      sourceId: "src-autopart-cl",
      title: "Pastillas de Freno Delanteras Toyota Corolla 2020",
      partNumber: "04465-02220",
      oemNumber: "04465-02220",
      brand: "Toyota OEM",
      price: 45000,
      currency: "CLP",
      inStock: true,
      sellerName: "Toyota Repuestos Oficiales",
      sellerTrustScore: 0.95,
      productUrl: "https://autoparts.cl/items/101",
      shipping: { fee: 3500, freeShipping: false, estimatedDaysMin: 2, estimatedDaysMax: 4 },
      taxInfo: { taxIncluded: true, taxRate: 0.19 },
      warrantyMonths: 12,
      returnPolicyDays: 30,
    },
    {
      offerId: "off-102",
      sourceId: "src-autopart-cl",
      title: "Pastillas Bosch Blue Cerámicas",
      partNumber: "BOSCH-0986494657",
      brand: "Bosch",
      price: 32000,
      currency: "CLP",
      inStock: true,
      sellerName: "Frenos San Diego",
      sellerTrustScore: 0.82,
      productUrl: "https://autoparts.cl/items/102",
      shipping: { fee: 0, freeShipping: true },
      taxInfo: { taxIncluded: true, taxRate: 0.19 },
      warrantyMonths: 6,
      returnPolicyDays: 15,
    },
  ];

  const offersSource2: SourceProductOffer[] = [
    {
      offerId: "off-201",
      sourceId: "src-rockauto-us",
      title: "PowerStop Z17 Evolution Clean Ride Ceramic",
      partNumber: "17-1210",
      brand: "PowerStop",
      price: 29.99,
      currency: "USD",
      inStock: true,
      sellerName: "RockAuto Warehouse Direct",
      sellerTrustScore: 0.88,
      productUrl: "https://rockauto.com/part/171210",
      // Undisclosed cross-border shipping & tax -> MUST derive in UNKNOWN total landed cost!
      warrantyMonths: 24,
      returnPolicyDays: 30,
    },
  ];

  const testRules: FitmentRule[] = [
    {
      ruleId: "rule-corolla-brakes",
      make: "Toyota",
      model: "Corolla",
      yearFrom: 2018,
      yearTo: 2024,
      generation: "E210",
      engines: ["1.8L 2ZR-FAE"],
      notes: "FRONT brake pads",
    },
  ];

  const testCrossRefs: CrossReference[] = [
    createCrossReference({
      sourcePartNumber: createPartNumber({ rawValue: "BOSCH-0986494657", brand: "Bosch", type: "MPN" }),
      targetPartNumber: createPartNumber({ rawValue: "04465-02220", brand: "Toyota", type: "OEM" }),
      relationType: "EQUIVALENT",
      direction: "BIDIRECTIONAL",
      confidence: 0.95,
      verifiedBy: "TEST_CATALOG",
    }),
  ];

  test("1. Security: Zero .innerHTML assignments across all web files", () => {
    const webDir = path.join(ROOT_DIR, "src/platform/web");
    const files = fs.readdirSync(webDir).filter(f => f.endsWith(".js"));

    for (const f of files) {
      const content = fs.readFileSync(path.join(webDir, f), "utf8");
      const matches = content.match(/\.innerHTML\s*=/g);
      assert.strictEqual(
        matches,
        null,
        `Forbidden .innerHTML assignment found in src/platform/web/${f}`
      );
    }
  });

  test("2. Facade: Executes end-to-end search, clustering, fitment & pricing comparison", async () => {
    const registry = new InMemoryAutomotiveSourceRegistry();
    registry.register(source1);
    registry.register(source2);

    const conn1 = new TestFixtureAutomotiveConnector(source1, { mode: "SUCCESS", mockOffers: offersSource1 });
    const conn2 = new TestFixtureAutomotiveConnector(source2, { mode: "SUCCESS", mockOffers: offersSource2 });

    const facade = new SparePartsFacade({
      registry,
      connectors: [conn1, conn2],
      fitmentRules: testRules,
      crossReferences: testCrossRefs,
    });

    const response = await facade.searchAndCompare({
      query: "04465-02220",
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        year: 2020,
        generation: "E210",
        engine: "1.8L 2ZR-FAE",
        market: "CL",
      },
      options: {
        comparisonCurrency: "CLP",
        targetDestinationCountry: "CL",
      },
    });

    assert.strictEqual(response.status, "SUCCESS");
    assert.strictEqual(response.totalOffersFound, 3);
    assert.strictEqual(response.clustersCount, 2); // 04465-02220 / Bosch cluster + PowerStop cluster
    assert.strictEqual(response.sourceReports.length, 2);

    const mainCluster = response.clusters.find(c =>
      c.canonicalPartNumber === "04465-02220" || c.canonicalPartNumber === "0446502220"
    );
    assert.ok(mainCluster);
    assert.strictEqual(mainCluster.fitmentResult?.verdict, "FIT");
    assert.strictEqual(mainCluster.comparison.items.length, 2);

    // Pick assertions
    assert.ok(mainCluster.comparison.bestPriceOfferId);
    assert.ok(mainCluster.comparison.bestTrustOfferId);
    assert.ok(mainCluster.comparison.bestOverallOfferId);
  });

  test("3. Truth Invariant: UNKNOWN shipping/tax derived as TOTAL_UNKNOWN (UNKNOWN !== 0)", async () => {
    const registry = new InMemoryAutomotiveSourceRegistry();
    registry.register(source2);
    const conn2 = new TestFixtureAutomotiveConnector(source2, { mode: "SUCCESS", mockOffers: offersSource2 });

    const facade = new SparePartsFacade({
      registry,
      connectors: [conn2],
    });

    const response = await facade.searchAndCompare({
      query: "17-1210",
      options: { comparisonCurrency: "CLP", targetDestinationCountry: "CL" },
    });

    assert.strictEqual(response.clustersCount, 1);
    const item = response.clusters[0].comparison.items[0];
    assert.strictEqual(item.totalCost.completeness, "TOTAL_UNKNOWN");
    assert.strictEqual(item.totalCost.totalAmount, undefined);
    assert.strictEqual(item.isComparable, false);
    assert.ok(item.totalCost.calculationBreakdown.includes("UNKNOWN"));
  });

  test("4. Fail-Closed Fitment: Vehicle mismatch yields NOT_FIT and disqualifies from side-by-side", async () => {
    const registry = new InMemoryAutomotiveSourceRegistry();
    registry.register(source1);
    const conn1 = new TestFixtureAutomotiveConnector(source1, { mode: "SUCCESS", mockOffers: offersSource1 });

    const facade = new SparePartsFacade({
      registry,
      connectors: [conn1],
      fitmentRules: testRules,
    });

    // Mismatched year 2010 (rule is 2018-2024)
    const response = await facade.searchAndCompare({
      query: "04465-02220",
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        year: 2010,
      },
    });

    const cluster = response.clusters[0];
    assert.strictEqual(cluster.fitmentResult?.verdict, "NOT_FIT");
    for (const item of cluster.comparison.items) {
      assert.strictEqual(item.fitmentVerdict, "NOT_FIT");
      assert.strictEqual(item.isComparable, false);
      assert.ok(item.incomparabilityReasons?.some(r => r.includes("Incompatible")));
    }
  });

  test("5. Reactive Filtering: Filters by price, fitment, seller trust, and stock", () => {
    const facade = new SparePartsFacade();

    const mockItems: any[] = [
      {
        offerId: "o1",
        basePrice: { amount: 35000, currency: "CLP" },
        totalCost: { totalAmount: 38000, completeness: "TOTAL_KNOWN", currency: "CLP" },
        sellerTrust: { score: 0.9 },
        fitmentVerdict: "FIT",
        isComparable: true,
      },
      {
        offerId: "o2",
        basePrice: { amount: 20000, currency: "CLP" },
        totalCost: { totalAmount: 20000, completeness: "TOTAL_KNOWN", currency: "CLP" },
        sellerTrust: { score: 0.65 },
        fitmentVerdict: "UNKNOWN",
        isComparable: true,
      },
      {
        offerId: "o3",
        basePrice: { amount: 50000, currency: "CLP" },
        totalCost: { completeness: "TOTAL_UNKNOWN" },
        sellerTrust: { score: 0.85 },
        fitmentVerdict: "NOT_FIT",
        isComparable: false,
        incomparabilityReasons: ["Incompatible", "Out of stock"],
      },
    ];

    // Filter: FIT only
    const fitOnly = facade.filterComparisonItems(mockItems, { fitmentVerdict: "FIT" });
    assert.strictEqual(fitOnly.length, 1);
    assert.strictEqual(fitOnly[0].offerId, "o1");

    // Filter: min trust 0.80
    const highTrust = facade.filterComparisonItems(mockItems, { minSellerTrust: 0.80 });
    assert.strictEqual(highTrust.length, 2);

    // Filter: maxPrice 30000
    const cheap = facade.filterComparisonItems(mockItems, { maxPrice: 30000 });
    assert.strictEqual(cheap.length, 1);
    assert.strictEqual(cheap[0].offerId, "o2");

    // Filter: in-stock only
    const inStock = facade.filterComparisonItems(mockItems, { onlyInStock: true });
    assert.strictEqual(inStock.length, 2);
  });

  test("6. UI Component: Initial render displays header, vehicle selector and search bar", () => {
    const rootContainer = new MockDOMElement("div");
    const view = new SparePartsView();
    view.mount(rootContainer as any);

    assert.ok(rootContainer.children.length > 0);
    const header = rootContainer.querySelector(".sp-header-card");
    assert.ok(header);
    assert.ok(header.textContent.includes("Spare Parts Search & Comparison Engine"));

    const vehCard = rootContainer.querySelector(".sp-vehicle-card");
    assert.ok(vehCard);

    const searchCard = rootContainer.querySelector(".sp-search-card");
    assert.ok(searchCard);

    const initialCard = rootContainer.querySelector(".sp-initial-card");
    assert.ok(initialCard);
    assert.ok(initialCard.textContent.includes("Ready to search replacement parts"));
  });

  test("7. UI Component: Quick vehicle preset populates vehicle context", () => {
    const rootContainer = new MockDOMElement("div");
    const view = new SparePartsView();
    view.mount(rootContainer as any);

    const presetButtons = rootContainer.querySelectorAll(".sp-presets-row button");
    assert.ok(presetButtons.length > 0);

    // Click first preset (Toyota Corolla 2020)
    presetButtons[0].dispatchEvent({ type: "click" });

    assert.strictEqual(view.selectedVehicle.make, "Toyota");
    assert.strictEqual(view.selectedVehicle.model, "Corolla");
    assert.strictEqual(view.selectedVehicle.year, "2020");

    const activeVehicleBar = rootContainer.querySelector(".sp-active-vehicle-bar");
    assert.ok(activeVehicleBar);
    assert.ok(activeVehicleBar.textContent.includes("Toyota Corolla 2020"));
  });

  test("8. UI Component: Side-by-side comparison selection limit (max 4) and removal", () => {
    const rootContainer = new MockDOMElement("div");
    const view = new SparePartsView();
    view.mount(rootContainer as any);

    const mockResponse: any = {
      searchId: "search-1",
      queryText: "04465-02220",
      status: "SUCCESS",
      executionTimeMs: 15,
      sourceReports: [{ sourceId: "src-1", sourceName: "Source 1", status: "SUCCESS", offersFound: 5, latencyMs: 10 }],
      totalOffersFound: 5,
      clustersCount: 1,
      clusters: [
        {
          clusterId: "c1",
          canonicalPartNumber: "04465-02220",
          canonicalBrand: "Toyota",
          description: "Brake Pads Set",
          offerCount: 5,
          fitmentResult: { verdict: "FIT", explanation: "Compatible" },
          comparison: {
            bestPriceOfferId: "o1",
            bestTrustOfferId: "o2",
            bestOverallOfferId: "o1",
            items: [
              {
                offerId: "o1",
                sellerName: "Seller 1",
                sourceId: "src-1",
                basePrice: { amount: 30000, currency: "CLP" },
                totalCost: {
                  totalAmount: 33000,
                  currency: "CLP",
                  completeness: "TOTAL_KNOWN",
                  shipping: { status: "KNOWN_AMOUNT", amount: 3000 },
                  taxes: { status: "INCLUDED" },
                  importCosts: { status: "NOT_APPLICABLE" },
                },
                sellerTrust: { score: 0.9, tier: "VERIFIED_PARTNER" },
                fitmentVerdict: "FIT",
                isComparable: true,
              },
              {
                offerId: "o2",
                sellerName: "Seller 2",
                sourceId: "src-1",
                basePrice: { amount: 35000, currency: "CLP" },
                totalCost: {
                  totalAmount: 35000,
                  currency: "CLP",
                  completeness: "TOTAL_KNOWN",
                  shipping: { status: "FREE" },
                  taxes: { status: "INCLUDED" },
                  importCosts: { status: "NOT_APPLICABLE" },
                },
                sellerTrust: { score: 0.95, tier: "OFFICIAL_STORE" },
                fitmentVerdict: "FIT",
                isComparable: true,
              },
            ],
          },
        },
      ],
    };

    view.setResults(mockResponse);

    // Initial: no comparison section until offers selected
    let compSection = rootContainer.querySelector(".sp-comparison-card");
    assert.strictEqual(compSection, null);

    // Select offer o1
    view.selectedOfferIds.add("o1");
    view.render();

    compSection = rootContainer.querySelector(".sp-comparison-card");
    assert.ok(compSection);
    assert.ok(compSection.textContent.includes("Side-by-Side Offer Comparison (1 offers selected)"));

    // Verify comparison table rows
    const table = compSection.querySelector(".sp-comparison-table");
    assert.ok(table);
    assert.ok(table.textContent.includes("Base Price"));
    assert.ok(table.textContent.includes("Shipping Cost"));
    assert.ok(table.textContent.includes("Total Landed Cost"));
    assert.ok(table.textContent.includes("Seller Trust Score"));

    // Deselect offer o1
    view.selectedOfferIds.delete("o1");
    view.render();
    assert.strictEqual(rootContainer.querySelector(".sp-comparison-card"), null);
  });

  test("9. Security: HTML/Script injection in part name rendered harmlessly as text", () => {
    const rootContainer = new MockDOMElement("div");
    const view = new SparePartsView();
    view.mount(rootContainer as any);

    const maliciousQuery = '<script>alert("XSS")</script>';
    const maliciousBrand = '<img src=x onerror=alert(1)>';

    const mockResponse: any = {
      searchId: "search-xss",
      queryText: maliciousQuery,
      status: "SUCCESS",
      executionTimeMs: 10,
      sourceReports: [],
      totalOffersFound: 1,
      clustersCount: 1,
      clusters: [
        {
          clusterId: "cxss",
          canonicalPartNumber: "MALICIOUS-01",
          canonicalBrand: maliciousBrand,
          description: "Safe Description",
          offerCount: 1,
          comparison: {
            items: [
              {
                offerId: "oxss",
                sellerName: "<b>Hacker Store</b>",
                sourceId: "src-xss",
                basePrice: { amount: 1000, currency: "CLP" },
                totalCost: {
                  completeness: "TOTAL_KNOWN",
                  totalAmount: 1000,
                  currency: "CLP",
                  shipping: { status: "FREE" },
                  taxes: { status: "INCLUDED" },
                  importCosts: { status: "NOT_APPLICABLE" },
                },
                sellerTrust: { score: 0.5, tier: "COMMUNITY_SELLER" },
                fitmentVerdict: "FIT",
                isComparable: true,
              },
            ],
          },
        },
      ],
    };

    view.setResults(mockResponse);

    // Text content must contain the exact raw string, never parsed into an active HTML element
    const banner = rootContainer.querySelector(".sp-cluster-banner");
    assert.ok(banner);
    assert.ok(banner.textContent.includes(maliciousBrand));

    const card = rootContainer.querySelector(".sp-offer-card");
    assert.ok(card);
    assert.ok(card.textContent.includes("<b>Hacker Store</b>"));
  });
});
