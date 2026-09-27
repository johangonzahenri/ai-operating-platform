# Arquitectura Técnica — Segmentación Multicapa y Deformación Geométrica de Prendas (Fase 155)

> **Iniciativa**: `AOP-TENTACIONES-AR-3D-AI`  
> **Producto**: `PROJ-01 — Tentaciones AI Commerce`  
> **Fase**: 155 — `Neural Garment Warping & Multi-Layer Cloth Segmentation Pipeline`  
> **Estado Técnico**: `DONE` | **Estado Operativo**: `DONE`  
> **Autoridad**: AI Operating Platform Core Architecture Team  
> **Fecha**: 2026-09-26  

---

## 1. Resumen Ejecutivo y Declaración de Capacidad

La **Fase 155** establece la fundación determinista y neutral para la segmentación de silueta corporal, extracción de máscaras de prendas, mapeo de oclusiones y campos continuos de deformación 2D (*Warp Field*), coordinados en un pipeline multicapa para **PROJ-01 Tentaciones AI Commerce**.

### Declaración de Estado de Capacidad
- **IMPLEMENTED / DETERMINISTIC BASELINE**: Contratos de segmentación, validación de máscaras, proveedor determinista sintético, campo de deformación 2D con muestreo bilineal, motor de deformación con degradación controlada y compositor estructural multicapa.
- **PROVIDER READY**: Puertos hexagonales listos para integrar adaptadores neurales externos (`SegmentationProviderPort`).
- **PLANNED / NOT IN CORE**: Inferencia neural con pesos de modelo pesado (ONNX/TFLite/FASHN) y simulación física de telas 3D compleja (quedan en la capa de adaptadores periféricos o satélites).

```text
[ PreparedVirtualTryOnInput (Fase 154) ]
                   ↓
    [ SegmentationProviderPort ]
        ├── Person Body Mask
        ├── Garment Mask
        └── Occlusion Map (GARMENT_VISIBLE / BODY_OCCLUDING)
                   ↓
    [ GarmentWarpEngine (WarpField2D) ]
        └── Affine + Continuous Displacements (dx, dy)
                   ↓
    [ MultiLayerCompositor ]
        └── Z-Order: BACKGROUND (0) -> BODY (10) -> GARMENT (20)
                   ↓
    [ PreparedVtoRenderInput & Artifacts ]
```

---

## 2. Auditoría y Continuidad desde la Fase 154

1. **Reutilización de Contratos**: Se reutilizan `GarmentAlignmentResult`, `AffineTransform2D`, `PoseFrame` y `CanonicalLandmarkIndex` sin crear duplicaciones ni taxonomías divergentes.
2. **Evolución Geométrica**: La alineación afín 2D de la Fase 154 se extiende a un campo de deformación continuo (`WarpField2D`) con cuadrículas de control y muestreo bilineal, sin presentarlo falsamente como simulación física 3D de telas.
3. **Invariante `UNKNOWN ≠ ZERO`**: Zonas ocluidas o con baja visibilidad se preservan como `UNKNOWN` o `LOW_CONFIDENCE`, previniendo la inyección de ceros o máscaras falsas.

---

## 3. Modelo de Dominio de Segmentación y Oclusiones (`segmentation-types.ts`)

- **Taxonomía de Capas**: `BACKGROUND`, `BODY`, `GARMENT`, `GARMENT_OVERLAY`, `ACCESSORY`, `OCCLUSION`.
- **Estados de Visibilidad**: `VISIBLE`, `OCCLUDED`, `TRANSPARENT_OR_UNKNOWN`, `NOT_PRESENT`.
- **Clases de Segmentación**: `PERSON`, `GARMENT`, `BACKGROUND`, `OCCLUSION`, `UNKNOWN`.
- **Formatos de Máscara**: `SOFT_PROBABILITY_MAP` ($0.0 \le p \le 1.0$), `BINARY_MAP` ($0 \lor 1$), `INDEXED_LABELS` ($0, 1, 2, \dots$).
- **Validación Falso-Cerrado (`validateSegmentationMask`)**:
  - Verifica dimensiones enteras estrictamente positivas.
  - Verifica longitud del arreglo ($W \times H$).
  - Rechaza `NaN`, $\pm\infty$ y probabilidades fuera de $[0.0, 1.0]$.
  - Separa formalmente la **confianza global del proveedor** ($0..1$) de la **probabilidad espacial de píxel** ($0..1$).

---

## 4. Puerto de Proveedor y Simulación Determinista (`segmentation-provider.ts`)

