# Instrucciones para Agentes de IA — AI Operating Platform

Bienvenido al repositorio de la **AI Operating Platform** (`johangonzahenri/ai-operating-platform`).

Todos los agentes de IA y asistentes de codificación automatizados que trabajen en este repositorio **DEBEN** seguir estrictamente los protocolos operativos canónicos establecidos en:

1. 📋 **[Plan de Trabajo Maestro (docs/MASTER_WORK_PLAN.md)](docs/MASTER_WORK_PLAN.md)**: Sistema oficial para el seguimiento de fases activas, tareas, listas de verificación y trazabilidad dinámica.
2. 🛡️ **[Protocolo Operativo del Agente (docs/AGENT_OPERATING_PROTOCOL.md)](docs/AGENT_OPERATING_PROTOCOL.md)**: Reglas de comportamiento estándar, jerarquía de fuente de la verdad, indexación de 3 niveles (`X / X.Y / X.Y.Z`), barandillas de seguridad y pautas de Git.
3. 🏛️ **[Fuente de la Verdad (docs/SOURCE_OF_TRUTH.md)](docs/SOURCE_OF_TRUTH.md)**: Jerarquía de la verdad ($\text{Code} > \text{Tests} > \text{Git} > \text{Docs} > \text{Roadmap} > \text{Excel}$).
4. 🔌 **[Guía de Integración de Aplicaciones (docs/APPLICATION_INTEGRATION_GUIDE.md)](docs/APPLICATION_INTEGRATION_GUIDE.md)**: Invariantes arquitectónicas que gobiernan las aplicaciones satélites que consumen la plataforma a través de `@ai-platform/client` y REST/SSE OpenAPI 3.1.

---

## Protocolo de Ejecución Obligatorio

Antes de ejecutar cualquier solicitud:
1. Consulta `docs/MASTER_WORK_PLAN.md` para identificar la Fase activa ($X$) y la Tarea ($X.Y$).
2. Nunca marques las tareas como `DONE` sin código ejecutable, pruebas automatizadas que pasen (`npm test`) y evidencia verificable.
3. Registra eventos inesperados como ajustes `X.Y.Z` en `docs/MASTER_WORK_PLAN.md`.
4. Ejecuta `npm run check` antes de preparar los cambios.
5. Usa siempre la preparación explícita de git (`git add <files>`), nunca `git commit --amend` o `git push --force`.
