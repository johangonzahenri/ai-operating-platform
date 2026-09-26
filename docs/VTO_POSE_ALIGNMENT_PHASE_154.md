# Arquitectura Técnica — Preprocesamiento de Visión Computacional y Alineación Pose/Prenda (Fase 154)

> **Iniciativa**: `AOP-TENTACIONES-AR-3D-AI`  
> **Producto**: `PROJ-01 — Tentaciones AI Commerce`  
> **Fase**: 154 — `On-Device Computer Vision Preprocessing & Pose/Garment Alignment Pipeline`  
> **Estado Técnico**: `DONE` | **Estado Operativo**: `DONE`  
> **Autoridad**: AI Operating Platform Core Architecture Team  
> **Fecha**: 2026-09-26  

---

## 1. Resumen Ejecutivo y Misión Arquitectónica

La **Fase 154** implementa el motor determinista de visión computacional y geometría espacial para la preparación y normalización de poses corporales y la alineación matemática de prendas de vestir, habilitando la experiencia de Spatial Commerce y Virtual Try-On en **PROJ-01 Tentaciones AI Commerce**.

Siguiendo los principios de la Arquitectura Hexagonal y la política *Zero Third-Party in Core Engine*, toda la lógica matemática y geométrica se implementa como algoritmos puros en TypeScript, desacoplados de frameworks gráficos (Three.js, WebXR, Babylon.js) y librerías de inferencia específicas de cliente (MediaPipe, ONNX, TFLite).

```text
[ Raw Pose Input (Pixels) ]
            ↓
[ Coordinate Normalization & Validation ]  →  NORMALIZED_3D [0..1] (UNKNOWN ≠ 0)
            ↓
[ One-Euro Temporal Filter ]              →  Adaptive Low-Pass Smoothing
            ↓
[ Anthropometric Ratio Calculation ]       →  Relative Body Ratios & Provenance
            ↓
[ Garment Anchor & Affine Alignment ]     →  2D Affine Matrix [a, b, c, d, tx, ty]
            ↓
[ PreparedVirtualTryOnInput Assembly ]    →  Ready for VTO Pipeline Inference
```

---

## 2. Componentes y Módulos Implementados

### 2.1. Normalización de Coordenadas y Validación de Landmarks (`pose-types.ts`)
- **Topología Canónica**: Índices canónicos estándar de 33 landmarks corporales (`CanonicalLandmarkIndex`): puntos faciales, hombros, codos, muñecas, caderas, rodillas, tobillos, talones y pies.
- **Espacios de Coordenadas**: `PIXEL_SPACE`, `NORMALIZED_2D`, `NORMALIZED_3D`.
- **Invariante `UNKNOWN ≠ 0`**: Landmarks con baja visibilidad o confianza inferior al umbral se marcan explícitamente con `visibility: "UNKNOWN" | "LOW_CONFIDENCE"` y `isValid: false`, sin inyectar coordenadas en $(0, 0, 0)$ que falseen la geometría anatómica.
- **Normalización**: Conversión determinista de coordenadas píxel $(X, Y, Z)$ a espacio unitario $[0.0, 1.0]$.

### 2.2. Filtro Temporal Adaptativo One-Euro (`one-euro-filter.ts`)
- **Formulación Matemática**:
  $$\hat{x}_i = \alpha x_i + (1 - \alpha) \hat{x}_{i-1}$$
  $$\alpha = \frac{1}{1 + \frac{\tau}{T_e}} = \frac{1}{1 + \frac{1}{2 \pi f_c T_e}}$$
  $$f_c = f_{c,\min} + \beta |\dot{x}_i|$$
- **Comportamiento Dinámico**:
  - En reposo ($|\dot{x}| \to 0$): $f_c \to f_{c,\min}$ (1.0 Hz), eliminando el temblor (*jitter*) de alta frecuencia.
  - En movimiento rápido ($|\dot{x}| \gg 0$): $f_c$ se incrementa proporcionalmente a la velocidad mediante $\beta$, eliminando el retraso perceptual (*lag*).
- **Manejo de Casos de Borde**: Tolerancia a marcas de tiempo duplicadas ($dt \le 0$), gaps prolongados ($dt > 1.0\,\text{s}$) y valores no finitos (`NaN`, $\pm\infty$).
- **Suavizador Espacial 3D**: `Point3DSmoother` aplica instancias independientes del filtro para los ejes $X$, $Y$ y $Z$.

