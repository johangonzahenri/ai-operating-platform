# Proyecto 06: Aplicaciones Satélites del Ecosistema
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-06-APPS`
* **Área de Responsabilidad:** Integración de Aplicaciones de Negocio, Fábrica de Apps y Probador Virtual AR
* **Ubicación en Repositorio:** `src/application/platform/`, `examples/`
* **Línea Base de Pruebas:** 138 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Desacoplamiento Hexagonal Absoluto:** Las aplicaciones de negocio consumen la plataforma estrictamente a través de adaptadores (`TentacionesPlatformAdapter`, `VehiclePartsPlatformAdapter`) o llamadas HTTP REST contra `/api/v1/*`. No existen importaciones directas de dominios de comercio dentro del Core Engine (ADR 0006, ADR-007).
2. **Tentaciones AI Commerce:** Aplicación insignia de moda y calzado con descubrimiento en lenguaje natural español, motor de recomendaciones y Probador Virtual 3D / Realidad Aumentada con perfiles de avatar (ADR-008, ADR-009).
3. **Vehicle Parts Platform:** Aplicación de referencia industrial automotriz con verificación determinista de compatibilidad mecánica de repuestos por marca, modelo, año y motorización.
4. **Fábrica de Aplicaciones (Application Factory 2.0):** Registro declarativo y validación de manifiestos `app-manifest.json` con verificación de esquemas y asignación de API keys con scoping específico.
5. **Degradación Elegante (Fallback):** Si la plataforma central entra en mantenimiento, los adaptadores de comercio conmutan automáticamente a catálogos locales y stubs deterministas sin interrumpir la navegación del usuario.

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fase 50: Integración Tentaciones AI Commerce (v1.0)                             │
│ • Búsqueda semántica de calzado, cálculo de carrito e integridad pre-mutación.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 51: Probador Virtual 3D / AR con Perfiles de Avatar (v1.0)                 │
│ • Resolución de modelos GLB, cálculo de talla estandarizada y simulación WebXR.        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 53: Vehicle Parts Reference App & Compatibilidad Determinista (v1.1)      │
│ • Motor de compatibilidad automotriz y comparador técnico de repuestos OEM.            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 54: Application Factory 2.0 & Validación de Manifiestos (v1.1)             │
│ • Interfaz en consola para registro seguro y validación de contratos de aplicaciones.  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
