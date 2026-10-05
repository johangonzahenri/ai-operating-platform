# Modelo de Amenazas v0.1 — AI Operating Platform

## 1. Alcance y Metodología

Este modelo de amenazas identifica amenazas realistas a la AI Operating Platform a través de su ciclo de vida de ejecución, núcleo de runtime, agentes, herramientas, modelos, memoria y capas de persistencia. Aplica STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) adaptado a sistemas de IA autónomos y multi-agente.

---

## 2. Catálogo de Amenazas

### TM-01: Suplantación de Identidad (Spoofing)
- **Descripción**: Un llamador no confiable o subcomponente asume la identidad de un `Principal` privilegiado de Sistema o Agente.
- **Límites Afectados**: Límite A (Cliente $\rightarrow$ API), Límite C (Planner $\rightarrow$ Agentes).
- **Mitigación**: Validación estricta de `Principal` en `SecurityContext`, verificación de clave API SHA-256 con comparación de buffer de tiempo constante (`crypto.timingSafeEqual`), abstracción del adaptador `BearerTokenVerifier`, bloqueo explícito de identidades de SYSTEM externas.
- **Verificación**: `tests/unit/authentication-service.test.ts`

### TM-02: Escalada de Privilegios
- **Descripción**: Un agente con permisos de riesgo LOW intenta invocar una herramienta de riesgo HIGH/CRITICAL o ejecutar tareas administrativas.
- **Límites Afectados**: Límite D (Agente $\rightarrow$ Herramienta), Límite E (Agente $\rightarrow$ Modelo).
- **Mitigación**: `PolicyGateway` evalúa permisos RBAC de grano fino por invocación antes de la ejecución. Los agentes no pueden otorgar permisos, modificar roles o alterar definiciones.
- **Verificación**: `tests/unit/authorization-rbac.test.ts`, `tests/unit/security-boundaries.test.ts`

### TM-03: Abuso de Herramientas y Llamada a Herramienta No Autorizada
- **Descripción**: Un agente invoca una herramienta fuera de sus capacidades declaradas o pasa parámetros maliciosos.
- **Límites Afectados**: Límite D (Agente $\rightarrow$ Herramienta).
- **Mitigación**: Coincidencia de capacidades registrada, validación de esquema de entrada en `ToolRegistry`, evaluación de política pre-ejecución a través de `enforceToolBoundary`.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-04: Inyección de Prompt (Directa e Indirecta)
- **Descripción**: Entrada maliciosa del usuario o contenido externo de web/documento intenta anular las instrucciones del sistema o roles del agente.
- **Límites Afectados**: Límite A (Cliente $\rightarrow$ API), Límite H (Proveedor Externo $\rightarrow$ Plataforma).
- **Mitigación**: Separación estricta entre instrucciones del sistema y entradas del usuario; aislamiento del prompt en `TaskContext`; las decisiones del Policy Gateway se ejecutan independientemente del razonamiento del LLM.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-05: Inyección de Herramienta y Salida Maliciosa
- **Descripción**: La salida de una herramienta contiene instrucciones adversarias diseñadas para engañar a los agentes de decisión o ejecución posteriores.
- **Límites Afectados**: Límite D (Herramienta $\rightarrow$ Runtime), Límite F (Transferencias / Handoffs).
- **Mitigación**: Payloads de salida de herramientas delimitados y sanitizados (`enforceToolOutput`); congelamiento profundo (deep freeze) para prevenir la mutación de contexto en vuelo.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-06: Exfiltración de Datos
- **Descripción**: Un agente intenta enviar el estado de la base de datos interna, variables de entorno u otros datos de tenants a un proveedor externo.
- **Límites Afectados**: Límite E (Agente $\rightarrow$ Modelo), Límite H (Plataforma $\rightarrow$ Externo).
- **Mitigación**: Sanitización de `BoundedDataLimits`, redacción de secretos basada en patrones, chequeos estrictos de límites de scope y tenant.
- **Verificación**: `tests/unit/authentication-service.test.ts`, `tests/unit/authorization-rbac.test.ts`

### TM-07: Fuga de Memoria y Contexto entre Agentes
- **Descripción**: El Agente B lee memoria privada o historial conversacional perteneciente al Agente A.
- **Límites Afectados**: Límite F (Agente $\rightarrow$ Memoria).
- **Mitigación**: Aislamiento de scope dedicado (`agent-${id}`), validación de propiedad pre-recuperación en `enforceMemoryBoundary`, cero buses de memoria compartida no verificada.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-08: Acceso No Autorizado a Modelo / Proveedor
- **Descripción**: Un agente enruta peticiones a un proveedor de modelo no aprobado o de costo prohibitivo.
- **Límites Afectados**: Límite E (Agente $\rightarrow$ Modelo).
- **Mitigación**: Listas blancas de modelos y proveedores (`ModelProviderAllowlist`), autorización de modelo pre-ejecución.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-09: Ataques de Replay y Ejecución Duplicada
- **Descripción**: Un atacante o proceso en recuperación repite una petición de operación para causar ejecución doble o efectos secundarios duplicados.
- **Límites Afectados**: Límite A (API), Límite B (Runtime), Límite G (Persistencia).
- **Mitigación**: Chequeos de idempotencia determinísticos `correlationId`, `operationId` y `traceId`; versiones de concurrencia optimista (OCC) en almacenamiento.
- **Verificación**: `tests/unit/sqlite-persistence.test.ts`

