# Autorización de Capacidades Empresariales y Evaluación de Scopes (`AOP-AUTH-02`)

## 1. Visión General y Jerarquía de Scopes

La autorización en la **AI Operating Platform (AOP)** aplica comprobaciones de capacidad de grano fino en cada capa de ejecución de peticiones. Una credencial o token no otorga acceso universal; está restringida por scopes de capacidad explícitos.

```mermaid
flowchart TD
    Cred["ApiCredential / Principal<br>Scopes: [\"tasks.create\", \"devices.print\"]"]
    Eval["Evaluador de Scopes y Coincidencia de Comodines<br>- Exacto: \"tasks.create\" == \"tasks.create\"<br>- Comodín de dominio: \"tasks.*\"<br>- Raíz global: \"*\""]
    RBAC["Evaluador RBAC Multi-Nivel<br>- Aislamiento de tenant y límites de suscripción<br>- Mapeo de roles de recursos (SERVICE, OPERATOR)"]
    Ok["200 / 201 OK"]
    Fail["403 INSUFFICIENT_SCOPE"]

    Cred --> Eval
    Eval --> RBAC
    RBAC --> Ok
    RBAC --> Fail
```

---

## 2. Catálogo Estándar de Scopes de la Plataforma

| Scope | Categoría | Descripción | Endpoints Permitidos |
| :--- | :--- | :--- | :--- |
| `tasks.read` | Tareas | Consultar e inspeccionar el estado y progreso de tareas | `GET /api/v1/tasks`, `GET /api/v1/tasks/:id` |
| `tasks.create` | Tareas | Despachar nuevas ejecuciones de tareas | `POST /api/v1/tasks`, `POST /api/v1/tasks/:id/execute` |
| `tasks.cancel` | Tareas | Cancelar ejecuciones de tareas activas | `POST /api/v1/tasks/:id/cancel` |
| `executions.read` | Telemetría | Inspeccionar registros de ejecución y líneas de tiempo | `GET /api/v1/executions`, `GET /api/v1/executions/:id` |
| `events.read` | Observabilidad | Consultar el log de eventos durables y flujos de trazas | `GET /api/v1/events`, `GET /api/v1/events/:id` |
| `devices.read` | Hardware | Inspeccionar hardware de negocio registrado | `GET /api/v1/devices`, `GET /api/v1/devices/:id` |
| `devices.print` | Hardware | Despachar trabajos de impresión físicos | `POST /api/v1/devices/:id/print`, `POST /api/v1/printing/jobs` |
| `autonomous.operations.execute` | Autonomía | Desencadenar o ejecutar ciclos autónomos | `POST /api/v1/operations`, `POST /api/v1/autonomous/*` |
| `credentials.read` | Seguridad | Inspeccionar metadatos de credenciales no sensibles | `GET /api/v1/credentials`, `GET /api/v1/credentials/:id` |
| `credentials.manage` | Seguridad | Generar, rotar, revocar o eliminar claves | `POST /api/v1/credentials`, `POST /api/v1/credentials/:id/*` |
| `workflows.read` | Orquestación | Leer definiciones e instancias de flujos de trabajo | `GET /api/v1/workflows/*` |
| `workflows.create` | Orquestación | Definir y ejecutar flujos de trabajo estructurados | `POST /api/v1/workflows/*` |
| `solutions.read` | Soluciones | Leer planos e instancias de soluciones | `GET /api/v1/solutions/*` |
| `solutions.manage` | Soluciones | Publicar, instanciar o archivar soluciones | `POST /api/v1/solutions/*` |
| `*` | Superusuario | Scope sin restricciones para claves administrativas | Todos los endpoints de la plataforma |

---

## 3. Reglas de Evaluación de Scopes con Comodines

Los scopes soportan coincidencia jerárquica con comodines:
1. `*`: Otorga autoridad en todas las acciones y recursos.
2. `<domain>.*`: (ej. `tasks.*`) Otorga todas las acciones bajo el dominio `tasks` (`tasks.read`, `tasks.create`, `tasks.cancel`).
3. `<domain>.<subdomain>.*`: (ej. `autonomous.operations.*`) Otorga autoridad en sub-operaciones.
4. Coincidencia exacta: (ej. `devices.print`) Otorga estrictamente la capacidad declarada.

---

## 4. Aislamiento Multi-Tenant y Default-Deny

- Toda evaluación se ejecuta bajo **Default-Deny**: si ninguna política o scope explícito permite la acción, el gateway devuelve `403 FORBIDDEN` (`INSUFFICIENT_SCOPE` o `ACCESS_DENIED`).
- El consumo de capacidades entre tenants está estrictamente prevenido. Una credencial emitida para `tenant-tentaciones` no puede invocar capacidades o consultar recursos que residen en `tenant-automotive`.
