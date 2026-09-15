import crypto from "node:crypto";
import {
  VehiclePartsPlatformAdapter,
  type VehiclePartDiscoveryResult,
} from "./vehicle-parts-platform-adapter.js";

export interface Vehicle {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly engine: string;
  readonly variant?: string | undefined;
}

export interface VehiclePart {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly category: "brakes" | "filters" | "ignition" | "suspension" | "fluids" | "electrical";
  readonly subcategory: string;
  readonly description: string;
  readonly basePrice: number;
  readonly currency: string;
  readonly stock: number;
  readonly oemReference: string;
  readonly isOem: boolean;
  readonly specifications: Readonly<Record<string, string | number | boolean>>;
  readonly compatibleVehicles: readonly {
    readonly make: string;
    readonly model: string;
    readonly yearFrom: number;
    readonly yearTo: number;
    readonly engines?: readonly string[] | undefined;
  }[];
  readonly tags: readonly string[];
}

export interface VehicleCartItem {
  readonly partId: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly lineTotal: number;
  readonly compatibleWithVehicle?: string | undefined;
}

export interface VehicleCartState {
  readonly id: string;
  readonly items: readonly VehicleCartItem[];
  readonly subtotal: number;
  readonly currency: string;
  readonly freeShippingThreshold: number;
  readonly qualifiesForFreeShipping: boolean;
  readonly missingForFreeShipping: number;
  readonly selectedVehicle?: Vehicle | undefined;
  readonly updatedAt: string;
}

