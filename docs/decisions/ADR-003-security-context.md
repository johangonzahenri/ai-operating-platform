# ADR-003: SecurityContext e Identificación de Principal Confiable

## Estado
ACEPTADA

## Contexto
Las operaciones multi-inquilino y multi-rol requieren la identificación de un principal confiable sin manipulación por parte del invocador ni escalada de permisos.

## Decisión
Implementar un SecurityContext inmutable que contenga un Principal verificado (USER, SERVICE, SYSTEM, ANONYMOUS), roles, vinculación de inquilino e identificadores de correlación. Todas las comprobaciones de límites de seguridad evalúan contra este contexto fallando cerrado (*fail-closed*).

## Alternativas Consideradas
- Pasar encabezados HTTP crudos directamente a los manejadores de dominio: rechazado por ser inseguro y no verificado.

## Consecuencias
- Previene fugas entre inquilinos y escalada de privilegios.
- Trazabilidad completa de las identidades de los invocadores en los registros de auditoría.
