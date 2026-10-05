# Ejecución Autónoma Controlada

La ejecución autónoma preserva los límites de Core existentes:

* El LLM decide una llamada de herramienta estructurada.
* Core valida el esquema registrado.
* Policy autoriza la operación.
* `RegistryToolGateway` despacha la herramienta.
* El EventPublisher observa el ciclo de vida.
* La observación se envía de vuelta al gateway neutral respecto al proveedor.

Ningún proveedor puede mutar el registro, la política, el almacén de eventos (EventStore), las credenciales, el sistema de archivos o la base de datos. Las definiciones de herramientas se derivan de la lista de herramientas autorizadas del agente. El mismo `traceId`, `taskId` y `executionId` se retienen en todos los turnos.

Los límites de ejecución están centralizados en `execution-limits.ts` y se validan como enteros positivos finitos: `MAX_TOOL_CALLS`, `MAX_TOOL_ROUNDS` y `MAX_EXECUTION_TIME` (milisegundos). Los límites de tiempo de espera del modelo, de las herramientas y de la ejecución total están separados; las operaciones completadas borran sus temporizadores.

Tentaciones sigue siendo una aplicación externa. Su adaptador llama a la API de Plataforma (Platform API); el descubrimiento de productos y la propiedad del catálogo permanecen en Tentaciones.