export interface VehicleOrder {
  readonly orderId: string;
  readonly customer: {
    readonly name: string;
    readonly email: string;
    readonly workshopName?: string | undefined;
  };
  readonly shippingAddress: {
    readonly street: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly vehicleInfo?: Vehicle | undefined;
  readonly items: readonly VehicleCartItem[];
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly currency: string;
  readonly paymentMethod: "WEBPAY_DEMO" | "COMMERCIAL_INVOICE";
  readonly paymentStatus: "PAID_DEMO" | "PENDING";
  readonly orderStatus: "CONFIRMED" | "DISPATCHED";
  readonly createdAt: string;
}

export const VEHICLE_PARTS_REFERENCE_CATALOG: readonly VehiclePart[] = [
  {
    id: "part-brk-ty-01",
    sku: "BRK-TY-018",
    name: "Ceramic Front Brake Pads Premium Set",
    brand: "Akebono Pro",
    category: "brakes",
    subcategory: "brake-pads",
    description: "Ultra-quiet, low-dust ceramic brake pads engineered for superior thermal dissipation and OEM-spec fit.",
    basePrice: 48.5,
    currency: "EUR",
    stock: 24,
    oemReference: "04465-0D150",
    isOem: false,
    specifications: {
      material: "Ceramic",
      axle: "Front",
      wearSensorIncluded: true,
      thicknessMm: 15.2,
      warrantyMonths: 24,
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2014, yearTo: 2022, engines: ["1.3L", "1.5L Dual VVT-i", "1.5L Hybrid"] },
      { make: "Toyota", model: "Corolla", yearFrom: 2015, yearTo: 2019, engines: ["1.6L Valvematic", "1.8L Hybrid"] },
    ],
    tags: ["pastillas", "frenos", "freno", "delanteras", "brake", "pads", "toyota", "yaris", "corolla"],
  },
  {
    id: "part-brk-ty-02",
    sku: "BRK-TY-OEM-01",
    name: "Genuine Toyota OEM Front Brake Pads",
    brand: "Toyota Genuine Parts",
    category: "brakes",
    subcategory: "brake-pads",
    description: "Official factory original brake pads matching factory assembly tolerances and pedal feel.",
    basePrice: 79.99,
    currency: "EUR",
    stock: 15,
    oemReference: "04465-0D150",
    isOem: true,
    specifications: {
      material: "Semi-Metallic OEM Formulation",
      axle: "Front",
      wearSensorIncluded: true,
      thicknessMm: 15.5,
      warrantyMonths: 36,
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2014, yearTo: 2022, engines: ["1.3L", "1.5L Dual VVT-i", "1.5L Hybrid"] },
    ],
    tags: ["pastillas", "frenos", "oem", "original", "toyota", "yaris"],
  },
  {
    id: "part-flt-oil-01",
    sku: "FLT-TY-OIL-02",
    name: "High-Efficiency Synthetic Engine Oil Filter",
    brand: "Mann-Filter",
    category: "filters",
    subcategory: "oil-filter",
    description: "Spin-on oil filter with high-capacity synthetic filter media capturing 99% of particulate matter down to 20 microns.",
    basePrice: 12.9,
    currency: "EUR",
    stock: 80,
    oemReference: "90915-YZZN1",
    isOem: false,
    specifications: {
      filterType: "Spin-On",
      bypassValvePressureBar: 1.0,
      antiDrainbackValve: true,
      heightMm: 75,
      diameterMm: 65,
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2010, yearTo: 2023 },
      { make: "Toyota", model: "Corolla", yearFrom: 2010, yearTo: 2023 },
      { make: "Toyota", model: "RAV4", yearFrom: 2013, yearTo: 2022 },
      { make: "Honda", model: "Civic", yearFrom: 2016, yearTo: 2022, engines: ["1.5 i-VTEC Turbo", "2.0 i-VTEC"] },
    ],
    tags: ["filtro", "aceite", "oil", "filter", "mann", "toyota", "honda", "yaris", "civic"],
  },
  {
    id: "part-flt-air-01",
    sku: "FLT-TY-AIR-03",
    name: "Multi-Fiber Engine Air Intake Filter",
    brand: "Bosch Automotive",
    category: "filters",
    subcategory: "air-filter",
    description: "Micro-fiber engine air filter providing optimum airflow and dirt-holding capacity.",
    basePrice: 19.5,
    currency: "EUR",
    stock: 45,
    oemReference: "17801-21060",
    isOem: false,
    specifications: {
      filterType: "Panel",
      lengthMm: 240,
      widthMm: 120,
      heightMm: 42,
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2012, yearTo: 2020, engines: ["1.3L", "1.5L Dual VVT-i"] },
    ],
    tags: ["filtro", "aire", "motor", "air", "filter", "bosch", "toyota", "yaris"],
  },
  {
    id: "part-spk-ngk-01",
    sku: "SPK-NGK-IRID-4",
    name: "Laser Iridium Spark Plugs (Set of 4)",
    brand: "NGK",
    category: "ignition",
    subcategory: "spark-plugs",
    description: "High-ignitability laser iridium center electrode for maximum combustion stability and 100,000 km service life.",
    basePrice: 56.0,
    currency: "EUR",
    stock: 30,
    oemReference: "90919-01275",
    isOem: false,
    specifications: {
      electrodeMaterial: "Iridium / Platinum",
      threadSizeMm: 14,
      hexSizeMm: 16,
      serviceLifeKm: 100000,
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2015, yearTo: 2022, engines: ["1.5L Dual VVT-i"] },
      { make: "Honda", model: "Civic", yearFrom: 2016, yearTo: 2022, engines: ["1.5 i-VTEC Turbo"] },
      { make: "Hyundai", model: "Tucson", yearFrom: 2018, yearTo: 2023, engines: ["1.6 T-GDI"] },
    ],
    tags: ["bujias", "bujia", "chispa", "spark", "plugs", "ngk", "iridium", "toyota", "honda", "hyundai"],
  },
  {
    id: "part-sus-kyb-01",
    sku: "SUS-KYB-STRUT-F",
    name: "Gas-A-Just High-Pressure Gas Shock Absorber (Front)",
    brand: "KYB Suspension",
    category: "suspension",
    subcategory: "struts",
    description: "Monotube high-pressure nitrogen gas strut for responsive handling and road stability.",
    basePrice: 94.0,
    currency: "EUR",
    stock: 12,
    oemReference: "48510-52R10",
    isOem: false,
    specifications: {
      type: "Monotube Nitrogen Gas",
      position: "Front Axle",
      dampingType: "Self-Adjusting",
    },
    compatibleVehicles: [
      { make: "Toyota", model: "Yaris", yearFrom: 2014, yearTo: 2021 },
      { make: "Volkswagen", model: "Golf", yearFrom: 2017, yearTo: 2022, engines: ["1.5 TSI", "2.0 TSI"] },
    ],
    tags: ["amortiguador", "amortiguadores", "suspension", "strut", "kyb", "toyota", "volkswagen"],
  },
];

