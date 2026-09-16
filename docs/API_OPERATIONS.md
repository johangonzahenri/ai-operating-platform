# API Operations & Workflow Guide (Guía de Operaciones de API)
## Flujos de Trabajo Típicos y Patrones de Interacción (v1.1.0)

Este documento detalla los flujos de interacción más comunes al consumir la Platform API.

---

## 1. Flujo de Ejecución de Tarea Estándar

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

## 2. Flujo de Cancelación Cooperativa

1. Si una tarea está en ejecución y el usuario o cliente decide abortarla, envía `POST /api/v1/tasks/:id/cancel`.
2. El `CoreRuntime` activa la señal de cancelación del contexto (`AbortSignal`).
3. La tarea interrumpe el ciclo entre turnos y transiciona limpiamente al estado `CANCELLED`.
4. Se emite el evento `task.cancelled` y se liberan todos los recursos asociados.
