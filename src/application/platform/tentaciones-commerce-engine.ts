import crypto from "node:crypto";
import {
  type ARProfile,
  type ARStatus,
  type SizeRecommendationInput,
  type SizeRecommendationResult,
  parseAndValidateUrn,
  recommendSize,
} from "./ar-fitting-room.js";
import {
  TentacionesPlatformAdapter,
  type ProductDiscoveryResult,
  type RecommendationResult,
  type ComparisonResult,
  type CartAssistanceResult,
  type FittingRoomResolutionResult,
} from "./tentaciones-platform-adapter.js";

export interface ProductVariant {
  readonly sku: string;
  readonly color: string;
  readonly size: string | number;
  readonly price: number;
  readonly stock: number;
  readonly arAssetUrn?: string | undefined;
}

export interface Product {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: "footwear" | "apparel" | "accessories";
  readonly subcategory: string;
  readonly description: string;
  readonly basePrice: number;
  readonly currency: string;
  readonly tags: readonly string[];
  readonly variants: readonly ProductVariant[];
  readonly arAvailable: boolean;
  readonly defaultArUrn?: string | undefined;
  readonly specifications: Readonly<Record<string, string | number | boolean>>;
}

export interface CartItem {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly color: string;
  readonly size: string | number;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly lineTotal: number;
}

export interface CartState {
  readonly id: string;
  readonly items: readonly CartItem[];
  readonly subtotal: number;
  readonly currency: string;
  readonly freeShippingThreshold: number;
  readonly qualifiesForFreeShipping: boolean;
  readonly missingForFreeShipping: number;
  readonly updatedAt: string;
}

