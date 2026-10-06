# Registro Oficial de Auditorías de Calidad y Gobernanza

## 1. Inventario Canónico de Controles de Auditoría

Este documento es el **Registro Histórico Central** de todas las auditorías formales ejecutadas en la **AI Operating Platform**, de acuerdo con el marco metodológico definido en [`docs/GOBERNANZA_DE_CALIDAD_Y_AUDITORIAS.md`](./GOBERNANZA_DE_CALIDAD_Y_AUDITORIAS.md).

---

## 2. Tabla Maestra de Auditorías

| ID de Control | Tipo de Auditoría | Hito / Momento de Ejecución | Alcance | Estado Oficial | Informe Canónico | Fecha de Cierre |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-SISTEMA-001** | Integral del Sistema | Cierre de Fases 153–156 & Endurecimiento de Gobernanza (Prompt 157) | Plataforma completa (Core Engine, HTTP Gateway, Seguridad Estática/Runtime, Multi-Tenant, Persistencia SQLite WAL, SSE Replay & Isolation, Workflows DAG, MCP Server, PROJ-01 VTO, PROJ-02 Spare Parts) | `APROBADA` | [`docs/AUDITORIA_SISTEMA_001.md`](./AUDITORIA_SISTEMA_001.md) / [`Manifest JSON`](./integration-evidence/aud-sistema-001-manifest.json) | 2026-09-30 |
| **AUD-FASE-001** | Estabilización de Fase | Cierre y Estabilización Fases 157–159 (Inferencia WebGPU, WebWorker Off-Main-Thread, Adquisición de Frames y OffscreenCanvas) | Pipeline VTO On-Device (Fase 157 Inferencia On-Device, Fase 158 WebWorker Offload, Fase 159 Video/Camera Pipeline & OffscreenCanvas, dependencias Fases 153-156) | `APROBADA CON DEUDA TÉCNICA` | [`docs/AUDITORIA_FASE_001.md`](./AUDITORIA_FASE_001.md) / [`Manifest JSON`](./integration-evidence/aud-fase-001-manifest.json) | 2026-10-01 |
| **AUD-FASE-002** | Estabilización de Fase | Cierre y Estabilización Fases 160–162 (Loop Continuo CV, Viewport Boundary y Render 3D Three.js Satélite) | Pipeline Visual en Tiempo Real (Fase 160 Bucle Continuo, Fase 161 Render Boundary y Viewport, Fase 162 Browser Runtime y Three.js Satélite) | `APROBADA` | [`docs/AUDITORIA_FASE_002.md`](./AUDITORIA_FASE_002.md) / [`Manifest JSON`](./integration-evidence/aud-fase-002-manifest.json) | 2026-10-05 |
| **AUD-FASE-003** | Estabilización de Fase | Cierre y Estabilización Fases 163–165 (Certificación MVP VTO, Pasarela HTTP perimétrica y Formalización de Flotas PROJ-03) | VTO Gateway Hardening (Fase 163 MVP Cert, Fase 164 Gateway, Fase 165 PROJ-03 Fleet Formalization & Pureza Core Engine) | `APROBADA CON DEUDA TÉCNICA` | [`docs/AUDITORIA_FASE_003.md`](./AUDITORIA_FASE_003.md) / [`Manifest JSON`](./integration-evidence/aud-fase-003-manifest.json) | 2026-10-06 |

---

## 3. Registro de Hallazgos Transversales

