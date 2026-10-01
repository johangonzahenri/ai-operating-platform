# Arquitectura de Inferencia On-Device y Pipeline WebGPU / Micro-Modelos

## PROJ-01: Tentaciones AI Commerce — Fase 157

```text
================================================================================
AI OPERATING PLATFORM — ARCHITECTURAL SPECIFICATION & SUBSYSTEM REPORT
================================================================================
Fase Funcional:       FASE 157
Iniciativa:           AOP-TENTACIONES-AR-3D-AI
Módulo:               On-Device Neural Inference & Micro-Model Execution Pipeline
Capa de Dominio:      src/domain/vto/ (NeuralTensor, NeuralModel, MicroModel, InferencePort, CpuProvider)
Capa de Aplicación:   src/application/vto/ (WGSL Shaders, WebGpuInferenceProvider, OnDeviceVtoCoordinator)
Principio Rector:     CRECER SIN DEGRADAR & ZERO THIRD-PARTY DEPENDENCIES IN CORE
================================================================================
```

---

## 1. Misión y Límites Arquitectónicos

La **Fase 157** establece la primera infraestructura real de **inferencia neuronal on-device** para la plataforma `AI Operating Platform`, diseñada específicamente para alimentar las necesidades de visión computacional y Virtual Try-On de `PROJ-01: Tentaciones AI Commerce`.

### Invariante Arquitectónico Fundamental:
$$\mathbf{\text{Core Engine / Domain}} \ne \mathbf{\text{WebGPU Runtime}}$$

```text
       src/domain/vto/
    ┌────────────────────────────────────────────────────────┐
    │  - Tensor (shape, rank, Float32Array, fail-closed)     │
    │  - MicroModelManifest (ABI spec, checksum, precision)  │
    │  - OnDeviceInferenceProviderPort                       │
    │  - CpuMicroModelInferenceProvider (Ground Truth)       │
    │  - Canonical VTO Micro-Model (Alignment Quality)       │
    └───────────────────────────┬────────────────────────────┘
                                │ Implements Port
       src/application/vto/     ▼
    ┌────────────────────────────────────────────────────────┐
    │  - WGSL Compute Shaders (Fused Dense + ReLU)           │
    │  - WebGpuInferenceProvider (GPUDevice, Buffers, Queue) │
    │  - OnDeviceVtoInferenceCoordinator (Fallback Router)   │
    │  - SimulatedWebGpuContext (Hardware Test Double)       │
    └───────────────────────────┬────────────────────────────┘
                                │ Consumes Web Standards
                                ▼
                       Browser / Client Runtime
                      (navigator.gpu / WebGPU API)
```

1. **Aislamiento Total del Dominio**: `src/domain/` contiene **0 referencias** a `navigator.gpu`, `GPUDevice`, `GPUBuffer`, `GPUComputePipeline`, `GPUQueue` o bibliotecas gráficas. La autoridad matemática y la lógica de validación son puras e independientes de la plataforma.
2. **Cero Dependencias de Terceros en Core**: No se incorporó `onnxruntime-web`, `tensorflow.js`, `three`, `opencv` ni envoltorios de inferencia. La ejecución se basa estrictamente en TypeScript nativo y WebGPU/WGSL estándar.
3. **Autoridad Matemática Determinista**: El backend `CpuMicroModelInferenceProvider` es la referencia numérica contra la cual se contrasta la salida acelerada por hardware de WebGPU dentro de una tolerancia finita ($\epsilon \le 10^{-4}$).

---

## 2. Modelo de Tensores Neutral (`Tensor`)

Se implementó el agregado matemático `Tensor` en [`src/domain/vto/neural-tensor.ts`](../src/domain/vto/neural-tensor.ts):

