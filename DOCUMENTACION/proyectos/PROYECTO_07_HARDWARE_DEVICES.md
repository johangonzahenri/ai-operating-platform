# Proyecto 07: Dispositivos Físicos & Spooler de Hardware
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-07-DEVICES`
* **Área de Responsabilidad:** Integración de Periféricos Comerciales, Impresión Local y Cola de Trabajos
* **Ubicación en Repositorio:** `src/infrastructure/device/`
* **Línea Base de Pruebas:** 14 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Desacoplamiento de Periféricos:** Los dispositivos físicos se modelan como entidades declarativas (`BusinessDevice`) que no alteran el estado interno del runtime de IA directamente; solo encolan y consumen trabajos inmutables (`PrintJob`).
2. **Adaptador Brother DCP-1600 Series en `USB001`:** Implementación concreta en `src/infrastructure/device/brother-printer-adapter.ts` para emisión de tickets y recibos comerciales con gestión de copias y formato de documentos.
3. **Persistencia Durable de la Cola de Impresión:** Los trabajos de impresión se registran en SQLite WAL antes de su envío, garantizando que ninguna orden se pierda ante cortes de energía o caídas del proceso local (ADR 0015).
4. **Veracidad Operacional y Reporte Honesto (GAP-07):** La impresora conectada por USB estándar no puede reportar niveles de tóner ni vida útil de componentes sin suites propietarias; la plataforma reporta verídicamente `consumables: UNSUPPORTED` y estado offline cuando no hay respuesta física, prohibiendo mocks engañosos (ADR-010).

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fase 52: Adaptador de Impresora Brother DCP-1600 en USB001 (v1.1)               │
│ • Controlador de impresión comercial, validación de tipos de documento y copias.      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 52: Spooler Durable de Impresión (`PrintJob`) en SQLite (v1.1)             │
│ • Cola de trabajos con estados `PENDING`, `PRINTING`, `COMPLETED`, `FAILED`.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 52: Veracidad de Telemetría y Diagnóstico de Consumibles (v1.1)            │
│ • Inspección en tiempo real del dispositivo en el Control Plane Web.                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
