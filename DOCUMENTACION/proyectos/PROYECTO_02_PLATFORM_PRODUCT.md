# Proyecto 02: Platform Gateway & Control Plane Web
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-02-PLATFORM`
* **Área de Responsabilidad:** API Gateway REST, Plano de Control SPA, SDK Cliente y Observabilidad Forense
* **Ubicación en Repositorio:** `src/platform/`, `src/platform-client/`
* **Línea Base de Pruebas:** 209 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Zero Runtime Dependencies:** Servidor HTTP nativo en `node:http` con cero librerías externas (sin Express, Koa o Fastify) que procesa solicitudes con límite de payload estricto de 1MB (HTTP 413) y normalización de identidades.
2. **Inmunidad XSS en Front-End:** El Control Plane Web es una Single-Page Application (SPA) en Vanilla JavaScript puro que tiene **terminantemente prohibido el uso de `innerHTML`**, `outerHTML`, `document.write` o `eval`. Cada elemento visual se genera con llamadas seguras del DOM.
3. **Convergencia en `/api/v1/*`:** El prefijo canónico de producción es estrictamente `/api/v1/*`. El alias `/api/platform/v1/*` emite cabeceras de obsolescencia RFC 8594 (`Deprecation`, `Sunset`, `Link`) antes de su remoción final (ADR-100-05).
4. **Almacén Append-Only de Eventos:** `SqliteEventStore` persiste cada evento de dominio de manera atómica con números de secuencia estrictamente crecientes para permitir auditoría forense y reconstrucción CQRS de líneas de tiempo por `traceId` (ADR 0021, ADR 0022).
5. **Experiencia Bilingüe:** Interfaz conmutativa instantánea entre Español Latinoamericano (`es-419`) e Inglés (`en`).

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fase 7, 21: Servidor HTTP y Enrutador Canónico (v0.7, v1.0)                     │
│ • Enrutamiento nativo en `src/platform/api/http-router.ts`, compresión y rate limit.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 22: PlatformClient SDK Tipado en TypeScript (v1.0)                         │
│ • Cliente oficial en `src/platform-client/` con manejo de errores y reintentos.        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 23, 54: Consola Web SPA Bilingüe con 0 innerHTML (v1.1)                    │
│ • Vistas interactivas de Telemetría, Tenants, Tareas, Eventos y Dispositivos.          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 55: Convergencia de Rutas RFC 8594 (v1.2)                                  │
│ • Redirección transparente y cabeceras deprecation en `/api/platform/v1/*`.            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
