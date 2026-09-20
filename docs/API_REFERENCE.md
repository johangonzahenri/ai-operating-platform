# Platform API Reference (Referencia Oficial de la API)
## Especificación Exhaustiva de Rutas, Métodos y Contratos REST (v1.3.0)

La **Platform API** es el punto de entrada oficial para todos los clientes y servicios que interactúan con la plataforma.

---

## 1. Protocolo y Parámetros Globales

* **URL Base:** `http://127.0.0.1:3000/api/v1`
* **Formato de Carga Útil:** `application/json` (UTF-8)
* **Límite de Tamaño de Petición:** 1 MB estricto
* **Encabezados Estándar:**
  * `Authorization: Bearer <API_KEY>` o `X-API-Key: <API_KEY>` (obligatorio en operaciones protegidas)
  * `X-Tenant-Id: <TENANT_ID>` (reconciliado fail-closed con la credencial)
  * `X-Application-Id: <APPLICATION_ID>` (reconciliado fail-closed con la credencial)
  * `X-Request-Id: <REQUEST_ID>` (identificador único por petición)
  * `X-Correlation-Id: <CORRELATION_ID>` (trazabilidad distribuida de extremo a extremo)

---

## 2. Catálogo Canónico de Endpoints

### Credenciales de API & Gobernanza de Acceso (`/api/v1/credentials`)
* `GET /api/v1/credentials`: Lista credenciales activas, expiradas o revocadas por inquilino (`scopes: credentials.read` o `credentials.manage`).
* `POST /api/v1/credentials`: Genera una nueva credencial con alcances específicos; retorna la clave en texto plano (`rawKey`) estrictamente una vez (`scopes: credentials.manage`).
* `GET /api/v1/credentials/:id`: Inspecciona los metadatos seguros de una credencial sin exponer el hash secreto (`scopes: credentials.read`).
* `POST /api/v1/credentials/:id/rotate`: Rota la clave de API generando una nueva clave con período de gracia opcional (`gracePeriodMs`) (`scopes: credentials.manage`).
* `POST /api/v1/credentials/:id/revoke`: Revoca inmediatamente una credencial activa (`scopes: credentials.manage`).
* `DELETE /api/v1/credentials/:id`: Revoca y elimina el registro de credencial (`scopes: credentials.manage`).

### Tareas (`/api/v1/tasks`)
* `POST /api/v1/tasks`: Crea y encola una nueva tarea de dominio (`scopes: tasks.create`).
* `GET /api/v1/tasks`: Lista tareas con paginación (`limit`, `offset`, `status`) (`scopes: tasks.read`).
* `GET /api/v1/tasks/:id`: Obtiene el estado detallado de una tarea (`scopes: tasks.read`).
* `POST /api/v1/tasks/:id/execute`: Despacha la ejecución determinista de una tarea en el `CoreRuntime` (`scopes: tasks.create`).
* `POST /api/v1/tasks/:id/cancel`: Solicita la cancelación cooperativa de una tarea activa (`scopes: tasks.cancel`).

### Ejecuciones (`/api/v1/executions`)
* `GET /api/v1/executions`: Lista ejecuciones históricas (`scopes: executions.read`).
* `GET /api/v1/executions/:id`: Obtiene el resultado, error y duración de una ejecución (`scopes: executions.read`).
* `GET /api/v1/executions/:id/timeline`: Retorna la reconstrucción forense de eventos de una ejecución (`scopes: executions.read`).

### Agentes (`/api/v1/agents`)
* `GET /api/v1/agents`: Lista todos los agentes registrados.
* `POST /api/v1/agents`: Registra un nuevo agente de dominio.
* `GET /api/v1/agents/:id`: Obtiene el perfil e instrucciones de un agente.
* `POST /api/v1/agents/:id/activate`: Cambia el estado a `ACTIVE`.
* `POST /api/v1/agents/:id/deactivate`: Cambia el estado a `INACTIVE`.

### Operaciones Autónomas & Runtime Continuo (`/api/v1/autonomous`)
* `GET /api/v1/autonomous/runtime`: Consulta el estado operacional del daemon y contadores de circuit breaker.
* `POST /api/v1/autonomous/runtime/start`: Inicia el daemon de ejecución autónoma.
* `POST /api/v1/autonomous/runtime/pause`: Pausa temporalmente la ejecución de disparadores.
* `POST /api/v1/autonomous/runtime/resume`: Reanuda el procesamiento autónomo.
* `POST /api/v1/autonomous/runtime/stop`: Detiene limpiamente el daemon liberando leases.
* `GET /api/v1/autonomous/triggers`: Lista los disparadores autónomos registrados.
* `POST /api/v1/autonomous/triggers`: Registra un nuevo disparador (`SCHEDULED`, `EVENT_DRIVEN`, `THRESHOLD`, `MANUAL`).
* `POST /api/v1/autonomous/triggers/:id/enable`: Habilita un disparador autónomo.
* `POST /api/v1/autonomous/triggers/:id/disable`: Deshabilita un disparador.
* `POST /api/v1/autonomous/triggers/:id/fire`: Dispara manualmente un ciclo ejecutivo inmediato.

### Eventos Durables (`/api/v1/events`)
* `GET /api/v1/events`: Consulta el registro cronológico del `EventStore` en SQLite WAL (`scopes: events.read`).
* `GET /api/v1/events/:id`: Obtiene la carga útil completa e inmutable de un evento específico (`scopes: events.read`).
* `GET /api/v1/events/stream`: Flujo reactivo unidireccional vía Server-Sent Events (SSE).

### Dispositivos & Impresión (`/api/v1/devices`)
* `GET /api/v1/devices`: Lista los dispositivos de negocio conectados (`scopes: devices.read`).
* `GET /api/v1/devices/:id`: Obtiene el estado y capacidades de un dispositivo (`scopes: devices.read`).
* `POST /api/v1/devices/:id/print`: Envía una orden de impresión (`PrintJob`) al spooler local (`scopes: devices.print`).
* `GET /api/v1/devices/jobs/:jobId`: Consulta el estado de un trabajo de impresión (`scopes: devices.read`).

### Diagnósticos & Salud (Públicos)
* `GET /api/v1/health`: Estado de salud global, motor SQLite y contadores de eventos.
* `GET /api/v1/health/live`: Sonda de liveness de contenedor / host.
* `GET /api/v1/health/ready`: Sonda de readiness verificando conectividad de persistencia.
* `GET /api/v1/status`: Resumen operacional de plataforma y versión de runtime.
