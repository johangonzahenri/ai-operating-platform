# Observabilidad, Telemetría y Diagnóstico de Operaciones Autónomas

## 1. Visión General de la Telemetría de Runtime

La observabilidad de **Autonomous Operations Runtime** proporciona transparencia integral y determinista sobre cada ciclo ejecutado por la plataforma.

### Métricas Clave Monitoreadas en Tiempo Real
1. **Estado del Demonio (`Daemon State`)**: `STOPPED`, `RUNNING`, `PAUSED`, `SAFETY_HALTED`.
2. **Arrendamientos Activos (`Active Leases`)**: Contador de exclusiones mutuas distribuidas activas en el clúster o proceso local.
3. **Disparos del Circuit Breaker (`Circuit Breaker Trips`)**: Historial acumulado de activaciones del disyuntor de seguridad.
4. **Ciclos Ejecutados (`Executed Cycles`)**: Total de ciclos ejecutivos despachados de manera continua.
5. **Tiempo de Actividad (`Uptime`)**: Duración en segundos desde el inicio del demonio.

---

## 2. Flujo de Trazabilidad Forense de Eventos

Cada ciclo autónomo emite eventos de dominio inmutables que se persisten de forma secuencial en SQLite WAL:

```text
autonomous.runtime.started
    │
    ├── autonomous.trigger.fired (triggerId, enterpriseId, traceId)
    │     │
    │     ├── executive.cycle.started (cycleId, planId)
    │     │     │
    │     │     ├── execution.step.evaluated (stepId, modelCalls, toolCalls)
    │     │     ├── verification.verdict.recorded (verdict: PASS | FAIL)
    │     │     └── governance.policy.audited (policyId, status: ALLOWED)
    │     │
    │     └── executive.cycle.completed (cycleId, durationMs, outcome)
    │
    └── autonomous.runtime.stopped
```

---

## 3. Diagnóstico de Incidentes y Recuperación ante Fallos

- **Reconciliación tras Reinicio (`CrashRecoveryService`)**: Si el servidor o nodo sufre una caída abrupta de energía o fallo de proceso, al reiniciar el servicio escanea los arrendamientos expirados y marca los ciclos interrumpidos con estado `FAILED_RECOVERED` de forma limpia y predecible.
- **Auditoría de Inyección y Seguridad**: La plataforma verifica automáticamente en cada compilación y prueba que la interfaz Web Control Plane mantenga **0 asignaciones de `.innerHTML`**, garantizando protección contra inyecciones XSS.
