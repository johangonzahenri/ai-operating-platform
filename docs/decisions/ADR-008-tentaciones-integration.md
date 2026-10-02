# ADR-008: Integración Tentaciones AI Commerce

## Estado
ACEPTADA

## Contexto
Tentaciones AI Commerce es la implementación de referencia principal que demuestra capacidades externas de IA (descubrimiento de catálogo, recomendación, comparación, asistencia de carrito).

## Decisión
Integrar Tentaciones a través de `TentacionesPlatformAdapter` utilizando claves API autenticadas y solicitudes con alcance de capacidad. Tentaciones es dueño de su catálogo y carrito; la Plataforma es dueña de la orquestación de IA y la evaluación de intención.

## Alternativas Consideradas
- Integrar el catálogo de comercio electrónico directamente en el Core Engine: rechazado como violación fundamental de la separación.

## Consecuencias
- Cero alucinación de inventario o precio.
- Degradación elegante a comercio tradicional cuando la plataforma está desconectada.