- **Puerto Hexagonal (`SegmentationProviderPort`)**:
  - `checkHealth()`: Consulta el estado del motor (`HEALTHY`, `DEGRADED`, `UNAVAILABLE`).
  - `segment(request)`: Ejecuta la segmentación y retorna máscaras y mapa de oclusión.
  - `capabilities`: Descubrimiento explícito (`SEGMENTATION`, `SOFT_MASK`, `HARD_MASK`, `GARMENT_WARP`, `OCCLUSION`, `MULTI_LAYER`).
- **Proveedor Determinista Sintético (`DeterministicFakeSegmentationProvider`)**:
  - Genera siluetas anatómicas y máscaras de prendas sintéticas deterministas.
  - Soporta inyección de fallos controlados, latencia simulada y modulación de confianza para pruebas automatizadas sin dependencias de red o GPU.

---

## 5. Campo de Deformación 2D e Interpolación Bilineal (`warp-field.ts`)

- **Estructura `WarpField2D`**:
  - Cuadrícula regular de puntos de control ($N \times M$).
  - Arreglos normalizados de desplazamiento $\Delta x$ y $\Delta y$.
  - Clasificación de tipo: `IDENTITY`, `TRANSLATION`, `SCALE`, `ROTATION`, `AFFINE`, `LOCALIZED_DEFORMATION`.
- **Muestreo Bilineal (`sampleWarpField`)**:
  - Interpola continuamente los desplazamientos para cualquier coordenada normalizada $(u, v) \in [0.0, 1.0]$.
  - Falla de forma segura (`isValid: false`) ante coordenadas no finitas o fuera de límites.

---

## 6. Motor de Deformación de Prendas y Degradación Segura (`garment-warping.ts`)

- **Coordinación de Calidad**:
  - `WARP_VALID`: Alineación afín y datos de soporte consistentes.
  - `WARP_DEGRADED`: Calidad de alineación clasificada como `MISALIGNED` o con baja confianza; activa fallback con estado explícito `DEGRADED` (sin falsos positivos).
  - `INSUFFICIENT_DATA`: Datos de anclaje ausentes; genera fallback a identidad y estado `FAILED`.

---

## 7. Compositor Estructural Multicapa (`layer-composition.ts`)

- **Jerarquía Canónica de Profundidad (Z-Index)**:
  1. `BACKGROUND` (Z: 0)
  2. `BODY` (Z: 10)
  3. `GARMENT` (Z: 20)
  4. `GARMENT_OVERLAY` (Z: 30)
  5. `ACCESSORY` (Z: 40)
  6. `OCCLUSION` (Z: 50)
- **Resolución de Oclusiones**: Si el ratio de oclusión corporal sobre la prenda supera el 50%, la capa de la prenda se marca como `OCCLUDED` y la composición se clasifica como `COMPOSITION_DEGRADED`.
- **Pureza Render-Agnostic**: Cero dependencias de `CanvasRenderingContext2D`, `WebGL`, `Three.js` o el DOM.

---

## 8. Pipeline Integrado y Artefactos de Dominio (`cloth-warping-pipeline.ts`)

- **Salida Estandarizada (`PreparedVtoRenderInput`)**:
  - Integra la pose preprocesada de Fase 154 con las máscaras, el mapa de oclusión, el campo de deformación y las capas ordenadas.
  - Emite artefactos estandarizados en el modelo canónico de Fase 153: `BODY_MASK`, `GARMENT_MASK`, `OCCLUSION_MAP`, `WARP_FIELD`.

---

## 9. Matriz de Cobertura de Pruebas Automatizadas

Suite dedicada: `tests/unit/vto-garment-warping.test.ts` (18 tests PASS):

| Módulo Evaluado | Casos Verificados | Resultado |
| :--- | :--- | :---: |
| **1. Segmentation Mask Model** | Validación soft probability, binary map, indexed labels, rechazo de NaN/Infinity, control dimensional. | `PASS` |
| **2. Fake Segmentation Provider** | Generación sintética, degradación por baja confianza, fallos controlados, verificación de salud. | `PASS` |
| **3. 2D Warp Field & Sampling** | Identidad, traslación, rotación 90°, muestreo bilineal sub-grid continuo. | `PASS` |
| **4. Garment Warp Engine** | Cálculo de campo afín, degradación controlada (`WARP_DEGRADED`), fail-safe ante `INSUFFICIENT_DATA`. | `PASS` |
| **5. Layer Composition & Occlusion** | Z-ordering canónico, resolución de oclusión corporal sobre prenda, capas transparentes. | `PASS` |
| **6. Golden Journey E2E** | Flujo completo: Pose cruda $\to$ Normalización $\to$ Segmentación $\to$ Warp $\to$ Composición $\to$ Artefactos. | `PASS` |

**Total Suite de Plataforma**: **1910 tests PASS**, 147 suites, 0 fallos.