- **Tipo de Dato**: `FLOAT32` (extensible a `INT32` y `UINT8`).
- **Forma y Rango**: Representado por `TensorShape` (e.g. `[1, 8]`, `[1, 2]`), con verificación estricta de rango y dimensiones positivas.
- **Validación Fail-Closed**:
  - Rechaza dimensiones negativas, nulas o flotantes.
  - Rechaza discrepancias entre la longitud del buffer y el producto de las dimensiones (`TENSOR_BUFFER_MISMATCH`).
  - Rechaza valores no finitos (`NaN`, `Infinity`).
  - Aplica límites de recursos configurables (`DEFAULT_TENSOR_RESOURCE_LIMITS`): rango máximo 4, hasta $1\,000\,000$ elementos ($4\text{ MB}$).

---

## 3. Manifiesto de Micro-Modelos y Validación ABI

En [`src/domain/vto/neural-model.ts`](../src/domain/vto/neural-model.ts) se formalizó el contrato neutro de modelo:

- **Estructura del Manifiesto**: `modelId`, `modelVersion`, `runtimeVersion`, `precision`, especificación de tensores de entrada/salida (`ModelTensorSpec`), lista de operaciones y pesos del modelo (`weights`).
- **Validación de ABI**: La función `validateModelAbi()` inspecciona antes de cualquier cómputo:
  - Presencia obligatoria de tensores nombrados.
  - Concordancia exacta de tipo de dato (`dataType`).
  - Concordancia exacta de rango y dimensiones. Ante cualquier desviación, emite `MODEL_ABI_MISMATCH` fail-closed.
- **Integridad Criptográfica**: Verificación de integridad mediante suma de comprobación determinista `weightsChecksumSha256`.

---

## 4. Micro-Modelo Canónico de VTO y Extractor de Características

En [`src/domain/vto/canonical-micro-model.ts`](../src/domain/vto/canonical-micro-model.ts) se definió el micro-modelo canónico:

- **Identificador**: `vto-alignment-quality-v1` (Versión `1.0.0`).
- **Finalidad Técnica**: Estimador determinista de calidad de alineación geométrica y estabilidad de calce del atuendo sobre la silueta del usuario.
- **Vector de Entrada (8 dimensiones)**:
  1. `estimatedHeightRatio`: Ratio vertical respecto al encuadre.
  2. `shoulderWidthRatio`: Amplitud de hombros relativa.
  3. `hipWidthRatio`: Amplitud de cadera relativa.
  4. `shoulderToHipRatio`: Proporción V-taper.
  5. `torsoLengthRatio`: Longitud relativa de torso.
  6. `garmentAlignment.scale.x`: Factor de escala horizontal.
  7. `garmentAlignment.scale.y`: Factor de escala vertical.
  8. `garmentAlignment.rotationNormalized`: Ángulo de rotación normalizado en $[-1.0, 1.0]$.
- **Arquitectura de Red**:
  $$\mathbf{x} \in \mathbb{R}^8 \xrightarrow{\mathbf{W}_1 \in \mathbb{R}^{4 \times 8}, \mathbf{b}_1 \in \mathbb{R}^4} \text{ReLU}(\mathbf{W}_1 \mathbf{x} + \mathbf{b}_1) \xrightarrow{\mathbf{W}_2 \in \mathbb{R}^{2 \times 4}, \mathbf{b}_2 \in \mathbb{R}^2} \mathbf{y} \in \mathbb{R}^2$$
- **Salidas ($\mathbf{y}$)**:
  - `y[0]`: `alignmentQualityScore` ($0.0 \dots 1.0$).
  - `y[1]`: `fitmentStabilityConfidence` ($0.0 \dots 1.0$).

---

## 5. Implementación de Referencia en CPU

En [`src/domain/vto/cpu-inference-provider.ts`](../src/domain/vto/cpu-inference-provider.ts) se implementó `CpuMicroModelInferenceProvider`:
- Ejecución matricial determinista con multiplicación fila-columna e indexación continua de memoria (*cache-friendly*).
- Función de activación `ReLU` pura $\max(0, x)$.
- Soporte para cancelación mediante `AbortSignal`.
- Medición de métricas de rendimiento (latencia en frío vs latencia en caliente).

---

## 6. Adaptador WebGPU y Sombreadores WGSL

