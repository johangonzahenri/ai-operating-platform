# AOP-V1-EXIT — Criterios de Salida a Producción v1.4

## Resumen Ejecutivo
Clasificación: CERTIFIED WITH OPEN GAPS
Versión: 1.4.0
Línea base: 1431+ pruebas PASS, 0 FAIL, 0 dependencias en tiempo de ejecución

## Matriz de Criterios

| ID | Dimensión | Objetivo | Métrica | Evidencia | Estado |
|:---|:---|:---|:---|:---|:---|
| EXIT-01 | Disponibilidad | Prueba de preparación HTTP operativa | /api/v1/health/ready retorna 200 | tests/platform/api.test.ts | VERIFIED |
| EXIT-02 | Latencia | Arranque en frío < 50ms, P95 < 200ms | Mediciones de benchmark | tests/benchmarks/ | PARTIAL |
| EXIT-03 | Rendimiento | Línea base de req/s documentada | Resultados de pruebas de carga | DESIGNED - no hay prueba de carga formal aún | DESIGNED |
| EXIT-04 | Errores | Contrato de error unificado en todos los endpoints | { type, title, status, code, traceId, details } | error-contract.ts | PARTIAL |
| EXIT-05 | Seguridad | RBAC fail-closed, JWT/JWKS, CSP, 0 innerHTML | Suite de pruebas de seguridad | 118+ pruebas | VERIFIED |
| EXIT-06 | Aislamiento de Inquilinos | Denegación entre inquilinos con CrossTenantOrganizationError | Pruebas de aislamiento | organization-domain.test.ts | VERIFIED |
| EXIT-07 | Persistencia | SQLite WAL, transacciones ACID, OCC | Suite de pruebas de persistencia | 148+ pruebas | VERIFIED |
| EXIT-08 | Respaldo | Copia de archivo SQLite durante checkpoint WAL | Procedimiento documentado | MANUAL_OPERACIONAL | PARTIAL |
| EXIT-09 | Restauración | Restauración de archivo SQLite desde respaldo | Procedimiento documentado | MANUAL_OPERACIONAL | PARTIAL |
| EXIT-10 | RPO | < 1 minuto (intervalo de checkpoint WAL) | Documentación de SQLite WAL | DESIGNED |
| EXIT-11 | RTO | < 30 segundos (arranque en frío + recuperación) | Tiempo de arranque de RestartRecoveryService | PARTIAL |
| EXIT-12 | Recuperación | Reconciliación atómica idempotente ante caídas | Pruebas de RestartRecoveryService | 42+ pruebas | VERIFIED |
| EXIT-13 | Fallos de Proveedor | Circuit breaker + respaldo stub | Pruebas de fallos de proveedor | circuit-breaker.ts + pruebas | PARTIAL |
| EXIT-14 | Observabilidad | EventStore + trazas OTel + métricas Prometheus | Suite de pruebas de observabilidad | 123+ pruebas | VERIFIED |
| EXIT-15 | Auditoría | SQLite de solo adición con correlación traceId | Pruebas de consulta de auditoría | sqlite-event-store.test.ts | VERIFIED |
| EXIT-16 | Costo | Consumo de tokens rastreado por ejecución | Contadores de presupuesto consumido | team-resource-budget.test.ts | PARTIAL |
| EXIT-17 | Pruebas | Unitaria + Contrato + Integración + Plataforma | 1431+ pruebas / 174 suites | scripts/test.js | VERIFIED |
| EXIT-18 | Rollback | Procedimiento de reversión de versión documentado | Procedimiento documentado | DESIGNED |
| EXIT-19 | Respuesta a Incidentes | Runbooks para fallos críticos | 19 procedimientos | MANUAL_OPERACIONAL | PARTIAL |
| EXIT-20 | Determinismo | Las reglas y estados de la plataforma son deterministas; la inferencia LLM no lo es | Definición de determinismo | DETERMINISM.md | VERIFIED |

## Brechas Abiertas
- **GAP-INF-01**: La terminación TLS en vivo en el borde requiere aprovisionamiento en el host físico en la nube.
- **GAP-SEC-01**: La conexión de IdP en vivo OIDC/JWKS externa requiere configuración en la red de producción.

## Definiciones de Estado
- **VERIFIED**: Totalmente implementado y validado mediante pruebas automatizadas.
- **IMPLEMENTED**: Totalmente implementado en código, pero carece de cobertura completa de pruebas automatizadas o validación operativa.
- **PARTIAL**: Parcialmente implementado, pendiente de finalización o integración completa.
- **DESIGNED**: Arquitectura e interfaces definidas, pero implementación pendiente.
- **FUTURE**: Planificado para un ciclo de lanzamiento futuro; no hay trabajo activo actualmente.

## Procedimiento de Verificación
Ejecute la suite de pruebas automatizadas localmente para verificar la línea base:
```bash
npm run test
npm run docs:check
```
Asegure una tasa de éxito del 100% en todas las pruebas deterministas e invariantes de arquitectura antes del despliegue.
