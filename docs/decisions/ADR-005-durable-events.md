# ADR-005: Almacén de Eventos Duradero con SQLite WAL

## Estado
ACEPTADA

## Contexto
El razonamiento del agente, las decisiones de planificación, las ejecuciones de herramientas y las transiciones de estado deben ser persistentemente auditables y resilientes a través de los reinicios del proceso.

## Decisión
Implementar un `SqliteEventStore` de solo adición (*append-only*) respaldado por el modo SQLite WAL con números de secuencia monotónicos, correlación de agregados e identificadores de traza deterministas.

## Alternativas Consideradas
- Solo bus de eventos en memoria: rechazado porque la recuperación de caídas y las auditorías históricas son imposibles.
- Transmisión de eventos distribuida (Kafka/RabbitMQ): rechazada por el tamaño de la huella de ejecución local.

## Consecuencias
- Registro de auditoría completo e inmutable de todas las decisiones del sistema.
- Escrituras concurrentes de alto rendimiento bajo SQLite WAL.
