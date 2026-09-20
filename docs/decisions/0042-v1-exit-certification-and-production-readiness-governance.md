# ADR 0042: V1 Exit Certification & Production Readiness Governance

## Estado
**APROBADA** (Fase 73 / `AOP-V1-EXIT`)

## Fecha
Septiembre de 2026

## Contexto
Tras la implementación y certificación de las capacidades nucleares, de orquestación, gobernanza, supervisión humana, runtime autónomo, autenticación y seguridad perimetral de la **AI Operating Platform**, se requiere formalizar un marco riguroso de gobernanza de release y preparación para producción (*Production Readiness*).

El objetivo de esta decisión es establecer un estándar inmutable de auditoría donde la preparación para el lanzamiento no se determine por asunciones o intenciones, sino por evidencia verificable en código, pruebas deterministas, análisis estático y consistencia documental.

## Decisión
1. **Jerarquía Canónica de Verdad (Invariante Inmutable):**
   $$\text{Código Fuente} > \text{Pruebas Automatizadas} > \text{Evidencia Git} > \text{Documentación Oficial} > \text{Roadmap} > \text{Tableros Derivados (Kanban/Excel)}$$

2. **Criterios Objetivos de Certificación:**
   Para calificar como release certificada, la versión debe cumplir:
   * Compilación TypeScript estricta con **0 errores**.
   * Suite completa de pruebas automatizadas ejecutada sobre Node.js nativo con **100% PASS (0 fallos, 0 omitidos)**.
   * **0 dependencias NPM externas** en tiempo de ejecución (`dependencies` vacío en `package.json`).
   * **0 `.innerHTML` / 0 `.outerHTML` / 0 `eval` / 0 `document.write`** en todas las interfaces de usuario.
   * Verificación automatizada de consistencia documental (`node scripts/docs-check.mjs`) con código de salida 0.
   * Aislamiento multi-tenant fail-closed en todas las capas.

3. **Taxonomía Formal de Clasificación de Release:**
   * **`V1 RELEASE READY`**: Todos los requisitos internos y ambientales (incluyendo conectividad IdP externa en vivo y certificados TLS emitidos en el host de borde) están demostrados operativamente en red pública.
   * **`CERTIFIED WITH OPEN GAPS`**: Toda la arquitectura interna, determinismo, persistencia, gobernanza de seguridad, autenticación, presupuestos y pruebas unitarias/integración (1399 tests) están **100% CUMPLIDOS Y CERTIFICADOS**, manteniéndose brechas ambientales declaradas para el host físico de despliegue público (TLS edge e IdP externo).
   * **`NOT READY FOR RELEASE`**: Uno o más invariantes críticos internos presentan regresiones o fallos en pruebas.

4. **Dictamen para v1.3.0 Baseline:**
   Se clasifica formalmente la versión **v1.3.0** como **`CERTIFIED WITH OPEN GAPS`**, autorizando su operación en entornos empresariales privados, intranets y como backend gobernado de IA para aplicaciones satélites.

## Consecuencias
* **Positivas:**
  * Honestidad y transparencia técnica absoluta sin afirmaciones infladas de capacidades no verificadas.
  * Trazabilidad total de cada componente del sistema contra su suite de pruebas y decisión arquitectónica.
  * Definición clara de las fronteras de responsabilidad entre el software de la plataforma y la infraestructura del host de despliegue.
* **Negativas:**
  * El despliegue expuesto directamente a internet público requiere aprovisionar el proxy perimetral Nginx/Caddy con certificados TLS y configurar el endpoint JWKS corporativo.