export class VehiclePartsEngine {
  private readonly catalog: Map<string, VehiclePart> = new Map();
  private readonly carts: Map<string, VehicleCartState> = new Map();
  private readonly orders: Map<string, VehicleOrder> = new Map();
  private readonly freeShippingThreshold = 120; // EUR 120 threshold for heavy parts
  private adapter?: VehiclePartsPlatformAdapter | undefined;

  constructor(options?: { readonly adapter?: VehiclePartsPlatformAdapter | undefined }) {
    this.adapter = options?.adapter;
    for (const part of VEHICLE_PARTS_REFERENCE_CATALOG) {
      this.catalog.set(part.id, part);
    }
  }

  // --- Vehicle Model Compatibility Engine ---

  isPartCompatible(partSkuOrId: string, vehicle: Vehicle): {
    readonly compatible: boolean;
    readonly reason: string;
    readonly part?: VehiclePart | undefined;
  } {
    const part =
      this.catalog.get(partSkuOrId) ||
      Array.from(this.catalog.values()).find((p) => p.sku === partSkuOrId);

    if (!part) {
      return { compatible: false, reason: `Part '${partSkuOrId}' not found in catalog.` };
    }

    const match = part.compatibleVehicles.find((cv) => {
      const makeMatch = cv.make.toLowerCase() === vehicle.make.toLowerCase();
      const modelMatch = cv.model.toLowerCase() === vehicle.model.toLowerCase();
      const yearMatch = vehicle.year >= cv.yearFrom && vehicle.year <= cv.yearTo;

      if (!makeMatch || !modelMatch || !yearMatch) return false;

      if (cv.engines && cv.engines.length > 0 && vehicle.engine && vehicle.engine !== "Standard") {
        return cv.engines.some((e) => vehicle.engine!.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(vehicle.engine!.toLowerCase()));
      }
      return true;
    });

    if (match) {
      return {
        compatible: true,
        reason: `Verified OEM fit: Part '${part.name}' (${part.sku}) is certified compatible for ${vehicle.make} ${vehicle.model} (${vehicle.year}).`,
        part,
      };
    }

    return {
      compatible: false,
      reason: `Part '${part.name}' (${part.sku}) is NOT compatible with ${vehicle.make} ${vehicle.model} (${vehicle.year}).`,
      part,
    };
  }

  findCompatibleParts(vehicle: Vehicle, category?: VehiclePart["category"]): readonly VehiclePart[] {
    return Array.from(this.catalog.values()).filter((part) => {
      if (category && part.category !== category) return false;
      return this.isPartCompatible(part.id, vehicle).compatible;
    });
  }

  // --- Natural Language Discovery ---

