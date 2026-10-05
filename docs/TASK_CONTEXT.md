# Contexto de Tarea (Task Context)

La capa del Contexto de Tarea (Task Context) es una instantánea (snapshot) de alcance de ejecución y neutral respecto al proveedor, utilizada para dar a los planificadores y rondas del modelo el contexto limitado que necesitan para una tarea.

No es memoria persistente, un almacén de eventos (event store) o un reemplazo del estado de ejecución operativa. Se construye en memoria y contiene solo:

- identificadores de correlación de tareas y ejecuciones;
- metadatos seguros de la tarea y objetivo;
- ronda y herramienta de ejecución actual;
- mensajes de modelo y observaciones de herramientas limitadas;
- contexto provisto y resúmenes de ejecución.

El `TaskContext` aplica límites configurables para el recuento de mensajes y observaciones, la longitud de las cadenas, la profundidad de los objetos y las claves de los objetos. Las claves sensibles se redactan recursivamente antes de pasar la instantánea a un planificador o gateway de modelo. Los mensajes y las observaciones se retienen de las entradas más recientes cuando se excede un límite, y la instantánea expone una bandera `truncated` más recuentos.

El contexto es neutral al proveedor. Los adaptadores de proveedores continúan serializando `ModelMessage` y las solicitudes de modelo de manera independiente; ningún formato específico del proveedor se almacena en `TaskContext`. Las rondas del modelo de agente mantienen `ModelRequest.messages` como el historial de mensajes canónico y pasan una instantánea de contexto sin duplicar esos mensajes; los planificadores pueden solicitar la instantánea limitada completa.
