# Proyección de Observabilidad de Ejecución

La observabilidad de ejecución es una proyección de solo lectura en el límite de la API de Plataforma (Platform API) existente. El estado de ejecución de Core y los eventos del ciclo de vida auditados siguen siendo la única fuente de la verdad; la proyección no ejecuta herramientas, no autoriza solicitudes ni crea un segundo repositorio/almacén de eventos (EventStore).

## Origen y contrato

`PlatformService` proyecta los metadatos de ejecución y la línea de tiempo de auditoría de ejecución en el `ExecutionDTO` existente devuelto por:

- `GET /api/platform/v1/executions/:executionId`
- `GET /api/platform/v1/executions/:executionId/events`

Los campos opcionales incluyen proveedor, modelo, ronda/herramienta actual, conteos, errores, actividad actual, duración, resultado final y observaciones de llamadas a herramientas correlacionadas. Las ejecuciones más antiguas siguen siendo válidas porque todos los campos nuevos son opcionales.

## Ciclo de vida de la herramienta

El tiempo de ejecución (runtime) ya emite eventos de solicitud, autorización, rechazo, resultado devuelto, falla de modelo y respuesta final. La proyección correlaciona cada llamada por `toolCallId`, mantiene `toolName` y la ronda, deriva la duración a partir de las marcas de tiempo (timestamps) de los eventos y reporta `REQUESTED`, `AUTHORIZED`, `REJECTED`, `COMPLETED` o `FAILED`. Los argumentos y resultados de las herramientas pasan por una redacción recursiva limitada para las claves de tipo credencial antes de entrar en el DTO.

## Actividad actual y duración

La actividad se deriva del último evento real del modelo/herramienta/ejecución, con `Unknown` cuando no es posible una inferencia segura. La duración es `completedAt - startedAt`, o `now - startedAt` para una ejecución en curso. No se utiliza ningún temporizador visual como fuente de la verdad.

## Consola y seguridad

La Consola de Inteligencia Operativa (Operational Intelligence Console) consume estos campos a través de los endpoints de la plataforma existentes. Renderiza los valores ausentes como `Not reported` (No reportado) y utiliza APIs de texto DOM seguras. Las claves de proveedor, encabezados de autorización, cookies, valores de entorno y credenciales internas no se exponen al navegador.

## Validación y límites

Las pruebas deterministas cubren la ausencia de proveedor/modelo, el estado del ciclo de vida, la correlación de llamadas, la duración, el resultado final, la redacción, el contrato de la consola y la compatibilidad con versiones anteriores. El streaming, la migración histórica de ejecuciones antiguas y una prueba de humo (smoke test) de proveedor en vivo están fuera de este hito.
