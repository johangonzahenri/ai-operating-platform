# ADR 0048: Propagación de AbortSignal Canónico

## Estado
ACEPTADA

## Contexto
Para resolver OAD-001 (In-Flight Task Preemption & Asynchronous AbortSignals), la AI Operating Platform requiere un mecanismo unificado y confiable para interrumpir operaciones, particularmente tareas asíncronas de larga duración e integraciones externas. Depender únicamente de sondeos síncronos es insuficiente para interrumpir operaciones en vuelo (por ejemplo, solicitudes HTTP a través de ModelGateways o ejecuciones de herramientas de larga duración).

## Decisión
Decidimos:
1. **Crear un `CancellationToken` canónico** en `src/domain/execution/cancellation.ts`. Este token combina el sondeo síncrono (`isCancelled`) y las interrupciones asíncronas proporcionando acceso a un `AbortSignal`.
2. **Propagar el `AbortSignal`** a través de la tubería de ejecución, particularmente:
   - `CoreRuntime`
   - Integraciones de `ModelGateway`
   - Ejecuciones de `ToolGateway`
3. **Soportar cancelación jerárquica** (creación de token padre → hijo) para que las subtareas o subagentes reciban la cancelación automáticamente si se cancela la operación principal.
4. **Registrar una pista de auditoría de cancelación** incluyendo la fuente (`operator`, `budget`, `policy`, `timeout`, `parent`, `system`), mensaje, marca de tiempo y ruta de propagación para una trazabilidad completa.

## Consecuencias
- Las operaciones en toda la plataforma ahora pueden interrumpirse en pleno vuelo de forma segura y rápida.
- Todos los consumidores descendentes DEBEN actualizarse para aceptar y manejar correctamente el `AbortSignal` para evitar procesos colgados o solicitudes HTTP pendientes.
- La seguridad fail-closed y la gestión de recursos mejoran, ya que los tiempos de espera y el agotamiento del presupuesto pueden detener agresivamente el trabajo.
- Mantenemos la trazabilidad con razones detalladas proporcionadas al momento de la cancelación.
