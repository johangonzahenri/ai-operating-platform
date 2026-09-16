# Platform API Reference (Referencia Oficial de la API)
## Especificación Exhaustiva de Rutas, Métodos y Contratos REST (v1.1.0)

La **Platform API** es el punto de entrada oficial para todos los clientes y servicios que interactúan con la plataforma.

---

## 1. Protocolo y Parámetros Globales

* **URL Base:** `http://127.0.0.1:3000/api/v1`
* **Formato de Carga Útil:** `application/json` (UTF-8)
* **Límite de Tamaño de Petición:** 1 MB estricto
* **Encabezados Estándar:**
  * `Authorization: Bearer <TOKEN>` (obligatorio en operaciones protegidas)
  * `x-tenant-id: <TENANT_ID>` (obligatorio para aislamiento multi-tenant)
  * `x-trace-id: <TRACE_ID>` (opcional; si no se provee, la plataforma genera uno)

---

## 2. Catálogo Canónico de Endpoints

### Tareas (`/api/v1/tasks`)
* `POST /api/v1/tasks`: Crea y encola una nueva tarea de dominio.
* `GET /api/v1/tasks`: Lista tareas con paginación (`limit`, `offset`, `status`).
* `GET /api/v1/tasks/:id`: Obtiene el estado detallado de una tarea.
* `POST /api/v1/tasks/:id/execute`: Despacha la ejecución determinista de una tarea en el `CoreRuntime`.
* `POST /api/v1/tasks/:id/cancel`: Solicita la cancelación cooperativa de una tarea activa.

### Ejecuciones (`/api/v1/executions`)
* `GET /api/v1/executions`: Lista ejecuciones históricas.
* `GET /api/v1/executions/:id`: Obtiene el resultado, error y duración de una ejecución.
* `GET /api/v1/executions/:id/timeline`: Retorna la reconstrucción forense de eventos de una ejecución.

### Agentes (`/api/v1/agents`)
* `GET /api/v1/agents`: Lista todos los agentes registrados.
* `POST /api/v1/agents`: Registra un nuevo agente de dominio.
* `GET /api/v1/agents/:id`: Obtiene el perfil e instrucciones de un agente.
* `POST /api/v1/agents/:id/activate`: Cambia el estado a `ACTIVE`.
* `POST /api/v1/agents/:id/deactivate`: Cambia el estado a `INACTIVE`.

### Eventos Durables (`/api/v1/events`)
* `GET /api/v1/events`: Consulta el registro cronológico del `EventStore` en SQLite WAL.
* `GET /api/v1/events/:id`: Obtiene la carga útil completa e inmutable de un evento específico.

### Dispositivos & Impresión (`/api/v1/devices`)
* `GET /api/v1/devices`: Lista los dispositivos de negocio conectados.
* `GET /api/v1/devices/:id`: Obtiene el estado y capacidades de un dispositivo.
* `POST /api/v1/devices/:id/print`: Envía una orden de impresión (`PrintJob`) al spooler local.
* `GET /api/v1/devices/jobs/:jobId`: Consulta el estado de un trabajo de impresión.

### Diagnósticos & Salud (`/api/v1/health`)
* `GET /api/v1/health`: Estado de salud global, motor SQLite y contadores de eventos.
