# API Operations & Workflow Guide (Guía de Operaciones de API)
## Flujos de Trabajo Típicos y Patrones de Interacción (v1.3.0)

Este documento detalla los flujos de interacción más comunes al consumir la Platform API.

---

## 1. Flujo de Autenticación y Gobernanza de Credenciales

```text
Cliente Externo                     Platform API Gateway                 ApiCredentialService
   │                                         │                                    │
   ├────── POST /api/v1/credentials ────────►│                                    │
   │       (Name, Principal, Scopes)         ├────── createCredential(...) ──────►│
   │                                         │                                    ├─ Genera entropy (256-bit)
   │                                         │                                    ├─ Computa SHA-256 hash
   │                                         │                                    ├─ Persiste en SQLite WAL
   │                                         │◄───── { credential, rawKey } ──────┤
   │◄───── 201 Created (one-time rawKey) ────┤                                    │
   │                                         │                                    │
   ├────── GET /api/v1/tasks ───────────────►│                                    │
   │       Authorization: Bearer <rawKey>    ├────── verifyCredential(...) ──────►│
   │                                         │       - timingSafeEqual(hash)      │
   │                                         │       - isExpired() / isRevoked()  │
   │                                         │◄───── { authenticated: true } ─────┤
   │                                         ├─ Reconcilia X-Tenant-Id            │
   │                                         ├─ Verifica scopes ('tasks.read')    │
   │◄───── 200 OK (Tasks List) ──────────────┤                                    │
```

---

## 2. Flujo de Rotación de Credenciales con Cero Tiempo de Inactividad

1. **Petición de Rotación**: El cliente o administrador envía `POST /api/v1/credentials/:id/rotate` indicando un `gracePeriodMs` (por ejemplo, 86400000 para 24 horas).
2. **Generación de Nueva Llave**: La plataforma genera una nueva credencial activa con su `rawKey` única y programa la expiración de la llave antigua al término del período de gracia.
3. **Migración Distribuida**: Los consumidores actualizan sus variables de entorno de forma distribuida sin interrupción del servicio.
4. **Expiración / Revocación Automática**: Al finalizar el período de gracia, la llave anterior queda `EXPIRED` de forma automática.

---

## 3. Flujo de Ejecución de Tarea Estándar

```text
Cliente                     Platform API                     CoreRuntime
   │                              │                               │
   ├────── POST /tasks ──────────►│                               │
   │                              ├───── Crea Task [QUEUED] ─────►│
   │◄───── 201 Created (taskId) ──┤                               │
   │                              │                               │
   ├────── POST /tasks/:id/exec ─►│                               │
   │                              ├───── Task [RUNNING] ─────────►│
   │                              │      Evalúa políticas         │
   │                              │      Invoca modelo LLM        │
   │                              │      Ejecuta tools seguras    │
   │                              │      Task [COMPLETED]         │
   │◄───── 200 OK (Execution) ────┤                               │
```

---

## 4. Flujo de Cancelación Cooperativa

1. Si una tarea está en ejecución y el usuario o cliente decide abortarla, envía `POST /api/v1/tasks/:id/cancel`.
2. El `CoreRuntime` activa la señal de cancelación del contexto (`AbortSignal`).
3. La tarea interrumpe el ciclo entre turnos y transiciona limpiamente al estado `CANCELLED`.
4. Se emite el evento `task.cancelled` y se liberan todos los recursos asociados.
