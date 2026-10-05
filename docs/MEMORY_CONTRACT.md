# Contrato de Memoria v0.1

La memoria almacena información seleccionada que es retenida intencionalmente más allá de una ejecución. Está separada del `TaskContext`, `ModelRequest.messages`, observaciones de ejecución y el EventStore.

El contrato actual es:

- `MemoryGateway.store(item)` para escrituras;
- `MemoryGateway.retrieve(scope, key)` para lecturas exactas;
- `MemoryGateway.retrieveMany({ scope, key?, limit })` para lecturas limitadas;
- `MemoryGateway.delete(scope, key)` para eliminación.

El adaptador en memoria (in-memory adapter) admite la recuperación determinista ordenada por el `updatedAt` más reciente, luego por clave, y nunca devuelve más del límite solicitado (máximo 100). Los valores y metadatos están limitados recursivamente y redactan claves sensibles antes del almacenamiento. Los eventos de memoria exponen identificadores y metadatos de alcance/clave (scope/key), no los valores en bruto (raw values).

El tiempo de ejecución actual utiliza solo memoria con alcance de agente. La memoria permanece en memoria; no hay tabla de memoria de SQLite, recuperación semántica, vector store o un segundo EventStore. `MemoryService` es el límite de aplicación para escrituras, lecturas y eliminaciones en tiempo de ejecución. El acceso en tiempo de ejecución requiere una identidad de agente; la política de composición permite el alcance declarado por el agente, mientras que los llamadores pueden inyectar políticas más estrictas para las reglas de propiedad. La inyección directa en el gateway sigue siendo compatible para las pruebas de adaptadores existentes.

`store` es un upsert por `scope + key`: las actualizaciones conservan el `id` y `createdAt` existentes, y avanzan `updatedAt`. La eliminación remueve el elemento inmediatamente del gateway; el evento de eliminación permanece solo como metadato de auditoría operativa.
Cuando una ejecución de agente recupera memoria, el valor limitado seleccionado se coloca en `TaskContext.suppliedContext`. No se agrega como una entrada paralela del modelo y no duplica `ModelRequest.messages`.