### TM-10: Manipulación de Eventos y Registro de Auditoría
- **Descripción**: Una entidad intenta alterar o eliminar eventos operativos y de coordinación registrados.
- **Límites Afectados**: Límite G (Runtime $\rightarrow$ Persistencia).
- **Mitigación**: `SqliteEventStore` de solo adición (append-only), esquemas de eventos de dominio inmutables, números de secuencia monotónicos.
- **Verificación**: `tests/unit/sqlite-event-store.test.ts`

### TM-11: Agotamiento de Recursos y Denegación de Servicio (DoS)
- **Descripción**: Una petición desencadena recursividad infinita, tamaños masivos de payloads o generación de agentes descontrolada.
- **Límites Afectados**: Límite B (Runtime), Límite C (Planner).
- **Mitigación**: Límites de runtime: `maxAgents=4`, `maxHandoffs=3`, límite de delegación `maxDepth=1`, tamaños de payload delimitados ($2048$ caracteres, $4$ niveles de profundidad), tiempos de espera de ejecución.
- **Verificación**: `tests/unit/security-boundaries.test.ts`, `tests/unit/multi-agent-coordinator.test.ts`

### TM-12: SSRF y Abuso de Red Externa
- **Descripción**: Una herramienta de red es manipulada para probar endpoints de red privada interna o servicios de metadatos en la nube.
- **Límites Afectados**: Límite D (Herramienta $\rightarrow$ Red).
- **Mitigación**: Clasificación de riesgo de herramientas (`HIGH`/`CRITICAL`), autorización de políticas pre-ejecución para capacidades de red. (El proxy de firewall de salida de red/hardware es una infraestructura futura planificada).
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-13: Implementación Maliciosa de Herramienta
- **Descripción**: Una herramienta registrada contiene lógica defectuosa o efectos secundarios que violan los invariantes de seguridad.
- **Límites Afectados**: Límite D (Agente $\rightarrow$ Herramienta).
- **Mitigación**: Autorización en el registro de herramientas, evaluación del límite de herramientas pre-ejecución, prevención de escape de la herramienta.
- **Verificación**: `tests/unit/security-boundaries.test.ts`

### TM-14: Respuesta de Modelo de Proveedor Comprometida
- **Descripción**: Un proveedor LLM externo devuelve respuestas estructurales inválidas, malformadas o alucinadas.
- **Límites Afectados**: Límite E (Modelo $\rightarrow$ Runtime).
- **Mitigación**: Validación de esquema estructural (esquema JSON / tipos), manejo fail-closed en planificadores y ejecutores, evaluación de salida de agente de verificación.
- **Verificación**: `tests/unit/task-context.test.ts`

---

## 3. Matriz de Mitigación de Amenazas

| ID de Amenaza | Nombre de Amenaza | Severidad | Capa de Mitigación Primaria | Componente de Aplicación | Estado |
|---|---|---|---|---|---|
| **TM-01** | Suplantación de Identidad | HIGH | SecurityContext y AuthN | `AuthenticationService`, `Principal` | **MITIGADA** |
| **TM-02** | Escalada de Privilegios | CRITICAL | Aplicación de Políticas | `PolicyGateway`, `RbacAuthorizationEvaluator` | **MITIGADA** |
| **TM-03** | Abuso de Herramientas | HIGH | Coincidencia de Capacidades y Política | `SecurityBoundaryEnforcer`, `ToolRegistry` | **MITIGADA** |
| **TM-04** | Inyección de Prompt | HIGH | Aislamiento y Verificación de Prompt | `TaskContext`, `SecurityBoundaryEnforcer` | **MITIGADA** |
| **TM-05** | Inyección de Herramienta | MEDIUM | Transferencias y Salida de Herramienta Delimitadas | `enforceToolOutput`, `BoundedDataLimits` | **MITIGADA** |
| **TM-06** | Exfiltración de Datos | HIGH | Redacción de Secretos y Scoping | `sanitizeBoundedValue`, `RbacAuthorizationEvaluator` | **MITIGADA** |
| **TM-07** | Fuga entre Agentes | HIGH | Aislamiento de Scope de Memoria | `enforceMemoryBoundary`, `MemoryService` | **MITIGADA** |
| **TM-08** | Modelo No Autorizado | MEDIUM | Registro de Proveedores y Política | `enforceModelBoundary`, `ModelGateway` | **MITIGADA** |
| **TM-09** | Ataques de Replay | MEDIUM | Idempotencia y OCC | `SqliteTransactionRunner`, `CoreRuntime` | **MITIGADA** |
| **TM-10** | Manipulación de Eventos | HIGH | EventStore de Solo Adición | `SqliteEventStore` | **MITIGADA** |
| **TM-11** | Agotamiento de Recursos | HIGH | Límites de Coordinación y Tiempos de Espera | `CoordinationRequest`, `SecurityBoundaryEnforcer` | **MITIGADA** |
| **TM-12** | Abuso SSRF | HIGH | Niveles de Riesgo y Política | `deriveTrustedRiskLevel`, `PolicyGateway` | **MITIGADA (Nivel App)** |
| **TM-13** | Herramienta Maliciosa | CRITICAL | Clasificación de Riesgos y Prevención de Escape | `SecurityBoundaryEnforcer` | **MITIGADA** |
| **TM-14** | Modelo Comprometido | MEDIUM | Validación de Esquema y Verificador | `evaluateVerificationOutput`, `TaskContext` | **MITIGADA** |
