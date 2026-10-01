# Fase 158 — PROJ-01 Tentaciones AI Commerce

## WebWorker Asynchronous Off-Main-Thread Computer Vision & Pipeline Decoupling

```text
================================================================================
AI OPERATING PLATFORM — REPORTE DE ESPECIFICACIÓN Y ENTREGA DE FASE 158
================================================================================
Iniciativa:        AOP-TENTACIONES-AR-3D-AI
Área:              PROJ-01: Tentaciones AI Commerce
Fase Funcional:    158 (WebWorker Asynchronous Off-Main-Thread Computer Vision)
Estado Técnico:    DONE
Estado Operativo:  DONE
Declaración:       WebWorker execution foundation IMPLEMENTED + SIMULATED VERIFIED
                   Browser runtime execution ENVIRONMENT PENDING
Alineación:        Application Integration Guide (docs/APPLICATION_INTEGRATION_GUIDE.md)
                   Agent Operating Protocol (docs/AGENT_OPERATING_PROTOCOL.md)
                   Source of Truth (docs/SOURCE_OF_TRUTH.md)
================================================================================
```

---

## 1. Misión y Visión Estratégica

La **AI Operating Platform** evoluciona como infraestructura técnica de alta fiabilidad orientada a soluciones empresariales de Inteligencia Artificial, orquestación multi-agente, workflows gobernados y aplicaciones satélite de comercio espacial (`PROJ-01 Tentaciones AI Commerce`).

Bajo el principio rector:
$$\text{CRECER SIN DEGRADAR}$$

La **Fase 158** construye la infraestructura de ejecución asíncrona fuera del hilo principal (*off-main-thread*) mediante `WebWorker`, permitiendo descargar las operaciones intensivas de visión computacional, filtrado cinemático, cálculo de deformación elástica de prendas e inferencia de micro-modelos neuronales del hilo UI del navegador, orientada al objetivo de diseño de 60 fps (**DESIGN TARGET**: $< 16.6\text{ ms}$ por frame; **VERIFICADO MEDIANTE SIMULACIÓN ASÍNCRONA EN NODE.JS/CI**; **BROWSER RUNTIME**: `ENVIRONMENT PENDING`) sin comprometer la arquitectura hexagonal ni introducir acoplamientos con APIs propietarias de navegador en el núcleo de dominio.

---

## 2. Invariantes Arquitectónicos y Límites de Frontera

La arquitectura preserva estrictamente los invariantes de plataforma:

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{PUBLIC DEMO}$$

Y para el dominio de Virtual Try-On (VTO):