| ID de Hallazgo | Control Origen | Severidad | Descripción Resumida | Componente Afectado | Estado | Resolución / Acción |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **HAL-001** | `AUD-SISTEMA-001` | `BAJO` | Ajuste de importación determinista y campo de contexto en test E2E | `tests/e2e/aud-sistema-001.test.ts` | `RESUELTO` | Inclusión explícita de `order` en DAG y `correlationId` en contexto de seguridad |
| **HAL-002** | `AUD-SISTEMA-001` | `BAJO` | Documento canónico de auditoría no enlazado previamente | `docs/REGISTRO_DE_AUDITORIAS.md` | `RESUELTO` | Formalización y enlace canónico de `docs/AUDITORIA_SISTEMA_001.md` |
| **HAL-003** | `AUD-FASE-001` | `BAJO` (`EVIDENCE_OVERCLAIM`) | Mención narrativa en entrega de Fase 159 de soporte para Thin-Plate Splines (TPS) | `src/domain/vto/warp-field.ts` / Documentación | `RESUELTO` | Reconciliado canónicamente; el codebase implementa rejilla de deformación continua 2D (`WarpField2D`) con muestreo bilineal, no TPS. Sobre-afirmación eliminada |
| **HAL-004** | `AUD-FASE-001` | `BAJO` (`EVIDENCE_OVERCLAIM`) | Cifra de latencia de "≈ 9.2 ms" reportada como hecho demostrado en entrega narrativa | `docs/` / Reportes narrativos | `RESUELTO` | Reconciliado y reclasificado como dato observacional de corrida única en Node.js runner. Se ratifica invariante `Browser runtime: ENVIRONMENT PENDING` y objetivo de diseño `< 16.6 ms` |
| **HAL-005** | `AUD-FASE-001` | `MEDIO` (`TECHNICAL_DEBT`) | Ausencia de bucle continuo en tiempo real que sincronice automáticamente la llegada de frames con la deformación y composición espacial sin avance manual | Pipeline VTO (Fases 154-159) | `RESUELTO` | Resuelto en Fase 160 (`ContinuousProcessingCoordinator`, `TemporalSynchronizer`, `SpatialWarpingCompositor`). Auditado y verificado formalmente en `AUD-02.1` de `AUD-FASE-002` |
| **HAL-006** | `AUD-FASE-001` | `INFO` (`ENVIRONMENT_GAP`) | Ausencia de GPU física y dispositivo de cámara real en entorno headless Node.js/CI | `src/application/vto/` (WebGPU / Video Capture) | `MONITOREADO` | Mitigado con dobles de prueba tipados (`SimulatedWebGpuContext`, `SimulatedFrameSource`, `SimulatedWebWorker`) y fallback a CPU de alta precisión. Estado formal: `ENVIRONMENT PENDING` |
| **HAL-007** | `AUD-FASE-002` | `INFO` (`ENVIRONMENT_GAP`) | Ausencia física de aceleración por GPU (WebGL2/WebGPU) y cámara óptica real en entorno headless Node.js/CI | Adaptadores de renderizado y captura de navegador | `MONITOREADO` | Clasificado honestamente como `ENVIRONMENT PENDING` en arnés de inspección; mitigado con shims Three.js deterministas sin sobre-afirmación |
| **HAL-008** | `AUD-FASE-003` | `BAJO` (`TECHNICAL_DEBT`) | Discrepancia del conteo canónico de pruebas documentadas (2130 vs 2073) por estancamiento de constante estática tras hito de internacionalización de Fase 161 | `scripts/docs-check.mjs`, Documentación | `RESUELTO` | Actualizado CANONICAL_TEST_COUNT a 2138 y sincronizada toda la documentación oficial (README.md, LIBRO_OFICIAL, TEST_REGISTRY.md) |
| **HAL-009** | `AUD-FASE-003` | `BAJO` (`EVIDENCE_OVERCLAIM`) | Ambigüedad en la clasificación de evidencia SSE: endpoint VTO publica al bus interno, pero el stream HTTP vivo (/api/v1/events/stream) y replay con Last-Event-ID dependen de infraestructura de plataforma transversal | `docs/TENTACIONES_PLATFORM_INTEGRATION.md` | `DOCUMENTADO` | Clasificado honestamente como VERIFICADO EN PUBLICACIÓN / PARCIALMENTE VERIFICADO EN CONEXIÓN HTTP VTO DEDICADA |

---

## 4. Próximas Auditorías Planificadas (Previsiones de Gobierno)

> **Nota Metodológica**: Las auditorías futuras se activan por disparadores de madurez o cadencia de fases funcionales. No constituyen fases funcionales ni alteran la numeración secuencial del `MASTER_WORK_PLAN.md`.

- **`AUD-SISTEMA-002`**: Auditoría Integral del Sistema programada previa al hito de madurez de runtime distribuido y expansión multi-aplicación.
- **`AUD-LIBERACION-001`**: Auditoría de Liberación formal previa al empaquetado del primer Release Público / MVP de producción.