En [`src/application/vto/webgpu-inference-provider.ts`](../src/application/vto/webgpu-inference-provider.ts) y [`src/application/vto/wgsl-shaders.ts`](../src/application/vto/wgsl-shaders.ts):

- **Shader WGSL**: Shader de cómputo unificado (`@compute @workgroup_size(1)`) que ejecuta la capa densa con ReLU y la segunda capa densa directamente en memoria GPU.
- **Distribución de Memoria y Bindings**:
  - `binding(0)`: Uniform buffer de parámetros del modelo (dimensiones `in_features`, `hidden_features`, `out_features`).
  - `binding(1)`: Storage buffer de entrada (`read`).
  - `binding(2)` / `binding(3)`: Storage buffers de pesos y sesgos de Capa 1 (`read`).
  - `binding(4)` / `binding(5)`: Storage buffers de pesos y sesgos de Capa 2 (`read`).
  - `binding(6)`: Storage buffer de salida (`read_write`).
- **Ciclo de Vida de Buffers**:
  - Los buffers estáticos de pesos y parámetros se reservan una única vez al invocar `loadModel()` y se reutilizan indefinidamente.
  - Los tensores de entrada se transfieren a través de `device.queue.writeBuffer()`.
  - El buffer de salida se transfiere a un buffer de staging (`MAP_READ | COPY_DST`) y se lee mediante `mapAsync()`, liberándose con `unmap()` de inmediato.
- **Manejo de Pérdida de Dispositivo (`GPUDevice.lost`)**:
  - El adapter escucha la promesa `device.lost`. Ante un fallo de GPU, transiciona su estado a `DEVICE_LOST`, invalida la pipeline y rechaza solicitudes posteriores de forma segura.

---

## 7. Coordinador de Inferencia y Fallback Explícito

En [`src/application/vto/on-device-vto-coordinator.ts`](../src/application/vto/on-device-vto-coordinator.ts):
- Orquesta la ejecución de inferencia entre el proveedor primario (WebGPU) y el proveedor de respaldo (CPU Reference).
- Si WebGPU no está disponible en el entorno del cliente o si el dispositivo entra en `DEVICE_LOST`, conmuta inmediatamente a `CpuMicroModelInferenceProvider`.
- **Invariante de Transparencia**: El resultado declara explícitamente `isFallbackApplied: true`, `isHardwareAccelerated: false` e `inferenceProviderType: "CPU_REFERENCE"`. Queda terminantemente prohibido ocultar una ejecución CPU simulando que fue WebGPU.

---

## 8. Paridad Numérica y Golden Journey E

Se probó la paridad numérica entre CPU y GPU en [`tests/unit/vto-neural-inference.test.ts`](../tests/unit/vto-neural-inference.test.ts) y en [`tests/e2e/aud-sistema-001.test.ts`](../tests/e2e/aud-sistema-001.test.ts) (Golden Journey E):

$$\max_i \left| y_{\text{CPU}}[i] - y_{\text{GPU}}[i] \right| \le 10^{-4}$$

Ambos backends arrojaron concordancia matemática exacta dentro del margen de precisión de coma flotante de 32 bits.

---

## 9. Declaración de Madurez de la Fase 157

De acuerdo con las reglas de gobierno de calidad del proyecto:

```text
================================================================================
                    DECLARACIÓN FORMAL DE MADUREZ — FASE 157
================================================================================
CPU REFERENCE BACKEND:        IMPLEMENTED + VERIFIED (Ground Truth Authority)
WEBGPU INFERENCE ADAPTER:     IMPLEMENTED (Complete Lifecycle, WGSL, Buffers)
WEBGPU TEST DOUBLE CONTEXT:   IMPLEMENTED + VERIFIED (Simulated In-Memory)
WEBGPU HARDWARE EXECUTION:    ENVIRONMENT PENDING (Despliegue navegador cliente)
================================================================================
```
*No se confunde la implementación del adaptador periférico con la certificación de hardware físico universal en producción.*