$$\text{VTO Domain} \longrightarrow \text{Application / Port Layer} \longrightarrow \text{Runtime Adapter}$$

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        VTO DOMAIN (Puro / Hexagonal)                   │
│   - worker-protocol.ts (Contratos neutrales de mensajes y envelopes)   │
│   - async-worker-port.ts (Puerto abstracto AsyncOffMainThreadPort)     │
│   - ZERO imports de Worker, postMessage, DOM, window, navigator        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Contratos
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   PERIPHERAL APPLICATION & ADAPTER LAYER               │
│   - web-worker-vto-adapter.ts (Adaptador perimetral de ejecución)      │
│   - worker-runtime-dispatcher.ts (Despachador seguro en hilo worker)   │
│   - simulated-web-worker.ts (Doble determinista para Node.js / CI)     │
│   - Concurrencia, correlación, backpressure, timeouts, AbortSignal     │
└────────────────────────────────────────────────────────────────────────┘
```

### Reglas de Frontera Obligatorias
1. **Pureza de Dominio**: El directorio `src/domain/vto/` contiene **CERO** referencias a `Worker`, `postMessage`, `navigator`, `window`, `document`, `GPUDevice`, `GPUBuffer`, `MessagePort` o `importScripts`.
2. **Cero Dependencias de Terceros**: La implementación no introduce bibliotecas externas (`comlink`, `workerpool`, `threads.js`, `onnxruntime`, `tensorflow`). Toda la orquestación y el protocolo de serialización se apoyan exclusivamente en TypeScript estándar y el contrato nativo de paso de mensajes.
3. **Mapeo Tipado Fail-Closed**: Todo sobre de mensaje es validado mediante esquemas cerrados (`validateVtoWorkerRequest`); cualquier inconsistencia de protocolo rechaza la operación sin propagar excepciones no controladas.

---

## 3. Protocolo Neutral de Mensajería y Envelopes Tipados

El protocolo neutral de comunicación asíncrona se formaliza en `src/domain/vto/worker-protocol.ts` bajo la versión semántica fija:

$$\text{VTO\_WORKER\_PROTOCOL\_VERSION} = \text{"1.0.0"}$$

### 3.1 Catálogo Cerrado de Operaciones Permitidas (`VtoWorkerOperation`)
- `POSE_PREPROCESS`: Normalización de coordenadas, filtrado One-Euro y alineación geométrica de prendas.
- `GARMENT_WARP`: Cálculo de campos de deformación 2D/3D (WarpField) y mapeo de mallas de tela.
- `DEPTH_OCCLUSION`: Evaluación de mapas de profundidad y ordenamiento de oclusión dinámica.
- `NEURAL_INFERENCE`: Ejecución de micro-modelos neuronales on-device vía referencia determinista CPU o aceleración de hardware.

### 3.2 Sobre de Solicitud (`VtoWorkerRequest`)
```typescript
export interface VtoWorkerRequest<TPayload = unknown> {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly operation: VtoWorkerOperation;
  readonly payload: TPayload;
  readonly timestampMs?: number;
  readonly timeoutMs?: number;
  readonly tenantId?: string;
  readonly applicationId?: string;
}
```

### 3.3 Sobre de Respuesta (`VtoWorkerResponse`)
```typescript
export interface VtoWorkerResponse<TResult = unknown> {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly operation: VtoWorkerOperation;
  readonly status: VtoWorkerTaskStatus; // "COMPLETED" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT" | "REJECTED"
  readonly result?: TResult;
  readonly payload?: TResult;           // Alias de resultado
  readonly error?: VtoWorkerError;
  readonly metrics: VtoWorkerMetrics;
  readonly completedAtMs: number;
}
```

---

## 4. Máquina de Estados del Ciclo de Vida del Worker

El ciclo de vida del ejecutor en background sigue una máquina de estados determinista y no reversible hacia estados terminales:

```mermaid
stateDiagram-v2
    [*] --> UNINITIALIZED
    UNINITIALIZED --> STARTING: start() / initialize()
    STARTING --> READY: Instanciación & Event Listeners OK
    STARTING --> FAILED: Error de carga de Worker
    READY --> RUNNING: Recepción de tarea (activeTasksCount > 0)
    RUNNING --> READY: activeTasksCount == 0 && queue == 0
    RUNNING --> DRAINING: drain() invocado
    READY --> DRAINING: drain() invocado
    DRAINING --> TERMINATED: Cola vacía y tareas pendientes resueltas
    RUNNING --> FAILED: Worker unhandled error / crash
    READY --> FAILED: Worker unhandled error / crash
    READY --> TERMINATED: terminate() invocado
    RUNNING --> TERMINATED: terminate() invocado
    FAILED --> [*]
    TERMINATED --> [*]
```

### Invariantes del Ciclo de Vida:
- **`DRAINING`**: Rechaza de inmediato cualquier solicitud entrante (`Adapter is draining`). Permite que las tareas actualmente en ejecución concluyan con éxito o por timeout antes de llamar a `terminate()`.
- **`FAILED`**: Al suscitarse un error fatal no recuperable en el worker subyacente, todas las tareas pendientes se rechazan con código `WORKER_UNAVAILABLE` y el adaptador pasa a estado `FAILED`, bloqueando ejecuciones posteriores.
- **`TERMINATED`**: Libera los manejadores de eventos, cancela temporizadores activos y destruye la instancia subyacente (`worker.terminate()`).

---

## 5. Adaptador Periférico y Puerto de Ejecución

El puerto hexagonal abstracto `AsyncOffMainThreadExecutionPort` (`src/domain/vto/async-worker-port.ts`) define el contrato con el que interactúan los servicios de aplicación:

```typescript
export interface AsyncOffMainThreadExecutionPort {
  readonly lifecycleStatus: WorkerLifecycleStatus;
  readonly stats: WorkerRuntimeStats;