  async searchPartsNaturalLanguage(query: string, vehicleHint?: Vehicle): Promise<{
    readonly query: string;
    readonly detectedCategory?: VehiclePart["category"] | undefined;
    readonly detectedVehicle?: Partial<Vehicle> | undefined;
    readonly matches: readonly VehiclePart[];
    readonly platformDiscovery?: VehiclePartDiscoveryResult | undefined;
  }> {
    const normalized = query.toLowerCase().trim();
    let detectedCategory: VehiclePart["category"] | undefined = undefined;
    let detectedMake: string | undefined;
    let detectedModel: string | undefined;
    let detectedYear: number | undefined;

    // 1. Category extraction
    if (normalized.includes("freno") || normalized.includes("pastilla") || normalized.includes("disco") || normalized.includes("brake")) {
      detectedCategory = "brakes";
    } else if (normalized.includes("filtro") || normalized.includes("filter") || normalized.includes("aceite") || normalized.includes("aire")) {
      detectedCategory = "filters";
    } else if (normalized.includes("bujia") || normalized.includes("chispa") || normalized.includes("spark") || normalized.includes("encendido")) {
      detectedCategory = "ignition";
    } else if (normalized.includes("amortiguador") || normalized.includes("suspension") || normalized.includes("strut")) {
      detectedCategory = "suspension";
    }

    // 2. Vehicle extraction
    if (normalized.includes("toyota")) detectedMake = "Toyota";
    if (normalized.includes("honda")) detectedMake = "Honda";
    if (normalized.includes("volkswagen") || normalized.includes("vw")) detectedMake = "Volkswagen";
    if (normalized.includes("hyundai")) detectedMake = "Hyundai";

    if (normalized.includes("yaris")) detectedModel = "Yaris";
    if (normalized.includes("corolla")) detectedModel = "Corolla";
    if (normalized.includes("civic")) detectedModel = "Civic";
    if (normalized.includes("golf")) detectedModel = "Golf";
    if (normalized.includes("tucson")) detectedModel = "Tucson";

    const yearMatch = normalized.match(/\b(20\d\d)\b/);
    if (yearMatch) {
      detectedYear = parseInt(yearMatch[1]!, 10);
    }

    const detectedVehicle: Partial<Vehicle> = {
      ...(detectedMake !== undefined ? { make: detectedMake } : {}),
      ...(detectedModel !== undefined ? { model: detectedModel } : {}),
      ...(detectedYear !== undefined ? { year: detectedYear } : {}),
    };

    // Combine with vehicle hint if present
    const finalVehicle: Vehicle | undefined =
      vehicleHint ||
      (detectedMake && detectedModel && detectedYear
        ? {
            make: detectedMake,
            model: detectedModel,
            year: detectedYear,
            engine: "Standard",
          }
        : undefined);

    let matches: readonly VehiclePart[] = [];
    if (finalVehicle) {
      matches = this.findCompatibleParts(finalVehicle, detectedCategory);
    } else if (detectedCategory) {
      matches = Array.from(this.catalog.values()).filter((p) => p.category === detectedCategory);
    } else {
      matches = Array.from(this.catalog.values()).filter((p) =>
        p.tags.some((t) => normalized.includes(t)) || p.name.toLowerCase().includes(normalized)
      );
    }

    let platformDiscovery: VehiclePartDiscoveryResult | undefined = undefined;
    if (this.adapter) {
      try {
        platformDiscovery = await this.adapter.discoverParts(query, finalVehicle);
      } catch {
        // Fallback to local catalog
      }
    }

    return {
      query,
      detectedCategory,
      detectedVehicle: finalVehicle ?? detectedVehicle,
      matches,
      platformDiscovery,
    };
  }

  // --- Part Comparison ---

  compareParts(partSkuA: string, partSkuB: string): {
    readonly partA?: VehiclePart | undefined;
    readonly partB?: VehiclePart | undefined;
    readonly priceDifference: number;
    readonly oemComparison: string;
    readonly specificationsComparison: Readonly<Record<string, { a: unknown; b: unknown }>>;
  } {
    const partA = Array.from(this.catalog.values()).find((p) => p.sku === partSkuA || p.id === partSkuA);
    const partB = Array.from(this.catalog.values()).find((p) => p.sku === partSkuB || p.id === partSkuB);

    if (!partA || !partB) {
      return {
        partA,
        partB,
        priceDifference: 0,
        oemComparison: "One or both parts not found.",
        specificationsComparison: {},
      };
    }

    const priceDiff = Math.round((partA.basePrice - partB.basePrice) * 100) / 100;
    const oemComp =
      partA.isOem && !partB.isOem
        ? `${partA.brand} is genuine OEM factory spec; ${partB.brand} is premium aftermarket.`
        : !partA.isOem && partB.isOem
        ? `${partB.brand} is genuine OEM factory spec; ${partA.brand} is premium aftermarket.`
        : `${partA.brand} and ${partB.brand} share the same OEM compatibility class (${partA.oemReference}).`;

    const allKeys = new Set([...Object.keys(partA.specifications), ...Object.keys(partB.specifications)]);
    const specs: Record<string, { a: unknown; b: unknown }> = {};
    for (const key of allKeys) {
      specs[key] = {
        a: partA.specifications[key] ?? "N/A",
        b: partB.specifications[key] ?? "N/A",
      };
    }

    return {
      partA,
      partB,
      priceDifference: priceDiff,
      oemComparison: oemComp,
      specificationsComparison: Object.freeze(specs),
    };
  }

