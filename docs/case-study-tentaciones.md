# Case Study: Tentaciones AI Commerce on AI Operating Platform

## 1. Executive Summary
**Tentaciones AI Commerce** is an enterprise fashion, footwear, and virtual fitting room platform that integrates with the **AI Operating Platform** to deliver intelligent catalog discovery, personalized outfit recommendations, 3D virtual try-on styling, and smart cart assistance.

---

## 2. The Architectural Challenge
Integrating AI into e-commerce often leads to severe domain leakage:
- LLMs hallucinating out-of-stock items or inaccurate prices.
- Directly coupling proprietary store databases to AI prompt strings.
- Inability to degrade gracefully when AI services experience downtime.

---

## 3. The Platform Solution
By consuming the AI Operating Platform via `TentacionesPlatformAdapter`:
1. **Catalog Ownership Remains in Tentaciones:** The AI platform extracts search intents and ranks candidates; it never manufactures fake product inventories.
2. **Scoped Authentication:** Requests are authenticated via dedicated API keys (`key-tentaciones`) and restricted to allowed capabilities (`product.discovery`, `product.recommendation`, `product.compare`, `cart.assistance`, `ar.fitting_room`).
3. **AR Asset Governance:** 3D virtual fitting room assets follow governed URNs (`urn:tentaciones:ar:<category>:<productSlug>`) and SemVer versioning, paired with calibrated avatar profiles (Nova, Sora, Mateo).
4. **Deterministic Sizing Engine:** Body measurements (foot length, chest, waist) calculate exact recommended sizes with transparent reasoning.
5. **Resilient Fallback Hierarchy:** If the platform is offline, the application degrades smoothly to standard traditional commerce search without crashing the user's checkout flow.

---

## 4. End-to-End User Journey Trace
```text
User: "Quiero unas zapatillas negras para correr maratón y una remera técnica"
  ↓
[Tentaciones Shopping Agent]
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (product.discovery)
  ↓
[AI Operating Platform] -> Intent terms extracted: ["zapatillas", "negras", "maraton", "remera", "tecnica"]
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (product.recommendation) -> Scored candidates ranked
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (ar.fitting_room) -> Resolved for avatar "Nova"
  ↓
[Tentaciones Size Engine] -> Evaluates 25.5 cm foot length -> Recommends Size 40
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (cart.assistance) -> Free shipping evaluated
  ↓
[Sqlite WAL EventStore] -> Complete correlated trace recorded under single traceId
```

---

## 5. Key Takeaways
- Clean separation between e-commerce business domain and AI orchestration engine.
- Zero inventory hallucination.
- Resilient, production-oriented multi-agent integration.
