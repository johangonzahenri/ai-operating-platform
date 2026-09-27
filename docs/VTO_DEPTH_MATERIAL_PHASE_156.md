# AI Operating Platform — Fase 156: Dynamic Depth Occlusion & Material Appearance Pipeline

## 1. Resumen Ejecutivo y Metadatos de la Fase

- **Fase**: 156
- **Producto / Satélite**: `PROJ-01: Tentaciones AI Commerce`
- **Iniciativa**: `AOP-TENTACIONES-AR-3D-AI`
- **Dominio**: Visión Computacional, Estimación de Profundidad Monocular, Oclusión Dinámica y Modelado de Materiales
- **Estado Técnico**: `DONE`
- **Estado Operativo**: `DONE`
- **Fecha**: 2026-09-27
- **Suites de Prueba**: 154 suites (`tests/unit/vto-depth-material.test.ts` con 17 pruebas dedicadas)
- **Tests Totales Plataforma**: 1927/1927 PASS (0 FAIL)

---

## 2. Contexto Arquitectónico e Invariantes

La Fase 156 extiende la arquitectura de Virtual Try-On (VTO) incorporando profundidad relativa monocular, resolución de oclusión anatómica dinámica (e.g. brazos cruzados sobre la prenda) y perfiles materiales con trazabilidad de procedencia:

```text
[Pose / Landmarks 2D/3D (Fase 154)]
                ↓
[Segmentación de Siluetas y Prendas (Fase 155)]
                ↓
[Warping Geométrico 2D / Bilineal (Fase 155)]
                ↓
[Estimación de Profundidad Relativa / Monocular (Fase 156)]
                ↓
[Resolución de Oclusión Dinámica con Histéresis Temporal (Fase 156)]
                ↓
[Perfil de Material y Pistas de Apariencia Óptica (Fase 156)]
                ↓
[Composición Multicapa Guiada por Profundidad (Fase 156)]
                ↓
[DepthMaterialRenderInput & Artefactos Canónicos]
```

### Invariantes Canónicos de la Fase 156:
1. **Invariante de Profundidad**: `UNKNOWN_DEPTH ≠ ZERO` y `UNKNOWN_DEPTH ≠ FAR`. Un valor de profundidad no conocido o degradado no debe forzarse a plano cercano o lejano para evitar artefactos de clipping erróneos.
2. **Invariante de Oclusión Dinámica**: `UNKNOWN_OCCLUSION ≠ VISIBLE` y `UNKNOWN_OCCLUSION ≠ OCCLUDED`. Se aplica fallback determinista y seguro a orden Z semántico estático cuando el mapa de oclusión es incierto.
3. **Invariante de Materiales**: `UNKNOWN_MATERIAL ≠ DEFAULT`. La procedencia del material (`CATALOG_PROVIDED`, `USER_PROVIDED`, `INFERRED`, `DEFAULT`, `UNKNOWN`) debe ser explícita y transparente.
4. **Hexagonal & On-Device Pureza**: El Core Engine permanece libre de frameworks de renderizado pesado (Three.js, WebGL/WebXR, shaders GLSL en runtime) y dependencias de modelos binarios de redes neuronales (MiDaS/Depth Anything).

---

## 3. Módulos Implementados

### 3.1. Modelado de Profundidad Relativa (`src/domain/vto/depth-types.ts`)
- `DepthType`: `RELATIVE_DEPTH`, `METRIC_DEPTH`, `DISPARITY_MAP`, `NORMALIZED_DEPTH`, `UNKNOWN_DEPTH`.
- `DepthFormat`: `FLOAT32`, `UINT16_MM`, `UINT8_NORMALIZED`.
- `DepthMap`: Estructura inmutable con dimensiones, array numérico, mapa de confianza por píxel, rango de profundidad y checksum SHA-256.
- `validateDepthMap`: Validador fail-closed que detecta NaNs, infinitos, dimensiones inconsistentes y calcula métricas min/max/mean.

