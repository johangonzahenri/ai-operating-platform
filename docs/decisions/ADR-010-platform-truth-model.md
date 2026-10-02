# ADR-010: Modelo de Verdad de Plataforma

## Estado
ACEPTADA

## Contexto
Las consolas web y la documentación a menudo tergiversan características simuladas o planificadas como infraestructura activa, perjudicando la credibilidad técnica.

## Decisión
Hacer cumplir un Modelo de Verdad estricto en todas las insignias de consola, APIs y documentación:
- Estados explícitos: IMPLEMENTED, PARTIAL, DESIGNED, PLANNED.
- Estados de ejecución explícitos: HEALTHY, OPERATIONAL, AVAILABLE, NOT_CONNECTED, OFFLINE, DEGRADED.
- Insignias de Fuente de Verdad claras (Platform API, Core Engine, Architecture Specification, External Integration).

## Alternativas Consideradas
- Estados binarios activo/inactivo: rechazados por ser engañosos.

## Consecuencias
- Credibilidad técnica no comprometida y total transparencia de auditoría.