  start(): Promise<void>;
  executeTask<TPayload, TResult>(
    operation: VtoWorkerOperation,
    payload: TPayload,
    options?: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      tenantId?: string;
      applicationId?: string;
    }
  ): Promise<VtoWorkerResponse<TResult>>;
  drain(): Promise<void>;
  terminate(): Promise<void>;
}
```

El adaptador concreto `WebWorkerVtoExecutionAdapter` (`src/application/vto/web-worker-vto-adapter.ts`) implementa este puerto proporcionando:
1. **Correlación Biunívoca por `requestId`**: Cada mensaje saliente lleva un identificador criptográfico/temporal único; las respuestas recibidas desde el worker se emparejan estrictamente con el registro de tarea pendiente correspondiente, permitiendo resolución desordenada (*out-of-order execution*) cuando diferentes operaciones toman tiempos heterogéneos.
2. **Gobernanza de Contrapresión (Backpressure)**: La cola interna está estrictamente acotada por `maxQueueSize` (por defecto 16) y `maxConcurrentTasks` (por defecto 2). Si una solicitud satura la cola, se rechaza de inmediato con error `Backpressure limit exceeded` sin degradar la memoria del proceso.
3. **Cancelación Cooperativa con `AbortSignal`**: Si el cliente aborta la señal antes o durante el procesamiento, la tarea se elimina de la cola, el temporizador se limpia y se emite la respuesta `EXECUTION_CANCELLED`.
4. **Timeouts Deterministas**: Si el worker no responde dentro de `timeoutMs` (por defecto 5000ms), la tarea se declara expirada (`EXECUTION_TIMEOUT`) y se desaloja sin fugas de promesas colgadas.

---

## 6. Despachador Seguro en Hilo Worker (`VtoWorkerRuntimeDispatcher`)

En el lado receptor (hilo del Worker o Worker Simulado), el despachador `VtoWorkerRuntimeDispatcher` (`src/application/vto/worker-runtime-dispatcher.ts`) actúa como unidad de ejecución segura y aislada:

- **Cero Código Dinámico**: No utiliza `eval()`, `new Function()`, ni inyección de scripts externos.
- **Registro Cerrado de Handlers**: Mapea explícitamente operaciones permitidas a pipelines canónicos probados en Fases 153–157:
  - `POSE_PREPROCESS`: Ejecuta `PosePreprocessingPipeline` o normalización cinemática de keypoints.
  - `GARMENT_WARP`: Ejecuta `GarmentWarpEngine` computando vectores de desplazamiento `(dx, dy)`.
  - `NEURAL_INFERENCE`: Ejecuta el micro-modelo canónico `vto-alignment-quality-v1` (`CANONICAL_VTO_MICRO_MODEL_ID`) mediante `CpuMicroModelInferenceProvider` encapsulado dentro del worker.
- **Aislamiento de Excepciones**: Todo error interno del pipeline es capturado y empaquetado en un sobre estructurado con métricas de duración (`workerExecutionMs`, `roundTripLatencyMs`, `serializedPayloadBytes`), evitando el colapso del proceso worker.

---

## 7. Doble de Prueba Determinista (`SimulatedWebWorker`)

Para garantizar la reproducibilidad absoluta en entornos de integración continua (CI) y Node.js donde no existe la API global `Worker` de navegador:

- Se implementó `SimulatedWebWorker` (`src/application/vto/simulated-web-worker.ts`), un doble estructural en memoria (*test double*) que implementa fielmente `postMessage`, `addEventListener("message")`, `addEventListener("error")` y `terminate()`.
- **Distinción Canónica**: `SimulatedWebWorker` **NO** es un sustituto de `DedicatedWorkerGlobalScope` en navegadores, sino un arnés determinista de prueba para validar el intercambio asíncrono de mensajes, desorden de respuestas, contrapresión y fallos simulados (`simulateError`) en Node.js y pipelines de CI.
- Ejecuta las tareas de manera asíncrona mediante `setTimeout(..., executionDelayMs)`, simulando fielmente la transferencia de contexto entre hilos, demoras de red interna y desorden de respuestas.

---

## 8. Verificación y Evidencia de Pruebas Automatizadas

La suite unitaria dedicada `tests/unit/vto-async-worker.test.ts` implementa 22 pruebas automatizadas exhaustivas distribuidas en 7 bloques temáticos principales (reportadas formalmente como 8 suites por el test runner nativo de Node.js al computar la suite raíz contenedora):

```text
▶ Phase 158: WebWorker Asynchronous Off-Main-Thread Computer Vision Pipeline
  ▶ 1. Neutral Worker Protocol Envelopes & Fail-Closed Validation
    ✔ 1.1 validates a structurally sound VtoWorkerRequest envelope (0.83ms)
    ✔ 1.2 fails closed when envelope is missing requestId or operation (0.19ms)
    ✔ 1.3 rejects request with unsupported protocol version (0.23ms)
    ✔ 1.4 rejects request with unknown operation (0.20ms)
    ✔ 1.5 rejects non-object or null request (0.18ms)
  ✔ 1. Neutral Worker Protocol Envelopes & Fail-Closed Validation (2.68ms)
  ▶ 2. Worker Lifecycle State Machine
    ✔ 2.1 transitions through UNINITIALIZED -> READY -> TERMINATED upon lifecycle progression (0.62ms)
    ✔ 2.2 prevents double initialization and returns cleanly if already READY (0.15ms)
    ✔ 2.3 transitions to DRAINING then TERMINATED when gracefully drained (36.59ms)
    ✔ 2.4 marks lifecycle as FAILED and rejects pending tasks if worker triggers an unrecoverable error (0.53ms)
  ✔ 2. Worker Lifecycle State Machine (38.47ms)
  ▶ 3. Asynchronous Execution of Computer Vision & Neural Operations
    ✔ 3.1 executes POSE_PREPROCESS off-main-thread with real simulated worker (1.00ms)
    ✔ 3.2 executes GARMENT_WARP off-main-thread (0.70ms)
    ✔ 3.3 executes NEURAL_INFERENCE off-main-thread with CPU provider inside worker (12.44ms)
  ✔ 3. Asynchronous Execution of Computer Vision & Neural Operations (14.42ms)
  ▶ 4. Concurrency, Correlation by RequestId & Backpressure
    ✔ 4.1 correlates concurrent requests executed out-of-order by requestId (30.65ms)
    ✔ 4.2 rejects requests when backpressure maxQueueSize is exceeded (324.19ms)
  ✔ 4. Concurrency, Correlation by RequestId & Backpressure (355.24ms)
  ▶ 5. Cancellation & Execution Timeouts
    ✔ 5.1 times out when task exceeds timeoutMs (61.62ms)
    ✔ 5.2 aborts and rejects when AbortSignal triggers cancellation (31.26ms)
    ✔ 5.3 rejects immediately if AbortSignal is already aborted (0.28ms)
  ✔ 5. Cancellation & Execution Timeouts (93.47ms)
  ▶ 6. In-Worker Dispatcher Security, Error Handlers & Boundary Isolation
    ✔ 6.1 rejects unknown operations gracefully with UNKNOWN_OPERATION error code (0.14ms)
    ✔ 6.2 handles malformed payload without uncaught exceptions (0.09ms)
    ✔ 6.3 confirms WorkerRuntimeDispatcher source has ZERO eval or new Function (0.50ms)
  ✔ 6. In-Worker Dispatcher Security, Error Handlers & Boundary Isolation (0.81ms)
  ▶ 7. Hexagonal Architectural Boundary Purity
    ✔ 7.1 verifies src/domain/vto/ contains ZERO references to browser Worker APIs (3.48ms)
    ✔ 7.2 verifies Worker execution port is an abstract neutral contract (0.20ms)
  ✔ 7. Hexagonal Architectural Boundary Purity (3.78ms)
