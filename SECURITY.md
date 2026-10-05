# Política de Seguridad — AI Operating Platform

## Modelo de Seguridad
La AI Operating Platform implementa una arquitectura de defensa en profundidad de múltiples capas.
- **Aislamiento de Principal e Inquilino:** Cada solicitud está autenticada y vinculada a un `SecurityContext` inmutable con un `Principal` y un `tenantId` verificados.
- **Control de Acceso Default-Deny:** Las capacidades u operaciones no registradas fallan cerradas con 401 Unauthorized o 403 Forbidden.
- **Gobernanza de Ejecución de Herramientas:** Las herramientas requieren permisos explícitos. Tienen validación de esquema, protección contra prototype pollution y tokens de aprobación para operaciones críticas.
- **Pureza del DOM:** Las interfaces del Web Console emplean manipulación pura del DOM. Tienen cero uso de `innerHTML`, `outerHTML` o `eval()`.

## Reporte de Vulnerabilidades de Seguridad
Si descubres una vulnerabilidad de seguridad potencial, repórtala en privado a los mantenedores. No abras un issue público.
