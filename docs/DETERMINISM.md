# Determinismo en AI Operating Platform

## Definición

> **"Determinismo de reglas, estados, gobernanza y línea base automatizada. NO afirmamos determinismo de las inferencias reales del LLM."**

## Qué ES Determinista
- Transiciones de la máquina de estados (Task, Execution, Operation)
- Evaluación de políticas (fail-closed, siempre DENY o ALLOW)
- Aplicación de presupuesto (contadores atómicos, OCC)
- Emisión de eventos (solo adición, inmutable)
- Reconciliación de recuperación (idempotente)
- Aplicación de lista blanca de herramientas (whitelist)
- Límites de aislamiento de memoria
- Límites de aislamiento de inquilinos (Tenant isolation)

## Qué NO es Determinista
- Salidas de inferencia del LLM (varían por proveedor, modelo, temperatura, contexto)
- Salidas del planificador del LLM (las propuestas varían por invocación)
- Respuestas de herramientas externas (latencia de red, disponibilidad)
- Precios del proveedor (cambian con el tiempo)

## Evidencia
- 1431+ pruebas automatizadas verifican el comportamiento determinista de la plataforma
- StubModelGateway proporciona dobles de prueba deterministas
- Todas las transiciones de estado se prueban con aserciones exactas

## Implicación para la Documentación
Cuando decimos "determinista" en este proyecto, nos referimos a que las REGLAS DE LA PLATAFORMA son deterministas.
Nunca afirmamos que las salidas del modelo de IA sean deterministas.
