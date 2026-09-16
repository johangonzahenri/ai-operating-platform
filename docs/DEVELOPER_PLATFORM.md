# Developer Platform (Plataforma para Desarrolladores)
## Especificación de Herramientas, SDK y Contratos de Integración (v1.1.0)

La **Developer Platform** (Plataforma para Desarrolladores) proporciona los estándares técnicos y librerías cliente para construir aplicaciones que consuman las capacidades de la **AI Operating Platform**.

---

## 1. Componentes de la Plataforma de Desarrolladores

1. **Platform SDK (`src/sdk/`):**
   * Cliente tipado en TypeScript (`PlatformClient`) que implementa autenticación bearer, reintentos exponenciales y validación estricta de respuestas.
2. **Contratos OpenAPI 3.0 (`docs/API_REFERENCE.md`):**
   * Esquemas de datos normalizados para cada entidad (`Task`, `Execution`, `Agent`, `ToolCapability`).
3. **Entorno de Pruebas Determinista (Stub Engine):**
   * Posibilidad de ejecutar pruebas locales completas sin depender de conexión a internet ni incurrir en costes de inferencia remota, utilizando el `StubModelGateway`.

---

## 2. Requisitos de Conformidad para Aplicaciones

Toda aplicación construida para integrarse con la plataforma debe cumplir con:
* **Aislamiento de Dominio:** No importar archivos de `src/domain/` directamente; interactuar únicamente vía HTTP REST o Platform SDK.
* **Manejo de Tenant:** Enviar siempre el encabezado `x-tenant-id` para garantizar el particionado multi-inquilino.
* **Respeto a Códigos de Error:** Interpretar y reaccionar ordenadamente ante los códigos de error canónicos definidos en el contrato de errores de la plataforma.