### 2.3. Motor de Ratios Antropométricos (`anthropometrics.ts`)
- **Cálculo de Proporciones Anatómicas**:
  - `shoulderToHipRatio`: $\frac{\text{Ancho de Hombros}}{\text{Ancho de Caderas}}$
  - `torsoToLegRatio`: $\frac{\text{Longitud de Torso}}{\text{Longitud de Piernas}}$
  - `armSpanRatio`: $\frac{\text{Envergadura de Brazos}}{\text{Estatura Estimada}}$
  - `bodyInclineAngleDeg`: Inclinación lateral de la columna calculada mediante $\arctan2(\Delta x, \Delta y)$ entre el punto medio de hombros y el punto medio de caderas.
- **Rastreo de Procedencia y Calidad**: Cada ratio reporta `isReliable: boolean` y `provenance: "MEASURED" | "ESTIMATED" | "FALLBACK"`. Si faltan puntos clave, se marca `isReliable: false` sin inferir medidas falsas.

### 2.4. Anclaje de Prendas y Alineación Geométrica Afín 2D (`garment-alignment.ts`)
- **Mapeo Categorial de Anclas**:
  - `UPPER_BODY`: Ancla primaria en punto medio de hombros (landmarks 11 y 12); ancla secundaria en punto medio de caderas (landmarks 23 y 24).
  - `LOWER_BODY`: Ancla primaria en punto medio de caderas; ancla secundaria en punto medio de rodillas/tobillos.
  - `DRESS` / `OUTERWEAR`: Ancla primaria en punto medio de hombros; ancla secundaria en caderas/tobillos.
  - `FOOTWEAR`: Ancla primaria en tobillos/talones.
- **Transformación Afín 2D**: Generación de matriz de transformación 2D $[\text{scaleX}, 0, 0, \text{scaleY}, \text{tx}, \text{ty}]$ y rotación $\theta$ para orientar y escalar el bounding box de la prenda sobre la silueta corporal.
- **Puntuación de Calidad de Alineación**: Evalúa la visibilidad combinada de las anclas, penalizando oclusiones o puntos de referencia faltantes (`EXCELLENT`, `ACCEPTABLE`, `POOR`, `INSUFFICIENT_DATA`).

### 2.5. Pipeline Integrado de Preprocesamiento (`pose-preprocessing-pipeline.ts`)
- **Orquestación**: Conecta la normalización, el filtrado One-Euro, el análisis antropométrico y la alineación de la prenda en un flujo secuencial determinista.
- **Salida Estandarizada**: Ensambla el objeto `PreparedVirtualTryOnInput`, listo para ser consumido por el `VirtualTryOnService` y los proveedores de inferencia VTO.

---

## 3. Matriz de Cobertura de Pruebas Automatizadas

La suite `tests/unit/vto-pose-alignment.test.ts` implementa 15 pruebas unitarias y de integración divididas en 5 bloques:

| Bloque de Prueba | Casos Verificados | Resultado |
| :--- | :--- | :---: |
| **1. Coordinate Normalization & Validation** | Normalización $[0..1]$, desnormalización a píxeles, fail-safe ante dimensiones inválidas, validación de confianza y detección de NaN. | `PASS` |
| **2. One-Euro Filter & Smoothing** | Paso inicial sin distorsión, atenuación de jitter estacionario, respuesta rápida ante saltos bruscos, manejo de timestamps desordenados, suavizado 3D multi-eje. | `PASS` |
| **3. Anthropometric Ratio Engine** | Ratios relativos en pose canónica sintética, manejo elegante de puntos ausentes (`UNKNOWN ≠ 0`), cálculo de inclinación del torso. | `PASS` |
| **4. Garment Anchoring & Alignment** | Resolución de anclas primarias/secundarias por categoría, cálculo de transformación afín 2D, detección de datos insuficientes (`INSUFFICIENT_DATA`). | `PASS` |
| **5. E2E Golden Journey Pipeline** | Pipeline completo: Pose cruda $\to$ Normalización $\to$ Suavizado $\to$ Antropometría $\to$ Alineación $\to$ Inferencia VTO exitosa con `DeterministicFakeVtoProvider`. | `PASS` |

**Total Suite de Plataforma**: 1892 tests PASS, 140 suites, 0 fallos.

---

## 4. Invariantes de Seguridad y Gobernanza

1. **Aislamiento Hexagonal**: Ninguna dependencia externa de visión o renderizado 3D en el Core Engine.
2. **Determinismo y Fail-Closed**: Datos faltantes o de baja confianza generan advertencias explícitas y estados `POOR` o `INSUFFICIENT_DATA`, evitando deformaciones visuales o calces erróneos.
3. **Puntualidad Temporal**: El suavizador One-Euro se adapta dinámicamente a la tasa de refresco del cliente ($dt$), garantizando compatibilidad con streams de 30fps, 60fps o timestamps irregulares.