export interface CustomerOrder {
  readonly orderId: string;
  readonly customer: {
    readonly name: string;
    readonly email: string;
    readonly phone?: string | undefined;
  };
  readonly shippingAddress: {
    readonly street: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly items: readonly CartItem[];
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly currency: string;
  readonly paymentMethod: "WEBPAY_DEMO" | "PRODUCTION_PAYMENT_GATEWAY";
  readonly paymentStatus: "PAID_DEMO" | "PENDING" | "REJECTED";
  readonly orderStatus: "CONFIRMED" | "PROCESSING" | "SHIPPED";
  readonly createdAt: string;
}

export const TENTACIONES_REFERENCE_CATALOG: readonly Product[] = [
  {
    id: "prod-carbon-racer",
    slug: "pro-carbon-racer",
    name: "Pro Carbon Racer Marathon Shoes",
    brand: "Tentaciones Sport",
    category: "footwear",
    subcategory: "running",
    description: "Elite carbon-plated road racing shoe built for marathon performance and maximum energy return.",
    basePrice: 149.99,
    currency: "EUR",
    tags: ["running", "marathon", "carbon", "black", "zapatillas", "correr"],
    arAvailable: true,
    defaultArUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer",
    specifications: {
      weightGrams: 198,
      dropMm: 8,
      cushioning: "High Energy Foam",
      plate: "Full-Length Carbon",
      waterproof: false,
    },
    variants: [
      { sku: "PCR-BLK-39", color: "Black / Stealth", size: 39, price: 149.99, stock: 12, arAssetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer" },
      { sku: "PCR-BLK-40", color: "Black / Stealth", size: 40, price: 149.99, stock: 18, arAssetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer" },
      { sku: "PCR-BLK-41", color: "Black / Stealth", size: 41, price: 149.99, stock: 15, arAssetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer" },
      { sku: "PCR-BLK-42", color: "Black / Stealth", size: 42, price: 149.99, stock: 20, arAssetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer" },
      { sku: "PCR-BLK-43", color: "Black / Stealth", size: 43, price: 149.99, stock: 8, arAssetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer" },
    ],
  },
  {
    id: "prod-trail-blazer",
    slug: "trail-blazer-gtx",
    name: "Trail Blazer GTX Mountain Running Shoes",
    brand: "Tentaciones Outdoor",
    category: "footwear",
    subcategory: "trail",
    description: "Rugged waterproof trail running shoe with Vibram Megagrip for technical alpine terrain.",
    basePrice: 169.99,
    currency: "EUR",
    tags: ["trail", "mountain", "waterproof", "gtx", "zapatillas", "outdoor"],
    arAvailable: true,
    defaultArUrn: "urn:tentaciones:ar:footwear:trail-blazer-gtx",
    specifications: {
      weightGrams: 285,
      dropMm: 6,
      cushioning: "Dual-Density EVA",
      membrane: "GORE-TEX Extended Comfort",
      waterproof: true,
    },
    variants: [
      { sku: "TBG-OLV-40", color: "Olive / Orange", size: 40, price: 169.99, stock: 10, arAssetUrn: "urn:tentaciones:ar:footwear:trail-blazer-gtx" },
      { sku: "TBG-OLV-41", color: "Olive / Orange", size: 41, price: 169.99, stock: 14, arAssetUrn: "urn:tentaciones:ar:footwear:trail-blazer-gtx" },
      { sku: "TBG-OLV-42", color: "Olive / Orange", size: 42, price: 169.99, stock: 9, arAssetUrn: "urn:tentaciones:ar:footwear:trail-blazer-gtx" },
      { sku: "TBG-BLK-42", color: "Black / Grey", size: 42, price: 169.99, stock: 16, arAssetUrn: "urn:tentaciones:ar:footwear:trail-blazer-gtx" },
    ],
  },
  {
    id: "prod-running-jacket",
    slug: "storm-shield-jacket",
    name: "StormShield Pro Waterproof Running Jacket",
    brand: "Tentaciones Sport",
    category: "apparel",
    subcategory: "jackets",
    description: "Ultra-lightweight 2.5-layer breathable waterproof running jacket with taped seams.",
    basePrice: 119.99,
    currency: "EUR",
    tags: ["jacket", "chaqueta", "impermeable", "running", "waterproof", "black"],
    arAvailable: true,
    defaultArUrn: "urn:tentaciones:ar:apparel:running-jacket-v2",
    specifications: {
      waterproofRating: "20,000 mm",
      breathability: "25,000 g/m2/24h",
      weightGrams: 145,
      reflectivity: "360-degree high-vis",
      packable: true,
    },
    variants: [
      { sku: "SSJ-BLK-S", color: "Midnight Black", size: "S", price: 119.99, stock: 15, arAssetUrn: "urn:tentaciones:ar:apparel:running-jacket-v2" },
      { sku: "SSJ-BLK-M", color: "Midnight Black", size: "M", price: 119.99, stock: 25, arAssetUrn: "urn:tentaciones:ar:apparel:running-jacket-v2" },
      { sku: "SSJ-BLK-L", color: "Midnight Black", size: "L", price: 119.99, stock: 20, arAssetUrn: "urn:tentaciones:ar:apparel:running-jacket-v2" },
      { sku: "SSJ-BLK-XL", color: "Midnight Black", size: "XL", price: 119.99, stock: 10, arAssetUrn: "urn:tentaciones:ar:apparel:running-jacket-v2" },
    ],
  },
  {
    id: "prod-evening-dress",
    slug: "silk-evening-dress",
    name: "Aura Silk Elegant Dinner Dress",
    brand: "Tentaciones Atelier",
    category: "apparel",
    subcategory: "dresses",
    description: "Sophisticated pure mulberry silk midi dress designed for formal dinners and evening galas.",
    basePrice: 189.99,
    currency: "EUR",
    tags: ["dress", "vestido", "elegante", "cena", "silk", "black", "formal"],
    arAvailable: true,
    defaultArUrn: "urn:tentaciones:ar:apparel:silk-evening-dress",
    specifications: {
      fabric: "100% Mulberry Silk",
      fit: "Tailored Slim A-Line",
      care: "Dry Clean Only",
      origin: "Milan Studio",
    },
    variants: [
      { sku: "SED-NOIR-S", color: "Noir Velvet", size: "S", price: 189.99, stock: 8, arAssetUrn: "urn:tentaciones:ar:apparel:silk-evening-dress" },
      { sku: "SED-NOIR-M", color: "Noir Velvet", size: "M", price: 189.99, stock: 12, arAssetUrn: "urn:tentaciones:ar:apparel:silk-evening-dress" },
      { sku: "SED-NOIR-L", color: "Noir Velvet", size: "L", price: 189.99, stock: 6, arAssetUrn: "urn:tentaciones:ar:apparel:silk-evening-dress" },
    ],
  },
  {
    id: "prod-running-socks",
    slug: "anti-blister-socks-pack",
    name: "Pro Performance Anti-Blister Running Socks (3-Pack)",
    brand: "Tentaciones Sport",
    category: "accessories",
    subcategory: "socks",
    description: "Anatomical compression running socks with Merino wool blend and seamless toe construction.",
    basePrice: 24.99,
    currency: "EUR",
    tags: ["socks", "calcetines", "running", "accessories", "anti-blister"],
    arAvailable: false,
    specifications: {
      material: "45% Merino, 45% Polyamide, 10% Elastane",
      compression: "Targeted Arch Support",
      cushioning: "Medium",
    },
    variants: [
      { sku: "ABS-WHT-M", color: "White / Grey", size: "M (39-42)", price: 24.99, stock: 50 },
      { sku: "ABS-BLK-M", color: "Black / Charcoal", size: "M (39-42)", price: 24.99, stock: 60 },
      { sku: "ABS-BLK-L", color: "Black / Charcoal", size: "L (43-46)", price: 24.99, stock: 40 },
    ],
  },
];

export class TentacionesCommerceEngine {
  private readonly adapter?: TentacionesPlatformAdapter | undefined;
  private readonly catalog: Map<string, Product> = new Map();
  private readonly carts: Map<string, CartState> = new Map();
  private readonly orders: Map<string, CustomerOrder> = new Map();
  private readonly freeShippingThreshold = 100.0;

  constructor(options?: {
    readonly adapter?: TentacionesPlatformAdapter | undefined;
    readonly initialCatalog?: readonly Product[] | undefined;
  }) {
    this.adapter = options?.adapter;
    const initialProducts = options?.initialCatalog ?? TENTACIONES_REFERENCE_CATALOG;
    for (const p of initialProducts) {
      this.catalog.set(p.id, p);
    }
  }

  // --- Catalog Domain Operations ---

  listProducts(filter?: { category?: string; tag?: string; arOnly?: boolean }): readonly Product[] {
    let result = Array.from(this.catalog.values());
    if (filter?.category) {
      result = result.filter((p) => p.category === filter.category);
    }
    if (filter?.tag) {
      result = result.filter((p) => p.tags.includes(filter.tag!.toLowerCase()));
    }
    if (filter?.arOnly) {
      result = result.filter((p) => p.arAvailable);
    }
    return result;
  }

  getProductById(id: string): Product | undefined {
    return this.catalog.get(id);
  }

  getProductBySlug(slug: string): Product | undefined {
    return Array.from(this.catalog.values()).find((p) => p.slug === slug);
  }

  findVariant(sku: string): { product: Product; variant: ProductVariant } | undefined {
    for (const p of this.catalog.values()) {
      const v = p.variants.find((variant) => variant.sku === sku);
      if (v) return { product: p, variant: v };
    }
    return undefined;
  }

  // --- AI-Assisted Product Discovery ---

  async searchProductsNaturalLanguage(query: string, traceId?: string): Promise<{
    readonly query: string;
    readonly intent: { readonly category?: string | undefined; readonly tags: readonly string[]; readonly maxPrice?: number | undefined };
    readonly matches: readonly Product[];
    readonly discoveryResult?: ProductDiscoveryResult | undefined;
  }> {
    const normalized = query.toLowerCase().trim();
    const extractedTags: string[] = [];
    let detectedCategory: string | undefined = undefined;

    if (normalized.includes("zapatilla") || normalized.includes("correr") || normalized.includes("calzado") || normalized.includes("shoe")) {
      detectedCategory = "footwear";
      extractedTags.push("running", "zapatillas");
    }
    if (normalized.includes("vestido") || normalized.includes("cena") || normalized.includes("elegante")) {
      detectedCategory = "apparel";
      extractedTags.push("dress", "elegante", "cena");
    }
    if (normalized.includes("chaqueta") || normalized.includes("impermeable") || normalized.includes("jacket")) {
      detectedCategory = "apparel";
      extractedTags.push("jacket", "impermeable", "waterproof");
    }
    if (normalized.includes("negra") || normalized.includes("negro") || normalized.includes("black")) {
      extractedTags.push("black");
    }
    if (normalized.includes("trail") || normalized.includes("montaña")) {
      extractedTags.push("trail", "mountain");
    }

    let matches = this.listProducts();
    if (detectedCategory) {
      matches = matches.filter((p) => p.category === detectedCategory);
    }
    if (extractedTags.length > 0) {
      matches = matches.filter((p) => extractedTags.some((t) => p.tags.includes(t)));
    }

    let discoveryResult: ProductDiscoveryResult | undefined = undefined;
    if (this.adapter) {
      try {
        discoveryResult = await this.adapter.discoverProducts(query, traceId);
      } catch {
        // Fallback to local catalog
      }
    }

    return {
      query,
      intent: { category: detectedCategory, tags: extractedTags },
      matches,
      discoveryResult,
    };
  }

  // --- AI Recommendations & Comparison ---

  async getRecommendations(productId: string): Promise<readonly Product[]> {
    const target = this.getProductById(productId);
    if (!target) return [];

    // Attribute-based matching strictly within authentic catalog
    const related = Array.from(this.catalog.values()).filter((p) => {
      if (p.id === target.id) return false;
      return (
        p.category === target.category ||
        p.tags.some((t) => target.tags.includes(t)) ||
        (target.category === "footwear" && p.category === "accessories")
      );
    });

    return related.slice(0, 3);
  }

  compareProducts(productIds: readonly string[]): {
    readonly products: readonly Product[];
    readonly matrix: readonly Readonly<Record<string, unknown>>[];
    readonly differentiators: readonly string[];
  } {
    const prods = productIds
      .map((id) => this.getProductById(id))
      .filter((p): p is Product => p !== undefined);

    const matrix = prods.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      basePrice: p.basePrice,
      currency: p.currency,
      arAvailable: p.arAvailable,
      ...p.specifications,
    }));

    const differentiators = ["basePrice", "category", "weightGrams", "waterproof", "arAvailable"];

    return {
      products: prods,
      matrix,
      differentiators,
    };
  }

  // --- Shopping Cart & Stock Integrity ---

  getOrCreateCart(cartId: string = crypto.randomUUID()): CartState {
    const existing = this.carts.get(cartId);
    if (existing) return existing;

    const initial: CartState = {
      id: cartId,
      items: [],
      subtotal: 0,
      currency: "EUR",
      freeShippingThreshold: this.freeShippingThreshold,
      qualifiesForFreeShipping: false,
      missingForFreeShipping: this.freeShippingThreshold,
      updatedAt: new Date().toISOString(),
    };
    this.carts.set(cartId, initial);
    return initial;
  }

  addToCart(cartId: string, sku: string, quantity = 1): {
    readonly success: boolean;
    readonly cart: CartState;
    readonly error?: string | undefined;
  } {
    const cart = this.getOrCreateCart(cartId);
    const lookup = this.findVariant(sku);

    if (!lookup) {
      return { success: false, cart, error: `SKU '${sku}' not found in catalog.` };
    }

    const { product, variant } = lookup;
    if (variant.stock < quantity) {
      return {
        success: false,
        cart,
        error: `Insufficient stock for SKU '${sku}'. Requested: ${quantity}, Available: ${variant.stock}.`,
      };
    }

    const existingIndex = cart.items.findIndex((item) => item.sku === sku);
    const updatedItems = [...cart.items];

    if (existingIndex >= 0) {
      const existing = updatedItems[existingIndex]!;
      const newQty = existing.quantity + quantity;
      if (variant.stock < newQty) {
        return {
          success: false,
          cart,
          error: `Cannot add ${quantity} more units. Total in cart would exceed stock (${variant.stock}).`,
        };
      }
      updatedItems[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: Math.round(newQty * existing.unitPrice * 100) / 100,
      };
    } else {
      updatedItems.push({
        productId: product.id,
        sku: variant.sku,
        name: product.name,
        color: variant.color,
        size: variant.size,
        unitPrice: variant.price,
        quantity,
        lineTotal: Math.round(quantity * variant.price * 100) / 100,
      });
    }

    const subtotal = Math.round(updatedItems.reduce((acc, item) => acc + item.lineTotal, 0) * 100) / 100;
    const missing = Math.max(0, Math.round((this.freeShippingThreshold - subtotal) * 100) / 100);
    const updatedCart: CartState = {
      id: cart.id,
      items: updatedItems,
      subtotal,
      currency: "EUR",
      freeShippingThreshold: this.freeShippingThreshold,
      qualifiesForFreeShipping: missing === 0,
      missingForFreeShipping: missing,
      updatedAt: new Date().toISOString(),
    };

    this.carts.set(cart.id, updatedCart);
    return { success: true, cart: updatedCart };
  }

  // --- AI Cart Assistant ---

  assistCartQuery(cartId: string, question: string): {
    readonly query: string;
    readonly answer: string;
    readonly cart: CartState;
    readonly requiresConfirmation?: boolean | undefined;
    readonly suggestedAction?: string | undefined;
  } {
    const cart = this.getOrCreateCart(cartId);
    const normalized = question.toLowerCase();

    if (normalized.includes("qué tengo") || normalized.includes("contenido") || normalized.includes("items")) {
      if (cart.items.length === 0) {
        return {
          query: question,
          answer: "Tu carrito está actualmente vacío. ¿Te gustaría explorar zapatillas para correr o chaquetas?",
          cart,
        };
      }
      const summary = cart.items.map((i) => `${i.quantity}x ${i.name} (Talla: ${i.size}, ${i.lineTotal} EUR)`).join(", ");
      return {
        query: question,
        answer: `Tienes ${cart.items.length} producto(s) en tu carrito: ${summary}. Subtotal: ${cart.subtotal} EUR.`,
        cart,
      };
    }

    if (normalized.includes("despacho gratis") || normalized.includes("envío gratis") || normalized.includes("cuánto me falta")) {
      if (cart.qualifiesForFreeShipping) {
        return {
          query: question,
          answer: `¡Excelente noticia! Tu pedido de ${cart.subtotal} EUR ya califica para despacho gratis (umbral: ${cart.freeShippingThreshold} EUR).`,
          cart,
        };
      }
      return {
        query: question,
        answer: `Tu subtotal actual es ${cart.subtotal} EUR. Te faltan ${cart.missingForFreeShipping} EUR para obtener despacho gratis. ¿Deseas agregar calcetines de rendimiento por 24.99 EUR?`,
        cart,
        suggestedAction: "ADD_ADDON_SOCKS",
      };
    }

    if (normalized.includes("agrega") || normalized.includes("comprar")) {
      return {
        query: question,
        answer: "Para agregar este producto al carrito, confirma la selección de talla y color.",
        cart,
        requiresConfirmation: true,
        suggestedAction: "CONFIRM_ADD_TO_CART",
      };
    }

    return {
      query: question,
      answer: `Tu carrito tiene un subtotal de ${cart.subtotal} EUR. ¿En qué más te puedo asistir?`,
      cart,
    };
  }

  // --- Checkout Flow ---

  processCheckout(
    cartId: string,
    customer: CustomerOrder["customer"],
    shippingAddress: CustomerOrder["shippingAddress"],
    paymentMethod: CustomerOrder["paymentMethod"] = "WEBPAY_DEMO"
  ): {
    readonly success: boolean;
    readonly order?: CustomerOrder | undefined;
    readonly error?: string | undefined;
  } {
    const cart = this.getOrCreateCart(cartId);
    if (cart.items.length === 0) {
      return { success: false, error: "Cannot checkout with an empty cart." };
    }

    // Validate stock for all items
    for (const item of cart.items) {
      const lookup = this.findVariant(item.sku);
      if (!lookup || lookup.variant.stock < item.quantity) {
        return {
          success: false,
          error: `Checkout failed: Product '${item.name}' (SKU: ${item.sku}) is out of stock.`,
        };
      }
    }

    const shippingFee = cart.qualifiesForFreeShipping ? 0 : 9.99;
    const total = Math.round((cart.subtotal + shippingFee) * 100) / 100;
    const orderId = `order-${crypto.randomUUID().slice(0, 8)}`;

    const order: CustomerOrder = {
      orderId,
      customer,
      shippingAddress,
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
    // Clear cart after confirmed checkout
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

  getOrder(orderId: string): CustomerOrder | undefined {
    return this.orders.get(orderId);
  }

  // --- AR Virtual Fitting Room Bridge ---

  async resolveFittingRoom(
    assetUrn: string,
    profile: ARProfile = "Nova",
    measurements?: { readonly footLengthCm?: number; readonly footWidthCm?: number; readonly chestCm?: number; readonly waistCm?: number; readonly hipsCm?: number }
  ): Promise<{
    readonly urn: string;
    readonly profile: ARProfile;
    readonly previewUrl: string;
    readonly recommendedSize?: SizeRecommendationResult | undefined;
    readonly arStatus: ARStatus;
    readonly isLocalEngine: boolean;
  }> {
    const urnDetails = parseAndValidateUrn(assetUrn);
    if (!urnDetails) {
      return {
        urn: assetUrn,
        profile,
        previewUrl: "",
        arStatus: "AR_ASSET_INVALID",
        isLocalEngine: true,
      };
    }

    let recommendedSize: SizeRecommendationResult | undefined = undefined;
    if (measurements && urnDetails.category === "footwear") {
      recommendedSize = recommendSize({
        category: "footwear",
        footLengthCm: measurements.footLengthCm,
        chestCm: measurements.chestCm,
        waistCm: measurements.waistCm,
        hipsCm: measurements.hipsCm,
        profile,
      });
    }

    const previewUrl = `https://ar.tentaciones.com/view/${encodeURIComponent(assetUrn)}?avatar=${profile}`;

    return {
      urn: assetUrn,
      profile,
      previewUrl,
      recommendedSize,
      arStatus: "AR_AVAILABLE",
      isLocalEngine: true,
    };
  }
}