### 3.2. Puerto Hexagonal y Fake Determinista (`src/domain/vto/depth-provider.ts`)
- `DepthProviderPort`: Interfaz desacoplada con capacidades explícitas (`RELATIVE_DEPTH_ESTIMATION`, `METRIC_DEPTH_ESTIMATION`, `CONFIDENCE_MAP`, `DEPTH_OCCLUSION`) y comprobación de salud (`checkHealth`).
- `DeterministicFakeDepthProvider`: Generador sintético de mapas de profundidad aislados para escenarios (`BODY_CENTERED`, `GARMENT_FOREGROUND`, `CROSSING_OCCLUSION`, `LINEAR_GRADIENT`, `FLAT`) con soporte de latencia simulada y degradación fail-closed.

### 3.3. Oclusión Dinámica con Histéresis Temporal (`src/domain/vto/dynamic-occlusion.ts`)
- Comparación de profundidad cámara-relativa: $\Delta z = z_{garment} - z_{body}$.
  - $\Delta z < -\epsilon \implies$ `GARMENT_IN_FRONT` (prenda por encima del cuerpo).
  - $\Delta z > +\epsilon \implies$ `GARMENT_BEHIND` (cuerpo u oclusor anatómico por delante de la prenda).
  - $|\Delta z| \le \epsilon \implies$ `SAME_DEPTH` (superficies coplanares).
- Histéresis temporal de doble umbral (`enterOcclusionThreshold` / `exitOcclusionThreshold`) para evitar parpadeo o flickering en bordes.

### 3.4. Perfiles de Material y Pistas de Apariencia (`src/domain/vto/material-types.ts`)
- `GarmentMaterialProfile`: Categorías de superficie (`COTTON`, `SILK`, `LEATHER`, `DENIM`, `WOOL`, `SYNTHETIC`, `SHEER`, `METALLIC`, `UNKNOWN`), parámetros físicos (rugosidad, metallicidad, nivel especular, opacidad) y nivel de confianza.
- `MaterialAppearanceHints`: Pistas de renderizado neutrales a la iluminación (clasificación, transparencia, escala de normales, sheen, reactividad a la luz).
- `DeterministicMaterialProvider`: Resolución taxonómica determinista a partir de referencias y etiquetas de catálogo.

### 3.5. Compositor Multicapa Guiado por Profundidad (`src/domain/vto/depth-aware-compositor.ts`)
- `DepthAwareCompositor`: Reordenamiento dinámico de capas cuando la oclusión física supera los umbrales configurados, con degradación controlada y fallback a orden semántico estático.

### 3.6. Pipeline Coordinador de Profundidad y Material (`src/domain/vto/depth-material-pipeline.ts`)
- `DepthMaterialPipeline`: Coordinador integral que toma el `PreparedVirtualTryOnInput` (Fase 154), segmenta (Fase 155), deforma la prenda (Fase 155), estima profundidad, resuelve oclusión dinámica, enriquece con perfiles de materiales y produce `DepthMaterialRenderInput` con artefactos canónicos (`DEPTH_MAP`, `DYNAMIC_OCCLUSION_MAP`, `MATERIAL_PROFILE`, `DEPTH_AWARE_COMPOSITION`).

---

## 4. Evidencia de Verificación y Pruebas

- **Suite Dedicada**: `tests/unit/vto-depth-material.test.ts`
  - Pruebas 1.1–1.4: Validación y fail-closed del modelo de profundidad relativa.
  - Pruebas 2.1–2.2: Generación sintética y manejo de fallos del proveedor de profundidad.
  - Pruebas 3.1–3.4: Clasificación geométrica de oclusión (`GARMENT_IN_FRONT`, `GARMENT_BEHIND`, `SAME_DEPTH`) e histéresis temporal.
  - Pruebas 4.1–4.4: Validación de perfiles de materiales y derivación de pistas de apariencia óptica.
  - Pruebas 5.1–5.2: Composición multicapa guiada por profundidad y fallback seguro a orden Z estático.
  - Prueba 6.1: Golden Journey integral end-to-end de pipeline de renderizado y producción de artefactos.
- **Resultado Global**: 1927 pruebas pasando en 154 suites sin fallos.
