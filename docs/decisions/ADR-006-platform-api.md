# ADR-006: API Unificada de Plataforma v1 y SDK Cliente

## Estado
ACEPTADA

## Contexto
La Web Console y las aplicaciones externas necesitan una superficie HTTP estandarizada y versionada con soporte de SDK cliente.

## Decisión
Exponer endpoints canónicos `/api/v1/*` (con rutas de compatibilidad `/api/platform/v1/*`) impulsados por `PlatformService` y consumidos a través de `@ai-platform/client` tipado (`PlatformClient`).

## Alternativas Consideradas
- Endpoints RPC ad-hoc: rechazados por falta de estandarización.
- GraphQL: rechazado para mantener un contrato REST ligero.

## Consecuencias
- Separación limpia cliente-servidor.
- Esquemas de error uniformes (código, mensaje, estado).
