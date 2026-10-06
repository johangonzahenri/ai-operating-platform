# ADR 0052: Frontera Satélite Transicional y Aislamiento de Repositorio de Aplicaciones

Fecha: 2026-10-06

## Estado
ACEPTADA

## Contexto
Durante el análisis del Gate 166.0 para la aplicación satélite `PROJ-03 Fleet Management & Logistics` (`AOP-FLEET-LOGISTICS`), surgió la necesidad de definir dónde debe residir el código de las aplicaciones del portafolio satélite y cómo desacoplar las restricciones transicionales de empaquetado/build del repositorio respecto a la arquitectura empresarial de largo plazo:
1. La configuración actual de compilación (`tsconfig.json` y `scripts/build.cjs`) compila estrictamente rutas dentro de `src/**/*.ts`, `tests/**/*.ts` y `examples/**/*.ts`. Introducir monorepo npm workspaces (`packages/`) requeriría una reconfiguración estructural fuera del alcance de una fase de dominio.
2. Integrar el dominio de flota dentro de `src/domain/` violaría flagrantemente la invariante de pureza:
   $$\text{Core Engine} \neq \text{Platform Product} \neq \text{Applications}$$
3. Las aplicaciones satélites deben evolucionar con independencia de despliegue, esquemas de datos propios y consumo gobernado a través del SDK `@ai-platform/client` y contratos OpenAPI 3.1.

## Decisión
1. **Patrón de Frontera Satélite Transicional (`src/satellite/<app>/`)**:
   - Se establece `src/satellite/<app>/` (iniciando con `src/satellite/fleet-management/`) como la ubicación de frontera transicional dentro del repositorio.
   - Esta ubicación satisface la restricción técnica de build de TypeScript sin obligar a una migración prematura de monorepo.
   - Se imponen compuertas de análisis estático (AST) que prohíben de forma estricta cualquier importación hacia `src/domain/`, `src/infrastructure/` o `src/platform/`.

2. **Horizonte de Despliegue Final (Target Release Horizon)**:
   - Se ratifica que la arquitectura empresarial definitiva para las aplicaciones satélite consiste en repositorios independientes autónomos (`johangonzahenri/<app>`) empaquetados y desplegados por separado, consumiendo la plataforma como un producto vía `@ai-platform/client`.
   - La estructura de código en `src/satellite/<app>/` se diseñará bajo Arquitectura Limpia y principios de empaquetado desacoplado, permitiendo su extracción trivial a un repositorio dedicado o paquete npm en el hito de madurez correspondiente.

3. **Frontera de Persistencia Segregada**:
   - Los datos de las aplicaciones satélite (vehículos, telemetría IoT de alta frecuencia, catálogos externos) **NO deben residir** en la base de datos SQLite central del Core Engine (`data/platform.db`).
   - La persistencia satélite debe gestionarse en almacenamiento dedicado e independiente (archivo SQLite segregado o adaptadores de base de datos propios) para evitar contención de bloqueos WAL y garantizar políticas de retención diferenciadas.

4. **Consumo Exclusivo por Contratos Públicos**:
   - Toda interacción entre el satélite y la plataforma se realiza mediante contratos públicos HTTP/SSE (`/api/v1/*`) o a través de la librería oficial `@ai-platform/client`.

## Consecuencias
- Cero contaminación del Core Engine con modelos de negocio de aplicaciones particulares.
- Compatibilidad inmediata con el pipeline de build y testing actual sin deuda de herramientas.
- Extracción transparente y sin refactor a repositorio externo en el momento de release independiente.
- Mitigación del riesgo de contención de base de datos y aislamiento total multi-inquilino.
