# Manual Operacional de AI Operating Platform
## Procedimientos de Operación, Mantenimiento y Diagnóstico en Producción (v1.1.0)

Este documento describe los 19 procedimientos operativos normativos para administrar, inspeccionar y operar la **AI Operating Platform** en entornos empresariales.

---

## Índice de Procedimientos Operativos

1. [Procedimiento 01: Iniciar la Plataforma](#procedimiento-01-iniciar-la-plataforma)
2. [Procedimiento 02: Verificar Salud del Sistema (Health Check)](#procedimiento-02-verificar-salud-del-sistema-health-check)
3. [Procedimiento 03: Verificar Disposición Operativa (Readiness)](#procedimiento-03-verificar-disposición-operativa-readiness)
4. [Procedimiento 04: Acceder al Plano de Control Web (Control Plane SPA)](#procedimiento-04-acceder-al-plano-de-control-web-control-plane-spa)
5. [Procedimiento 05: Revisar y Supervisar Aplicaciones Gobernadas](#procedimiento-05-revisar-y-supervisar-aplicaciones-gobernadas)
6. [Procedimiento 06: Revisar y Rastrear Tareas Operacionales](#procedimiento-06-revisar-y-rastrear-tareas-operacionales)
7. [Procedimiento 07: Revisar e Inspeccionar Ejecuciones de Runtime](#procedimiento-07-revisar-e-inspeccionar-ejecuciones-de-runtime)
8. [Procedimiento 08: Inspeccionar el Flujo de Eventos Durables (EventStore)](#procedimiento-08-inspeccionar-el-flujo-de-eventos-durables-eventstore)
9. [Procedimiento 09: Revisar la Flota de Agentes de IA](#procedimiento-09-revisar-la-flota-de-agentes-de-ia)
10. [Procedimiento 10: Revisar y Configurar Modelos de Lenguaje](#procedimiento-10-revisar-y-configurar-modelos-de-lenguaje)
11. [Procedimiento 11: Revisar el Registro de Herramientas y Capacidades](#procedimiento-11-revisar-el-registro-de-herramientas-y-capacidades)
12. [Procedimiento 12: Revisar Inquilinos (Tenants) y Cuotas de Consumo](#procedimiento-12-revisar-inquilinos-tenants-y-cuotas-de-consumo)
13. [Procedimiento 13: Auditar la Postura de Seguridad y Políticas RBAC](#procedimiento-13-auditar-la-postura-de-seguridad-y-políticas-rbac)
14. [Procedimiento 14: Revisar el Registro de Dispositivos de Negocio](#procedimiento-14-revisar-el-registro-de-dispositivos-de-negocio)
15. [Procedimiento 15: Inspeccionar la Impresora Brother Conectada](#procedimiento-15-inspeccionar-la-impresora-brother-conectada)
16. [Procedimiento 16: Ejecutar una Impresión de Prueba](#procedimiento-16-ejecutar-una-impresión-de-prueba)
17. [Procedimiento 17: Investigar y Diagnosticar un PrintJob Fallido](#procedimiento-17-investigar-y-diagnosticar-un-printjob-fallido)
18. [Procedimiento 18: Ejecutar Diagnósticos y Pruebas Profundas de Runtime](#procedimiento-18-ejecutar-diagnósticos-y-pruebas-profundas-de-runtime)
19. [Procedimiento 19: Apagado Ordenado del Servidor (Graceful Shutdown)](#procedimiento-19-apagado-ordenado-del-servidor-graceful-shutdown)

---

### Procedimiento 01: Iniciar la Plataforma
* **Objetivo:** Iniciar el servidor de plataforma con almacenamiento durable SQLite WAL y composición completa.
* **Prerrequisitos:** Node.js >= 18 instalado; puerto 3000 disponible; directorio `data/` con permisos de escritura.
* **Comandos:**
  * En Windows: Doble clic en `INICIAR_PLATAFORMA.bat` o comando:
    ```powershell
    npm run build && node dist/src/platform/server.js
    ```
* **Resultado Esperado:** Mensaje en consola `[Bootstrap] [Startup] Control Plane HTTP Server listening on port 3000`.
* **Fallos Posibles:** Error `EADDRINUSE` (puerto ocupado) o error de permisos en `data/app.db`.
* **Diagnóstico:** Verificar puertos en uso con `netstat -ano | findstr :3000` y liberar el proceso si corresponde.

---

### Procedimiento 02: Verificar Salud del Sistema (Health Check)
* **Objetivo:** Confirmar que todos los subsistemas (HTTP, SQLite, EventStore, Memory) están operacionales.
* **Prerrequisitos:** Plataforma en ejecución.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/health
  ```
* **Resultado Esperado:** JSON con `status: "HEALTHY"`, `sqlite: "CONNECTED"`, `mode: "WAL"`.
* **Fallos Posibles:** HTTP 503 con `status: "DEGRADED"`.
* **Diagnóstico:** Inspeccionar logs del servidor buscando errores de E/S o bloqueos en SQLite.

---

### Procedimiento 03: Verificar Disposición Operativa (Readiness)
* **Objetivo:** Validar que el servidor acepta peticiones entrantes y no se encuentra en fase de arranque o recuperación.
* **Prerrequisitos:** Plataforma iniciada.
* **Comandos:**
  ```powershell
  curl -I http://127.0.0.1:3000/api/v1/health
  ```
* **Resultado Esperado:** Código de respuesta HTTP `200 OK`.
* **Fallos Posibles:** Conexión rechazada (`ECONNREFUSED`).
* **Diagnóstico:** Validar si el proceso `node` sigue activo en el Administrador de Tareas.

---

### Procedimiento 04: Acceder al Plano de Control Web (Control Plane SPA)
* **Objetivo:** Abrir la interfaz web de administración para supervisar operaciones.
* **Prerrequisitos:** Navegador web moderno (Chrome, Edge, Firefox).
* **Comandos:**
  Abrir navegador en `http://127.0.0.1:3000/`
* **Resultado Esperado:** Carga inmediata de la SPA en Español (Latinoamérica) por defecto mostrando métricas y eventos.
* **Fallos Posibles:** Pantalla en blanco por deshabilitación de JavaScript o bloqueo de red local.
* **Diagnóstico:** Abrir DevTools (F12) -> Consola para comprobar que no existan errores de carga de módulos ES.

---

### Procedimiento 05: Revisar y Supervisar Aplicaciones Gobernadas
* **Objetivo:** Comprobar el estado y contratos de las aplicaciones conectadas (Tentaciones, Repuestos).
* **Prerrequisitos:** Control Plane abierto.
* **Comandos:**
  Navegar a la pestaña **Aplicaciones** (`data-tab="applications"`) o vía API:
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/applications
  ```
* **Resultado Esperado:** Lista de aplicaciones con badge `IMPLEMENTADO` y estado de salud `HEALTHY`.
* **Fallos Posibles:** Aplicación marcada como `UNREACHABLE`.
* **Diagnóstico:** Verificar conectividad de red con el host donde corre la aplicación consumidora.

---

### Procedimiento 06: Revisar y Rastrear Tareas Operacionales
* **Objetivo:** Inspeccionar el ciclo de vida de tareas enviadas por los agentes.
* **Prerrequisitos:** Plataforma activa.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/tasks?limit=10
  ```
* **Resultado Esperado:** Array de tareas con `taskId`, `status` (`COMPLETED`, `FAILED`), y `traceId`.
* **Fallos Posibles:** Tareas estancadas en `RUNNING`.
* **Diagnóstico:** Verificar si hubo un fallo en el proveedor de modelos o timeout no recuperado.

---

### Procedimiento 07: Revisar e Inspeccionar Ejecuciones de Runtime
* **Objetivo:** Obtener la trazabilidad detallada de una ejecución particular.
* **Prerrequisitos:** Conocer el `executionId`.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/executions/<executionId>
  ```
* **Resultado Esperado:** Registro con timestamp de inicio, término, duración y metadata de resultado.
* **Fallos Posibles:** HTTP 404 si el ID no existe en la base de datos.
* **Diagnóstico:** Consultar la lista global de ejecuciones para validar el identificador exacto.

---

### Procedimiento 08: Inspeccionar el Flujo de Eventos Durables (EventStore)
* **Objetivo:** Auditar la secuencia cronológica inmutable de eventos de dominio persistidos en SQLite.
* **Prerrequisitos:** Plataforma en ejecución.
* **Comandos:**
  Navegar a **Flujo de Eventos** en la SPA o API:
  ```powershell
  curl -s "http://127.0.0.1:3000/api/v1/events?limit=20"
  ```
* **Resultado Esperado:** Eventos ordenados por secuencia monótona con `eventType`, `aggregateId`, `occurredAt`.
* **Fallos Posibles:** Errores de paginación o filtros inválidos.
* **Diagnóstico:** Usar `reset-events-filter-btn` para limpiar criterios de búsqueda.

---

### Procedimiento 09: Revisar la Flota de Agentes de IA
* **Objetivo:** Verificar qué agentes están registrados, activos y qué herramientas tienen asignadas.
* **Prerrequisitos:** Plataforma activa.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/agents
  ```
* **Resultado Esperado:** Lista con `id`, `name`, `modelId`, `tools`, `status: "ACTIVE"`.
* **Fallos Posibles:** Agente en estado `INACTIVE` impidiendo el despacho de tareas.
* **Diagnóstico:** Activar el agente mediante la SPA o invocando `POST /api/v1/agents/:id/activate`.

---

### Procedimiento 10: Revisar y Configurar Modelos de Lenguaje
* **Objetivo:** Auditar los conectores de modelos LLM disponibles.
* **Prerrequisitos:** Plataforma activa.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/models
  ```
* **Resultado Esperado:** Modelos registrados (OpenAI, Claude, Ollama, Stub) con indicación de disponibilidad.
* **Fallos Posibles:** Modelo no configurado por falta de API Key en `.env`.
* **Diagnóstico:** Revisar variables de entorno `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

---

### Procedimiento 11: Revisar el Registro de Herramientas y Capacidades
* **Objetivo:** Asegurar que las herramientas operacionales están disponibles y sus esquemas son válidos.
* **Prerrequisitos:** Plataforma activa.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/tools
  ```
* **Resultado Esperado:** Lista de herramientas con categoría, nivel de riesgo y esquema de parámetros JSON.
* **Fallos Posibles:** Herramienta rechazada por conflicto de versión o duplicidad.
* **Diagnóstico:** Inspeccionar logs del `ToolRegistry` al momento de arranque.

---

### Procedimiento 12: Revisar Inquilinos (Tenants) y Cuotas de Consumo
* **Objetivo:** Controlar el uso de tokens y presupuesto de operaciones por organización.
* **Prerrequisitos:** Plataforma activa.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/tenants
  ```
* **Resultado Esperado:** Lista de inquilinos con cuota mensual, tokens consumidos y estado.
* **Fallos Posibles:** Peticiones rechazadas por `QuotaExceededError`.
* **Diagnóstico:** Aumentar la cuota asignada al tenant mediante la consola o API.

---

### Procedimiento 13: Auditar la Postura de Seguridad y Políticas RBAC
* **Objetivo:** Verificar que las políticas de seguridad *default-deny* están activas y bloqueando accesos no autorizados.
* **Prerrequisitos:** Plataforma en ejecución.
* **Comandos:**
  ```powershell
  curl -s -X POST http://127.0.0.1:3000/api/v1/tasks -H "Content-Type: application/json" -d "{\"agentId\":\"unauthorized-agent\"}"
  ```
* **Resultado Esperado:** Respuesta HTTP 403 / 400 con código de error de política `POLICY_VIOLATION`.
* **Fallos Posibles:** Acceso permitido indebidamente (falla de seguridad crítica).
* **Diagnóstico:** Auditar la configuración de `PolicyGateway` en `src/infrastructure/policy/`.

---

### Procedimiento 14: Revisar el Registro de Dispositivos de Negocio
* **Objetivo:** Enumerar el hardware empresarial conectado al host.
* **Prerrequisitos:** Plataforma en ejecución.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/devices
  ```
* **Resultado Esperado:** Lista de dispositivos de negocio con su `deviceId`, `vendor`, `model`, `status`.
* **Fallos Posibles:** Lista vacía si no hay hardware conectado o controladores no detectados.
* **Diagnóstico:** Verificar conexión física USB en la máquina host.

---

### Procedimiento 15: Inspeccionar la Impresora Brother Conectada
* **Objetivo:** Verificar el estado técnico y capacidades del adaptador de impresora Brother.
* **Prerrequisitos:** Conexión local al host.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/devices/brother-dcp1600-usb
  ```
* **Resultado Esperado:** Dispositivo `Brother DCP-1600 series`, puerto `USB001`, estado `WorkOffline` / Fuera de línea.
* **Fallos Posibles:** `device not found` si el adaptador no fue registrado en el arranque.
* **Diagnóstico:** Revisar inicialización de `BrotherPrinterAdapter` en `composition.ts`.

---

### Procedimiento 16: Ejecutar una Impresión de Prueba
* **Objetivo:** Enviar un documento sintético a la cola de impresión para validar el spooler local.
* **Prerrequisitos:** Adaptador Brother registrado.
* **Comandos:**
  ```powershell
  curl -s -X POST http://127.0.0.1:3000/api/v1/devices/brother-dcp1600-usb/print -H "Content-Type: application/json" -d "{\"documentType\":\"RECEIPT\",\"content\":\"PRUEBA OPERACIONAL\"}"
  ```
* **Resultado Esperado:** Creación exitosa del `PrintJob` con `jobId` y estado `QUEUED`.
* **Fallos Posibles:** Error `DEVICE_OFFLINE` si la política requiere hardware en línea inmediato.
* **Diagnóstico:** Revisar la cola de trabajos en la pestaña **Dispositivos & Impresión** de la SPA.

---

### Procedimiento 17: Investigar y Diagnosticar un PrintJob Fallido
* **Objetivo:** Determinar la causa raíz del fallo en una orden de impresión.
* **Prerrequisitos:** Conocer el `jobId` fallido.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/devices/jobs/<jobId>
  ```
* **Resultado Esperado:** Detalle del trabajo con `status: "FAILED"`, `failureReason` y código de error.
* **Fallos Posibles:** Información insuficiente si el controlador nativo de Windows no reportó el motivo.
* **Diagnóstico:** Abrir el panel de control de impresoras de Windows para verificar atascos de papel o falta de conexión.

---

### Procedimiento 18: Ejecutar Diagnósticos y Pruebas Profundas de Runtime
* **Objetivo:** Realizar un escaneo completo de coherencia relacional y estado del sistema.
* **Prerrequisitos:** Plataforma en ejecución.
* **Comandos:**
  ```powershell
  curl -s http://127.0.0.1:3000/api/v1/diagnostics/probes
  ```
* **Resultado Esperado:** Puntuación de integridad al 100%, 0 tareas huérfanas, 0 transiciones ilegales.
* **Fallos Posibles:** Detección de inconsistencias entre memoria y SQLite.
* **Diagnóstico:** Ejecutar el reconciliador de estado (`state-reconciler.ts`).

---

### Procedimiento 19: Apagado Ordenado del Servidor (Graceful Shutdown)
* **Objetivo:** Detener la plataforma sin pérdida de tareas en vuelo y cerrando SQLite limpiamente.
* **Prerrequisitos:** Acceso al proceso o terminal.
* **Comandos:**
  Presionar `Ctrl + C` en la consola de ejecución o enviar señal `SIGTERM` / `SIGINT`:
  ```powershell
  taskkill /PID <pid> /T
  ```
* **Resultado Esperado:** Logs de apagado ordenado:
  * Cancelación o culminación de tareas activas.
  * Flush y cierre de la base de datos SQLite WAL.
  * Liberación de puertos y sockets HTTP.
  * Proceso finaliza con código de salida `0`.
* **Fallos Posibles:** Proceso colgado por sockets abiertos de LLM remotos.
* **Diagnóstico:** El timeout forzado del servidor garantiza cierre definitivo en máximo 5 segundos.

---

### Procedimiento 20: Gobernanza, Rotación y Revocación de Credenciales API
* **Objetivo:** Emitir, rotar y revocar credenciales de acceso API con almacenamiento zero-plaintext.
* **Prerrequisitos:** Plataforma en ejecución y credencial administrativa.
* **Comandos:**
  ```powershell
  # 1. Crear credencial delimitada
  curl -s -X POST http://127.0.0.1:3000/api/v1/credentials `
    -H "Authorization: Bearer <ADMIN_KEY>" `
    -H "Content-Type: application/json" `
    -d '{"principalId":"service-worker","principalType":"SERVICE","tenantId":"tenant-primary","name":"Worker Sincronizador","scopes":["tasks.read","tasks.create"]}'

  # 2. Rotar credencial (genera nueva rawKey y mantiene historial)
  curl -s -X POST http://127.0.0.1:3000/api/v1/credentials/<credentialId>/rotate `
    -H "Authorization: Bearer <ADMIN_KEY>"

  # 3. Revocar credencial
  curl -s -X POST http://127.0.0.1:3000/api/v1/credentials/<credentialId>/revoke `
    -H "Authorization: Bearer <ADMIN_KEY>" `
    -H "Content-Type: application/json" `
    -d '{"reason":"Revocación por rotación de personal"}'
  ```
* **Resultado Esperado:** Clave en crudo (`rawKey`) devuelta estrictamente una vez; consultas posteriores en base de datos SQLite retornan únicamente `keyPrefix` y `keyHash` SHA-256.
* **Fallos Posibles:** `TENANT_MISMATCH` si la credencial pertenece a otro inquilino no autorizado.
* **Diagnóstico:** Comprobar la cabecera `X-Tenant-Id` y los scopes asignados en el panel `#tab-security` de la consola Web.

