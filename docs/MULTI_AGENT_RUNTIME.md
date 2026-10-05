# Tiempo de Ejecución de Coordinación Multi-Agente v0.1

## 1. Visión General

La plataforma proporciona un servicio de aplicación de coordinación limitado y determinista para el caso de uso canónico de diagnóstico de operaciones:

```text
Agente de Diagnóstico -> Agente de Decisión -> Agente de Ejecución -> Agente de Verificación
```

`MultiAgentCoordinator` es la única autoridad que coordina y secuencia a los agentes. Los agentes nunca se invocan directamente entre sí, no generan agentes secundarios ni crean instancias recursivas de coordinadores. Cada paso se ejecuta a través del `Runtime` existente (`CoreRuntime`), que sigue siendo el único propietario de cada ciclo de vida de `Task` y `Execution` secundario.

## 2. Arquitectura y Flujo Reforzados

```text
Solicitud de Coordinación
    ↓
Coordinador Valida (Agentes, Roles, Presupuestos, Profundidad)
    ↓
Para cada paso:
  - Verificar Tiempo de Espera y Cancelación
  - Búsqueda de Agente (Estado activo)
  - Autorización de Política (`coordination.execute`)
  - Publicar `coordination.agent.selected`
  - Crear Tarea secundaria y Ejecutar a través de CoreRuntime
  - Publicar `coordination.agent.completed` / `failed`
  - Si el paso es VERIFICATION (VERIFICACIÓN):
      - Evaluar el veredicto de verificación independiente (PASS / FAIL)
  - Si existe el siguiente paso:
      - Validar Agente Objetivo y Presupuesto de Traspaso (Handoff)
      - Crear `AgentHandoff` Limitado y Sanitizado
      - Publicar `coordination.handoff.requested` / `accepted` (o `rejected`)
    ↓
Agregación Determinista
    ↓
Publicar `coordination.completed` / `coordination.failed`
```

## 3. Semántica Estricta de Verificación

El coordinador **nunca** fuerza o fabrica `verified: true` a partir de la simple finalización de la ejecución.
El Agente de Verificación debe devolver una estructura de veredicto explícita:

```json
{
  "status": "PASS",
  "verified": true,
  "reason": "Todos los chequeos de salud y métricas dentro de parámetros normales",
  "evidence": { "latencyMs": 12, "errorRate": 0 }
}
```

Reglas de Evaluación de Veredicto:
- `PASS` / `verified: true` (sin conflicto) -> Evalúa a PASS -> La coordinación finaliza con `COMPLETED`.
- `FAIL` / `verified: false` -> Evalúa a FAIL -> La coordinación finaliza con `FAILED` (`VERIFICATION_FAILED`).
- Veredicto faltante -> Falla seguro (Fails closed) con `VERIFICATION_MISSING`.
- Salida malformada -> Falla seguro con `VERIFICATION_MALFORMED`.
- Veredicto conflictivo (ej. `status: "PASS"` + `verified: false`) -> Falla seguro con `VERIFICATION_CONFLICT`.
- Veredicto ambiguo -> Falla seguro con `VERIFICATION_AMBIGUOUS`.

## 4. Límites y Restricciones Reforzados

| Parámetro | Límite | Cumplimiento |
|---|---|---|
| `maxAgents` | 4 | Aplicado en `CoordinationRequest.create` y contador de ejecución `agentsExecuted` |
| `maxHandoffs` | 3 | Aplicado en `CoordinationRequest.create` y contador de ejecución `handoffsCreated` |
| `maxDepth` | 1 | Aplicado en `CoordinationRequest.create` (profundidad < 1) y verificación de ejecución |
| `data.maxStringLength` | 2048 caracteres | Truncado con `[truncated]` |
| `data.maxDepth` | 4 niveles | Truncado con `[truncated]` |
| `data.maxObjectKeys` | 64 claves | Truncado |
| Campos sensibles | Automático | Redactado con `[redacted]` |

## 5. Matriz de Estado de Implementación

### IMPLEMENTADO
- Flujo de trabajo secuencial canónico de 4 agentes (`DIAGNOSTIC` -> `DECISION` -> `EXECUTION` -> `VERIFICATION`)
- `MultiAgentCoordinator` reforzado con contadores de presupuesto en tiempo de ejecución (`agentsExecuted`, `handoffsCreated`, `coordinationDepth`)
- Semántica estricta de verificación con evaluación independiente de veredicto y detección de conflictos
- Validación de agentes con fallo seguro (fail-closed) (desconocido, inactivo, duplicado, roles inválidos)
- Evaluación de política antes de cada paso con denegación de cierre seguro (`POLICY_DENIED`)
- Cargas útiles de `AgentHandoff` limitadas, sanitizadas e inmutables
- Aislamiento de contexto y memoria entre agentes
- Publicación exhaustiva de eventos de dominio (`coordination.started`, `agent.selected`, `handoff.requested`, `handoff.accepted`, `handoff.rejected`, `agent.completed`, `agent.failed`, `completed`, `failed`)
- Aplicación de tiempo de espera y cancelación a nivel de solicitud
- Lógica de agregación determinista
- 40 pruebas unitarias que cubren la matriz de pruebas completa

### NO IMPLEMENTADO / LIMITACIONES
- **DURABILIDAD DEL ESTADO DE COORDINACIÓN: AÚN NO IMPLEMENTADO**
  - Las entidades secundarias `Task` y `Execution` son duraderas y recuperables a través de SQLite y CoreRuntime.
  - El estado de `CoordinationRequest` y `CoordinationResult` de nivel superior está en memoria y es efímero.
- **RECUPERACIÓN AUTOMÁTICA PARA SESIONES DE COORDINACIÓN: AÚN NO IMPLEMENTADO**
  - Si el proceso anfitrión falla a mitad de la coordinación, las tareas secundarias individuales se reconcilian a través de `RestartRecoveryService`, pero la coordinación de nivel superior no se reanuda automáticamente.
- **COORDINACIÓN MULTI-HOST DISTRIBUIDA: AÚN NO IMPLEMENTADO** (Se ejecuta en proceso a través de CoreRuntime)

### FUTURO
- Repositorio duradero de Solicitudes/Sesiones de Coordinación
- Enrutamiento dinámico de agentes impulsado por políticas
- Coordinación de ramas en paralelo (una vez autorizada por la revisión de arquitectura)
