# Registro Oficial de Auditorías de Calidad y Gobernanza

## 1. Inventario Canónico de Controles de Auditoría

Este documento es el **Registro Histórico Central** de todas las auditorías formales ejecutadas en la **AI Operating Platform**, de acuerdo con el marco metodológico definido en [`docs/GOBERNANZA_DE_CALIDAD_Y_AUDITORIAS.md`](./GOBERNANZA_DE_CALIDAD_Y_AUDITORIAS.md).

---

## 2. Tabla Maestra de Auditorías

| ID de Control | Tipo de Auditoría | Hito / Momento de Ejecución | Alcance | Estado Oficial | Informe Canónico | Fecha de Cierre |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-SISTEMA-001** | Integral del Sistema | Cierre de Fases 153–156 & Endurecimiento de Gobernanza (Prompt 157) | Plataforma completa (Core Engine, HTTP Gateway, Seguridad Estática/Runtime, Multi-Tenant, Persistencia SQLite WAL, SSE Replay & Isolation, Workflows DAG, MCP Server, PROJ-01 VTO, PROJ-02 Spare Parts) | `APROBADA` | [`docs/AUDITORIA_SISTEMA_001.md`](./AUDITORIA_SISTEMA_001.md) / [`Manifest JSON`](./integration-evidence/aud-sistema-001-manifest.json) | 2026-09-30 |
| **AUD-FASE-001** | Estabilización de Fase | Cierre y Estabilización Fases 157–159 (Inferencia WebGPU, WebWorker Off-Main-Thread, Adquisición de Frames y OffscreenCanvas) | Pipeline VTO On-Device (Fase 157 Inferencia On-Device, Fase 158 WebWorker Offload, Fase 159 Video/Camera Pipeline & OffscreenCanvas, dependencias Fases 153-156) | `APROBADA CON DEUDA TÉCNICA` | [`docs/AUDITORIA_FASE_001.md`](./AUDITORIA_FASE_001.md) / [`Manifest JSON`](./integration-evidence/aud-fase-001-manifest.json) | 2026-10-01 |

---

## 3. Registro de Hallazgos Transversales

| ID de Hallazgo | Control Origen | Severidad | Descripción Resumida | Componente Afectado | Estado | Resolución / Acción |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **HAL-001** | `AUD-SISTEMA-001` | `BAJO` | Ajuste de importación determinista y campo de contexto en test E2E | `tests/e2e/aud-sistema-001.test.ts` | `RESUELTO` | Inclusión explícita de `order` en DAG y `correlationId` en contexto de seguridad |
| **HAL-002** | `AUD-SISTEMA-001` | `BAJO` | Documento canónico de auditoría no enlazado previamente | `docs/REGISTRO_DE_AUDITORIAS.md` | `RESUELTO` | Formalización y enlace canónico de `docs/AUDITORIA_SISTEMA_001.md` |
| **HAL-003** | `AUD-FASE-001` | `BAJO` (`EVIDENCE_OVERCLAIM`) | Mención narrativa en entrega de Fase 159 de soporte para Thin-Plate Splines (TPS) | `src/domain/vto/warp-field.ts` / Documentación | `RESUELTO` | Reconciliado canónicamente; el codebase implementa rejilla de deformación continua 2D (`WarpField2D`) con muestreo bilineal, no TPS. Sobre-afirmación eliminada |
| **HAL-004** | `AUD-FASE-001` | `BAJO` (`EVIDENCE_OVERCLAIM`) | Cifra de latencia de "≈ 9.2 ms" reportada como hecho demostrado en entrega narrativa | `docs/` / Reportes narrativos | `RESUELTO` | Reconciliado y reclasificado como dato observacional de corrida única en Node.js runner. Se ratifica invariante `Browser runtime: ENVIRONMENT PENDING` y objetivo de diseño `< 16.6 ms` |
| **HAL-005** | `AUD-FASE-001` | `MEDIO` (`TECHNICAL_DEBT`) | Ausencia de bucle continuo en tiempo real que sincronice automáticamente la llegada de frames con la deformación y composición espacial sin avance manual | Pipeline VTO (Fases 154-159) | `ABIERTO` | Formalizado como alcance central mandatorio para la Fase funcional 160 (`Real-Time Computer Vision Continuous Processing Loop, Frame Temporal Synchronization & Spatial Warping Compositor`) |
| **HAL-006** | `AUD-FASE-001` | `INFO` (`ENVIRONMENT_GAP`) | Ausencia de GPU física y dispositivo de cámara real en entorno headless Node.js/CI | `src/application/vto/` (WebGPU / Video Capture) | `MONITOREADO` | Mitigado con dobles de prueba tipados (`SimulatedWebGpuContext`, `SimulatedFrameSource`, `SimulatedWebWorker`) y fallback a CPU de alta precisión. Estado formal: `ENVIRONMENT PENDING` |

---

## 4. Próximas Auditorías Planificadas (Previsiones de Gobierno)

> **Nota Metodológica**: Las auditorías futuras se activan por disparadores de madurez o cadencia de fases funcionales. No constituyen fases funcionales ni alteran la numeración secuencial del `MASTER_WORK_PLAN.md`.

- **`AUD-FASE-002`**: Auditoría de Fase programada tras el bloque de Fases 160–162 de PROJ-01 Tentaciones AI Commerce (Compositor continuo, Render 3D Three.js e Integración UI).
- **`AUD-SISTEMA-002`**: Auditoría Integral del Sistema programada previa al hito de madurez de runtime distribuido y expansión multi-aplicación.
- **`AUD-LIBERACION-001`**: Auditoría de Liberación formal previa al empaquetado del primer Release Público / MVP de producción.
