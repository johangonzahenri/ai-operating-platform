# ADR 0047: Trazabilidad de Autorización y RBAC Persistente

## Estado
Aceptado

## Contexto
El modelo actual de control de acceso basado en roles (RBAC) dependía de un repositorio en memoria (`InMemoryRoleRepository`). A medida que la plataforma (AI Operating Platform) evoluciona hacia una arquitectura multi-tenant y se introducen operaciones de mayor riesgo, mantener roles en memoria limita la flexibilidad, escalabilidad y persistencia a largo plazo.

Además, en el ecosistema actual, no existía una traza unificada que capturara el contexto completo de una decisión de seguridad (Quién, En qué tenant, Sobre qué recurso, Con qué políticas y presupuesto). Esto dificulta las auditorías, la depuración y la observabilidad.

## Decisiones
1. **Implementar `SqliteRoleRepository`**: Reemplazar la gestión en memoria de roles por un almacenamiento persistente basado en SQLite. El repositorio gestiona tablas separadas para `roles` y `role_assignments`, aplicando aislamiento mediante `tenant_id`.
2. **Definir `AuthorizationTrace`**: Introducir una interfaz que represente el registro auditable de cada decisión de seguridad. Este registro debe ser exhaustivo y responder las preguntas clave (Who, What, Why, Budget, Agent context).

## Consecuencias
- **Positivas**: 
  - Las asignaciones de roles son ahora duraderas y pueden modificarse en tiempo de ejecución de manera segura mediante transacciones atómicas.
  - El cumplimiento (compliance) y el monitoreo mejoran gracias a la introducción de `AuthorizationTrace`.
  - El diseño garantiza que las consultas de roles respeten siempre las fronteras de los tenants (tenant isolation).
- **Negativas**: 
  - La evaluación de autorización implica una lectura ligera en la base de datos (mitigable con caché en el futuro si hay presión).
  - Se añade complejidad operacional al esquema de base de datos.
