# Proyecto 03: Pasarelas de Modelos & AI Runtime
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-03-MODELS`
* **Área de Responsabilidad:** Integración de Modelos Fundacionales, Streaming, Invocación de Herramientas y Memoria
* **Ubicación en Repositorio:** `src/infrastructure/model/`, `src/infrastructure/memory/`
* **Línea Base de Pruebas:** 70 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Contrato Universal de Inferencia:** Todo proveedor de modelos implementa la interfaz canónica `ModelGateway` con normalización de prompts, temperatura, tope de tokens, schemas JSON estructurados y tool calling.
2. **Cero Dependencias de SDKs Privativos:** Los adaptadores para OpenAI, Anthropic, Ollama y Google Gemini se comunican directamente mediante `node:https` y `fetch` estándar de Node.js, eliminando paquetes pesados de terceros.
3. **Google Gemini / Vertex AI Gateway:** Adaptador nativo en `src/infrastructure/model/gemini/gemini-model-gateway.ts` compatible con Gemini 1.5/2.0 Pro/Flash con streaming y soporte de llamadas a funciones (ADR 0023).
4. **Router de Contingencia y Fallback:** `DefaultModelRouter` y `ProviderFactory` seleccionan el proveedor configurado y conmutan deterministamente a `StubModelGateway` ante ausencias de API keys en entornos locales de prueba.
5. **Memoria Contextual Relacional Duradera:** `SqliteMemoryGateway` persiste datos de sesión y memoria de agentes en la tabla `platform_memory` con índices compuestos y aislamiento estricto por tenant (ADR 0024).

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fases 36 a 39: Model Gateways Reales (OpenAI, Anthropic, Ollama, Stub) (v1.1)   │
│ • Contratos de inferencia, factory de adaptadores y streaming de respuestas.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 55: Adaptador Google Gemini / Vertex AI (`AOP-MODEL-GEMINI`) (v1.2)        │
│ • Implementación nativa de `GeminiModelGateway` sin dependencias de `@google/genai`.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 55: Pasarela de Memoria Duradera SQLite (`AOP-MEMORY`) (v1.2)              │
│ • Persistencia relacional duradera indexada en SQLite WAL con upsert atómico.          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