✔ Phase 158: WebWorker Asynchronous Off-Main-Thread Computer Vision Pipeline (509.67ms)
```

### Estadísticas Consolidadas de la Plataforma
- **Tests de Fase 158**: 22 tests PASS (100%).
- **Total Plataforma**: 1993 tests PASS en 183 suites (0 fallos, 0 omitidos, 0 cancelados).
- **Verificación de Integridad Documental (`npm run check`)**: 100% consistente, SHA-256 idénticos en Libro Oficial, 0 `.innerHTML`, estructura de Master Work Plan y Roadmap validada.

---

## 9. Reconciliación con Fases Anteriores (Fases 153–157)

La Fase 158 se apoya y reutiliza de forma armoniosa las capacidades preexistentes del flujo de VTO:
1. **Fase 153 (Domain Foundation)**: Utiliza `GarmentReference`, `BodyProfileReference` y `VirtualTryOnSessionState`.
2. **Fase 154 (Pose & Alignment)**: Invoca el pipeline cinemático `PosePreprocessingPipeline` y suavizado con filtro One-Euro.
3. **Fase 155 (Segmentation & Warping)**: Ejecuta `GarmentWarpEngine` computando campos vectoriales de deformación sobre las mallas.
4. **Fase 156 (Depth & Material)**: Permite orquestar tareas de oclusión dinámica en segundo plano.
5. **Fase 157 (WebGPU Neural Inference)**: Desacopla la inferencia de micro-modelos hacia el worker, donde el backend CPU de referencia opera de forma completamente determinista sin competir por ciclos de CPU con la interfaz principal.

---

## 10. Declaración Canónica de Evidencia

En cumplimiento estricto del protocolo de verdad y transparencia técnica:

```text
ESTADO TÉCNICO:
  [OK] WebWorker execution foundation IMPLEMENTED + SIMULATED VERIFIED
       - Contratos de protocolo neutral implementados y testeados.
       - Adaptador hexagonal con correlación por requestId y contrapresión acotada verificado.
       - Manejadores de ciclo de vida (STARTING, READY, RUNNING, DRAINING, TERMINATED, FAILED) verificados.
       - Cancelación por AbortSignal y Timeouts validados bajo simulación asíncrona.
       - Paridad arquitectónica y pureza de dominio 100% verificada (0 APIs de browser en src/domain/).

  [ENVIRONMENT PENDING] Browser runtime execution
       - La ejecución dentro de instancias reales del navegador (DedicatedWorkerGlobalScope, OffscreenCanvas nativo) 
         queda catalogada como PENDING DE AMBIENTE para la fase de integración visual en satélite Tentaciones,
         sin impedir el avance ni la certificación técnica del runtime desacoplado en la plataforma.
```

---

## 11. Conclusión y Próximos Pasos

La **Fase 158** queda formalmente declarada como:

$$\mathbf{DONE} \quad \Big( \text{WebWorker Execution Foundation Ready: IMPLEMENTED + SIMULATED VERIFIED} \Big)$$

La infraestructura base para desacoplar el procesamiento pesado de visión computacional y ejecución neuronal fuera del hilo principal se encuentra plenamente implementada en código, verificada mediante pruebas unitarias y de simulación asíncrona determinista, y protegida por compuertas de calidad. La ejecución en instancias físicas de navegador (`DedicatedWorkerGlobalScope`) permanece como `ENVIRONMENT PENDING` para la futura fase de integración visual en la aplicación satélite Tentaciones.
