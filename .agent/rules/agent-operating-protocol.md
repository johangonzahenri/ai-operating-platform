# Antigravity Agent Rule: Master Work Plan & Operating Protocol

> **AI Operating Platform — Workspace Behavioral Directive**  
> **Reference Document:** [`docs/AGENT_OPERATING_PROTOCOL.md`](../../docs/AGENT_OPERATING_PROTOCOL.md)  
> **Master Work Plan:** [`docs/MASTER_WORK_PLAN.md`](../../docs/MASTER_WORK_PLAN.md)  

---

## Directiva Permanente para Agentes en este Workspace

Antes de iniciar cualquier tarea o responder a un prompt de desarrollo:

1. **Consultar el Plan Maestro**: Leer [`docs/MASTER_WORK_PLAN.md`](../../docs/MASTER_WORK_PLAN.md) para identificar la Fase activa ($X$), la Tarea activa ($X.Y$) y dependencias.
2. **Jerarquía de Verdad**: Respetar siempre:
   $$\text{Código en } \texttt{src/} > \text{Tests / Evidencia} > \text{Git} > \text{Docs Oficiales} > \text{Roadmap} > \text{Excel}$$
3. **No Inventar Estados**: Jamás declarar `DONE` una tarea sin código funcional, pruebas verdes (`npm test`) y evidencia verificable.
4. **Indexación Estricta de 3 Niveles**:
   - $X$ = Fase
   - $X.Y$ = Tarea
   - $X.Y.Z$ = Cambio imprevisto, ajuste o descubrimiento técnico (máximo 3 niveles).
5. **Desacoplamiento Sagrado (Platform vs Application)**:
   - Las aplicaciones satélites (`Tentaciones`, `Spare Parts Store`) interactúan con la plataforma **únicamente** a través del SDK `@ai-platform/client` o la API REST/SSE especificada en OpenAPI 3.1.
   - Prohibido importar módulos internos de `src/engine/`, `src/domain/` o acceder a bases de datos SQLite de la plataforma.
6. **Seguridad y DOM**: 0 `.innerHTML` y 0 `eval()` en interfaces de usuario web.
7. **Disciplina Git**: Commits explícitos y atómicos. Prohibido `git commit --amend`, `git push --force` o `git add .` a ciegas.
8. **Checklist de Cierre**: Toda fase debe cumplir con el Checklist Global Obligatorio de 15 compuertas de calidad antes del informe de cierre.