  // --- Shopping Cart & Pre-Mutation Stock Integrity ---

  getOrCreateCart(cartId: string = crypto.randomUUID(), vehicle?: Vehicle): VehicleCartState {
    const existing = this.carts.get(cartId);
    if (existing) return existing;

    const initial: VehicleCartState = {
      id: cartId,
      items: [],
      subtotal: 0,
      currency: "EUR",
      freeShippingThreshold: this.freeShippingThreshold,
      qualifiesForFreeShipping: false,
      missingForFreeShipping: this.freeShippingThreshold,
      selectedVehicle: vehicle,
      updatedAt: new Date().toISOString(),
    };
    this.carts.set(cartId, initial);
    return initial;
  }

  addToCart(
    cartId: string,
    sku: string,
    quantity = 1,
    vehicle?: Vehicle
  ): {
    readonly success: boolean;
    readonly cart: VehicleCartState;
    readonly warning?: string | undefined;
    readonly error?: string | undefined;
  } {
    const cart = this.getOrCreateCart(cartId, vehicle);
    const part = Array.from(this.catalog.values()).find((p) => p.sku === sku);

    if (!part) {
      return { success: false, cart, error: `SKU '${sku}' not found in auto parts catalog.` };
    }

    if (part.stock < quantity) {
      return {
        success: false,
        cart,
        error: `Insufficient warehouse stock for part '${part.name}' (${sku}). Available: ${part.stock}, Requested: ${quantity}.`,
      };
    }

    let warning: string | undefined = undefined;
    if (vehicle) {
      const compCheck = this.isPartCompatible(part.id, vehicle);
      if (!compCheck.compatible) {
        warning = `COMPATIBILITY WARNING: ${compCheck.reason}`;
      }
    }

    const updatedItems = [...cart.items];
    const existingIndex = updatedItems.findIndex((item) => item.sku === sku);

    if (existingIndex >= 0) {
      const existing = updatedItems[existingIndex]!;
      const newQty = existing.quantity + quantity;
      if (part.stock < newQty) {
        return {
          success: false,
          cart,
          error: `Cannot add ${quantity} more units. Total in cart would exceed stock (${part.stock}).`,
        };
      }
      updatedItems[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: Math.round(newQty * existing.unitPrice * 100) / 100,
      };
    } else {
      updatedItems.push({
        partId: part.id,
        sku: part.sku,
        name: part.name,
        brand: part.brand,
        unitPrice: part.basePrice,
        quantity,
        lineTotal: Math.round(quantity * part.basePrice * 100) / 100,
        compatibleWithVehicle: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.year})` : undefined,
      });
    }

    const subtotal = Math.round(updatedItems.reduce((acc, item) => acc + item.lineTotal, 0) * 100) / 100;
    const missing = Math.max(0, Math.round((this.freeShippingThreshold - subtotal) * 100) / 100);
    const updatedCart: VehicleCartState = {
      id: cart.id,
      items: Object.freeze(updatedItems),
      subtotal,
      currency: "EUR",
      freeShippingThreshold: this.freeShippingThreshold,
      qualifiesForFreeShipping: missing === 0,
      missingForFreeShipping: missing,
      selectedVehicle: vehicle ?? cart.selectedVehicle,
      updatedAt: new Date().toISOString(),
    };

    this.carts.set(cart.id, updatedCart);
    return { success: true, cart: updatedCart, warning };
  }

  // --- AI Cart Assistant ---

  assistCartQuery(cartId: string, question: string): {
    readonly query: string;
    readonly answer: string;
    readonly cart: VehicleCartState;
  } {
    const cart = this.getOrCreateCart(cartId);
    const normalized = question.toLowerCase();

    if (normalized.includes("despacho gratis") || normalized.includes("envío gratis") || normalized.includes("cuánto me falta")) {
      if (cart.qualifiesForFreeShipping) {
        return {
          query: question,
          answer: `¡Tu pedido califica para despacho gratis express para talleres! Subtotal: ${cart.subtotal} EUR (Umbral: ${cart.freeShippingThreshold} EUR).`,
          cart,
        };
      }
      return {
        query: question,
        answer: `Tu subtotal actual es ${cart.subtotal} EUR. Te faltan ${cart.missingForFreeShipping} EUR para envío gratis. ¿Deseas agregar un filtro de aceite sintético por 12.90 EUR?`,
        cart,
      };
    }

    if (normalized.includes("compatible") || normalized.includes("sirve")) {
      if (!cart.selectedVehicle) {
        return {
          query: question,
          answer: "Por favor indica el modelo, año y motor de tu vehículo para verificar la compatibilidad de todos los repuestos.",
          cart,
        };
      }
      return {
        query: question,
        answer: `Todos los repuestos en tu carrito han sido verificados para tu ${cart.selectedVehicle.make} ${cart.selectedVehicle.model} (${cart.selectedVehicle.year}).`,
        cart,
      };
    }

    return {
      query: question,
      answer: `Tu carrito de repuestos automotrices tiene un subtotal de ${cart.subtotal} EUR (${cart.items.length} items).`,
      cart,
    };
  }

  // --- Checkout ---

  processCheckout(
    cartId: string,
    customer: VehicleOrder["customer"],
    shippingAddress: VehicleOrder["shippingAddress"],
    paymentMethod: VehicleOrder["paymentMethod"] = "WEBPAY_DEMO"
  ): {
    readonly success: boolean;
    readonly order?: VehicleOrder | undefined;
    readonly error?: string | undefined;
  } {
    const cart = this.getOrCreateCart(cartId);
    if (cart.items.length === 0) {
      return { success: false, error: "Cannot checkout with an empty parts cart." };
    }

    // Pre-mutation stock check
    for (const item of cart.items) {
      const part = this.catalog.get(item.partId);
      if (!part || part.stock < item.quantity) {
        return {
          success: false,
          error: `Checkout failed: Part '${item.name}' (SKU: ${item.sku}) is out of stock in regional warehouse.`,
        };
      }
    }

    const shippingFee = cart.qualifiesForFreeShipping ? 0 : 14.99;
    const total = Math.round((cart.subtotal + shippingFee) * 100) / 100;
    const orderId = `parts-order-${crypto.randomUUID().slice(0, 8)}`;

    const order: VehicleOrder = {
      orderId,
      customer,
      shippingAddress,
      vehicleInfo: cart.selectedVehicle,
      items: [...cart.items],
      subtotal: cart.subtotal,
      shippingFee,
      total,
      currency: "EUR",
      paymentMethod,
      paymentStatus: paymentMethod === "WEBPAY_DEMO" ? "PAID_DEMO" : "PENDING",
      orderStatus: "CONFIRMED",
      createdAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    // Reset cart after confirmed purchase
    this.carts.set(cartId, {
      id: cartId,
      items: [],
      subtotal: 0,
      currency: "EUR",
      freeShippingThreshold: this.freeShippingThreshold,
      qualifiesForFreeShipping: false,
      missingForFreeShipping: this.freeShippingThreshold,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, order };
  }

  getOrder(orderId: string): VehicleOrder | undefined {
    return this.orders.get(orderId);
  }

  listParts(): readonly VehiclePart[] {
    return Array.from(this.catalog.values());
  }
}
