# Vehicle Parts Reference Application — Architecture & Specification

> **Second Reference Application demonstrating domain portability, deterministic vehicle compatibility, and enterprise automotive commerce over the AI Operating Platform.**

---

## 1. Domain Ownership vs Platform Invariant

```text
VEHICLE PARTS DOMAIN (Owns)
├── Vehicle Database (Make, Model, Year, Engine, Variant)
├── Parts Catalog (Brakes, Filters, Ignition, Suspension, Fluids, Electrical)
├── Deterministic Compatibility Rules Engine
├── Regional Warehouse Stock & Prices
└── Workshop Shopping Cart & Orders

                    ↕ REST / Authenticated API Client

AI OPERATING PLATFORM (Owns)
├── Autonomous Multi-Agent Orchestration
├── Natural Language Intent Extraction
├── Governed Model Router with Fallbacks
├── Policy Enforcement & Tenant Isolation
└── Append-Only SQLite WAL Durability & Observability
```

---

## 2. Vehicle Model Compatibility Engine

Automotive safety prohibits LLM hallucinations for mechanical fitment. Compatibility is determined strictly by a deterministic rule matrix matching vehicle specifications:

```typescript
export interface Vehicle {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly engine: string;
  readonly variant?: string;
}
```

### Compatibility Truth Rule
A part is marked **`COMPATIBLE`** if and only if:
1. Vehicle `make` and `model` match the part's certified vehicle list.
2. Vehicle `year` falls within `[yearFrom, yearTo]`.
3. Part's engine requirements (if specified) match the vehicle engine displacement and variant.

*If an incompatible part is added to a workshop cart with a selected vehicle, the system alerts the mechanic with a prominent `COMPATIBILITY WARNING`.*

---

## 3. Reference Catalog & OEM Cross-Referencing

| Part ID | SKU | Category | Brand | OEM Reference | Compatible Vehicles | Price (EUR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `part-brk-ty-01` | `BRK-TY-018` | Brakes | Akebono Pro | `04465-0D150` | Toyota Yaris (2014–2022), Corolla | 48.50 |
| `part-brk-ty-02` | `BRK-TY-OEM-01` | Brakes | Toyota Genuine | `04465-0D150` | Toyota Yaris (2014–2022) | 79.99 |
| `part-flt-oil-01` | `FLT-TY-OIL-02` | Filters | Mann-Filter | `90915-YZZN1` | Toyota Yaris, Honda Civic, RAV4 | 12.90 |
| `part-flt-air-01` | `FLT-TY-AIR-03` | Filters | Bosch Auto | `17801-21060` | Toyota Yaris (2012–2020) | 19.50 |
| `part-spk-ngk-01` | `SPK-NGK-IRID-4` | Ignition | NGK | `90919-01275` | Toyota Yaris, Honda Civic, Tucson | 56.00 |
| `part-sus-kyb-01` | `SUS-KYB-STRUT-F` | Suspension | KYB | `48510-52R10` | Toyota Yaris, VW Golf | 94.00 |

---

## 4. AI Discovery & Spanish Natural Language Intent

Mechanics and customer service agents query the catalog using natural technical Spanish:

- *"Necesito pastillas de freno para un Toyota Yaris 2018"* $\to$ Extracts `make: Toyota`, `model: Yaris`, `year: 2018`, `category: brakes`. Returns verified compatible Akebono and OEM brake pads.
- *"Filtro de aceite sintético para Honda Civic 2019"* $\to$ Extracts `make: Honda`, `model: Civic`, `category: filters`.
- *"Bujías iridium"* $\to$ Returns NGK Laser Iridium spark plug set.

---

## 5. Part Comparison & Tradeoff Matrix

Allows side-by-side comparison between OEM original components and aftermarket alternatives:
- **Price Delta:** Computes exact price variance.
- **Specification Matrix:** Compares friction materials, wear sensor inclusion, warranty duration, and service life.

---

## 6. Cart & Pre-Mutation Stock Integrity

- **Pre-Mutation Stock Verification:** Rejects cart additions exceeding live warehouse inventory.
- **Free Shipping Calculator:** Free shipping threshold set to EUR 120 (optimized for freight weight).
- **Checkout:** Confirmed checkout transitions orders and flushes active cart via Webpay Demo.
