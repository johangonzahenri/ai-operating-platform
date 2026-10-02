# Arquitectura de Escalabilidad y Resiliencia — AI Operating Platform

## 1. Dimensiones de Escalabilidad
La AI Operating Platform está diseñada para escalar a través de múltiples dimensiones sin fragmentación prematura de microservicios:
* **Cómputo / Ejecución de Agentes**: Ejecución de workers sin estado sobre colas de tareas duraderas.
* **API / Ingreso**: Manejo de solicitudes asíncronas con contrapresión (backpressure) limitada.
* **Persistencia**: Journaling de eventos SQLite de solo adición con ruta de migración a SQL distribuido.
* **Gateways de Modelos**: Enrutamiento de proveedores desacoplado con conmutación por error (failover) y aislamiento de circuit breaker.
* **Invocación de Herramientas**: Runtime aislado con tiempos de espera y limitación de memoria.

---

## 2. Análisis de Cuellos de Botella y Concurrencia
* **Modelo de Concurrencia**: El Control de Concurrencia Optimista (OCC) protege las transiciones de estado de las tareas.
* **Concurrencia de SQLite WAL**: Permite lectores concurrentes junto con un escritor serializado, evitando la inanición de hilos bajo cargas de trabajo empresariales típicas.
* **Contrapresión (Backpressure)**: `BackpressureController` limita las ejecuciones activas concurrentes (por defecto 50) y devuelve HTTP 429 / 503 con `Retry-After` cuando se excede la capacidad.

---

## 3. Worker Queue y Modelo de Ejecución Distribuida
* **Puerto**: `WorkerQueuePort` (`src/application/ports/worker-queue-port.ts`).
* **Implementación**: `InMemoryWorkerQueue` con latidos (heartbeats) de renovación de arrendamiento (lease), reintentos exponenciales y contención de cola de mensajes muertos (DLQ).
* **Protocolo de Arrendamiento (Lease)**: Los workers adquieren un arrendamiento exclusivo por $T$ segundos. Los latidos extienden el arrendamiento. Si un worker falla, los arrendamientos caducados son reclamados automáticamente por workers saludables.

---

## 4. Patrones de Resiliencia
1. **Política de Reintentos (`src/application/resilience/retry-policy.ts`)**:
   - `RETRYABLE`: Tiempos de espera de red, límites de tasa, bloqueos de SQLite.
   - `NON_RETRYABLE`: Errores de validación, rechazos de autorización, desajustes de esquema.
   - Retroceso exponencial (exponential backoff) con full jitter para evitar el problema de la manada en estampida (thundering herd).
2. **Circuit Breaker (`src/application/resilience/circuit-breaker.ts`)**:
   - Estados: `CLOSED` $\to$ `OPEN` (después de 5 fallas consecutivas) $\to$ `HALF_OPEN` (después de 10s de enfriamiento).
3. **Limitación de Tasa (Rate Limiting) (`src/application/resilience/rate-limiter.ts`)**:
   - Limitador de ventana deslizante (sliding window) que hace cumplir cuotas por cliente / inquilino (tenant) / aplicación.
