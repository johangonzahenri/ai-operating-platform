# Fase 13 — Seguridad: Matriz de Control y Verificación

## 1. Resumen Ejecutivo

Este documento presenta el mapeo definitivo de los controles de seguridad de la plataforma implementados en la **Fase 13 (Seguridad)**. Cada control está vinculado a una Capa Arquitectónica concreta, un Punto de Aplicación de Seguridad (SEP), un conjunto de pruebas unitarias/integración y un estado de verificación operativa.

---

## 2. Matriz de Controles de Seguridad

| Identificador de Control | Capa | Punto de Aplicación de Seguridad (SEP) | Referencia de Suite de Pruebas | Estado |
|---|---|---|---|---|
| **CTRL-01: Verificación de Identidad** | AuthN | `AuthenticationService` y `ApiKeyAuthenticationProvider` | `tests/unit/authentication-service.test.ts` | **PASS** |
| **CTRL-02: Adaptador de Bearer Token** | AuthN | `BearerTokenAuthenticationProvider` (`BearerTokenVerifier`) | `tests/unit/authentication-service.test.ts` | **PASS** |
| **CTRL-03: Separación de AuthN/AuthZ** | AuthN / AuthZ | `SecurityContext` y `evaluateFailClosedAuthorization` | `tests/unit/authentication-service.test.ts` | **PASS** |
| **CTRL-04: Evaluación de Rol y Permiso RBAC** | AuthZ | `RbacAuthorizationEvaluator` y `InMemoryRoleRepository` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-05: Precedencia de Denegación Explícita y por Defecto** | AuthZ | `RbacAuthorizationEvaluator` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-06: Aislamiento de Tenant y Scope** | AuthZ / Límite | `RbacAuthorizationEvaluator` y `SecurityBoundaryEnforcer` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-07: Policy Gateway Centralizado** | Política | `PolicyGateway` y `RbacPolicyGateway` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-08: Autorización Pre-Ejecución de Herramienta** | Límite (Herramienta) | `SecurityBoundaryEnforcer.enforceToolBoundary` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-09: Sanitización de Entrada / Salida de Herramienta** | Límite (Herramienta) | `SecurityBoundaryEnforcer.enforceToolOutput` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-10: Prevención de Escape de Herramienta** | Límite (Herramienta) | `SecurityBoundaryEnforcer.enforceToolBoundary` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-11: Listas Blancas de Modelos y Proveedores** | Límite (Modelo) | `SecurityBoundaryEnforcer.enforceModelBoundary` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-12: Resistencia a Inyección de Prompts** | Límite (Modelo) | `SecurityBoundaryEnforcer` y `TaskContext` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-13: Propiedad y Gobernanza de Memoria** | Límite (Memoria) | `SecurityBoundaryEnforcer.enforceMemoryBoundary` y `MemoryService` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-14: Delegación Delimitada y Bloqueo de Escalada** | Límite (Coordinación) | `SecurityBoundaryEnforcer.enforceDelegationBoundary` | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-15: Prevención de Autoescalada de Agente** | Límite (Agente) | `RbacAuthorizationEvaluator` y `SecurityBoundaryEnforcer` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-16: Protección del Principal SYSTEM** | Seg. Core | `Principal.create`, `ApiKeyRecord.create`, `SecurityContext` | `tests/unit/authentication-service.test.ts` | **PASS** |
| **CTRL-17: Restricción de Acceso Anónimo** | Seg. Core | `SecurityContext.anonymous`, `RbacAuthorizationEvaluator` | `tests/unit/authorization-rbac.test.ts` | **PASS** |
| **CTRL-18: Cero Fugas de Secretos en Eventos** | Observabilidad | `sanitizeBoundedValue`, `AuthenticationService`, `Evaluator` | `tests/unit/authentication-service.test.ts` | **PASS** |
| **CTRL-19: Manejo de Errores Fail-Closed** | Transversal | Todos los Aplicadores de Límites y Adaptadores de Estrategia | `tests/unit/security-boundaries.test.ts` | **PASS** |
| **CTRL-20: Evaluación Determinística** | Transversal | `RbacAuthorizationEvaluator` | `tests/unit/authorization-rbac.test.ts` | **PASS** |

---

## 3. Verificación de Mitigación del Modelo de Amenazas (STRIDE)

| ID de Amenaza | Nombre de Amenaza | Control de Mitigación | Resultado de Verificación |
|---|---|---|---|
| **TM-01** | Suplantación de Identidad | `CTRL-01`, `CTRL-02`, `CTRL-16` | **MITIGADO Y VERIFICADO** |
| **TM-02** | Escalada de Privilegios | `CTRL-03`, `CTRL-04`, `CTRL-15` | **MITIGADO Y VERIFICADO** |
| **TM-03** | Abuso de Herramientas | `CTRL-08`, `CTRL-10` | **MITIGADO Y VERIFICADO** |
| **TM-04** | Inyección Directa/Indirecta de Prompt | `CTRL-12`, `TaskContext` | **MITIGADO Y VERIFICADO** |
| **TM-05** | Inyección de Herramienta y Salida Maliciosa | `CTRL-09` | **MITIGADO Y VERIFICADO** |
| **TM-06** | Exfiltración de Datos | `CTRL-06`, `CTRL-18` | **MITIGADO Y VERIFICADO** |
| **TM-07** | Fuga de Memoria entre Agentes | `CTRL-13` | **MITIGADO Y VERIFICADO** |
| **TM-08** | Modelo/Proveedor No Autorizado | `CTRL-11` | **MITIGADO Y VERIFICADO** |
| **TM-09** | Ejecución de Replay y Duplicada | Idempotencia y OCC (`SqliteTransactionRunner`) | **MITIGADO Y VERIFICADO** |
| **TM-10** | Manipulación de Eventos | Inmutable de Solo Adición (`SqliteEventStore`) | **MITIGADO Y VERIFICADO** |
| **TM-11** | Agotamiento de Recursos | Límites de Ejecución y Delimitación de Delegación (`CTRL-14`) | **MITIGADO Y VERIFICADO** |
| **TM-12** | SSRF y Abuso de Red | Niveles de Riesgo de Herramientas y Autorización Pre-Ejecución (`CTRL-08`) | **NIVEL APLICACIÓN VERIFICADO** (El proxy hardware de salida de red es infraestructura futura) |
| **TM-13** | Ejecución de Herramienta Maliciosa | Autorización Pre-Ejecución y Bloqueo de Escape (`CTRL-08`, `CTRL-10`) | **MITIGADO Y VERIFICADO** |
| **TM-14** | Respuesta de Modelo Comprometida | Validación Estructural, Sanitización de Observación de Herramienta | **MITIGADO Y VERIFICADO** |
