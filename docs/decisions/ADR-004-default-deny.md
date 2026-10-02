# ADR-004: Autorización Default-Deny

## Estado
ACEPTADA

## Contexto
Las aplicaciones externas y los invocadores solo deben acceder a las capacidades y herramientas permitidas explícitamente.

## Decisión
Aplicar *default-deny* (denegación por defecto) en toda la plataforma:
- Las aplicaciones deben registrarse con una lista explícita de `allowedCapabilities`.
- Las operaciones no registradas o las solicitudes no autenticadas fallan inmediatamente con 401 No Autorizado o 403 Prohibido.
- Las invocaciones de herramientas requieren permisos RBAC explícitos y puertas de aprobación para niveles de riesgo críticos.

## Alternativas Consideradas
- Predeterminado permisivo con lista negra: rechazado debido al riesgo de seguridad por omisión.

## Consecuencias
- Perímetro de seguridad predecible y auditable.
- Comportamiento *fail-closed* en todas las acciones no reconocidas.
