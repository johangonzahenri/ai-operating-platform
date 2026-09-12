# AI OPERATING PLATFORM - PROMPT 29 DELIVERY REPORT

## 1. Auditoría y arquitectura encontrada

El repositorio ya tenía el contrato `ModelGateway`, la jerarquía de errores,
`LLMPlanner`, Ollama y el `StubModelGateway`. OpenAI y Anthropic eran
implementaciones simuladas y la composición siempre usaba stub.

## 2. Implementación

- `ModelGateway` se mantiene como frontera provider-neutral.
- `ProviderFactory` selecciona `stub`, `openai`, `anthropic` u `ollama`.
- La configuración se centraliza en `model-provider-config.ts`.
- Stub continúa siendo el default seguro y determinista.
- OpenAI y Anthropic convierten requests/responses HTTP al contrato interno.
- Ollama conserva su integración local existente.
- Los providers soportan timeout configurable y errores normalizados.
- `LLMPlanner` se usa cuando el provider seleccionado no es stub; el planner
  continúa validando el plan y ejecutando policy preflight.
- Ningún provider ejecuta herramientas: el Core mantiene ToolGateway, policy y
  dispatcher bajo su control.

## 3. Seguridad

Las claves se leen únicamente en la composición backend. No se agregan a
outputs, DTOs, eventos, logs ni código cliente. Tentaciones continúa
consumiendo solo Platform API y no recibe credenciales de modelos.

## 4. Structured output y errores

OpenAI y Anthropic parsean respuestas JSON solicitadas y rechazan respuestas
vacías o inválidas como `MODEL_INVALID_RESPONSE`. HTTP 401/403, 429, 5xx,
errores de red y abortos se normalizan a la jerarquía `ModelExecutionError`.

## 5. Tests y smoke tests

- `npm run build`: PASS.
- `npm run check`: PASS, incluyendo la regresión completa existente.
- `node --test dist/tests/platform/model-gateway.test.js`: PASS (4/4).
- La matriz usa fetch doubles, sin Internet ni credenciales.
- Smoke real OpenAI/Anthropic: SKIPPED si no hay credenciales configuradas.
- Smoke Ollama: SKIPPED si el endpoint local no está disponible.

## 6. Integración cross-project

El flujo Prompt 28 permanece compatible: `MODEL_PROVIDER=stub` conserva la
resolución estructurada de `product.discovery`, `taskId`, `executionId` y
`traceId`, y Tentaciones resuelve el producto desde su propio catálogo.

## 7. Riesgos y decisiones

El modo real depende de credenciales y disponibilidad del proveedor elegido;
por eso no se activa implícitamente. Se evita añadir SDKs vendor-specific:
los adapters usan `fetch` inyectable, reduciendo superficie y facilitando
tests deterministas.

## 8. Siguiente milestone

Agregar tool schemas provider-neutral al request del gateway y completar un
flujo de tool-calling multi-turno, manteniendo autorización y ejecución
exclusivamente en el Core.
