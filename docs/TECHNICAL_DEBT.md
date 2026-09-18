# Registro de Deuda Técnica y Brechas Reales (Technical Debt Registry)

Este registro documenta de forma honesta, verificada y explícita las limitaciones arquitectónicas, brechas de implementación y deuda técnica identificadas durante la auditoría canónica del repositorio.

---

## 1. Brechas Arquitectónicas y Técnicas Factuales

### GAP-01: Ausencia del Adaptador para Google Gemini / Vertex AI
* **Severidad:** Resuelta (Fase 55 / Prompt 101)
* **Área:** Model Gateways / AI Runtime
* **Descripción:** Aunque existían adaptadores para OpenAI, Anthropic y Ollama, la plataforma carecía de adaptador para la familia de modelos Google Gemini / Vertex AI.
* **Resolución Ejecutada:** Implementado `GeminiModelGateway` en `src/infrastructure/model/gemini/gemini-model-gateway.ts` bajo la iniciativa `AOP-MODEL-GEMINI` (ADR 0023). 8 tests unitarios validados.

---

### GAP-02: Memoria de Agentes Exclusivamente Volátil (In-Memory)
* **Severidad:** Resuelta (Fase 55 / Prompt 101)
* **Área:** Memory & Context
* **Descripción:** El puerto `MemoryGateway` utilizaba únicamente la implementación en memoria `InMemoryMemoryGateway`.
* **Resolución Ejecutada:** Implementado `SqliteMemoryGateway` en `src/infrastructure/memory/sqlite-memory-gateway.ts` con tabla duradera `platform_memory` indexada y upsert atómico (ADR 0024). 4 tests unitarios y 2 pruebas de contrato validadas.

---

### GAP-03: Servicio de Autenticación Productivo y Rotación de Claves
* **Severidad:** Resuelta (Fase 55 / Prompt 101)
* **Área:** Seguridad / Autenticación
* **Descripción:** La validación de Bearer Tokens dependía de un adaptador de andamiaje limitado a firmas simétricas `HS256`.
* **Resolución Ejecutada:** Implementado `JwtTokenVerifier` en `src/infrastructure/security/jwt-token-verifier.ts` con firmas asimétricas RS256/ES256, soporte de KeyStore con rotación y revocación dinámica de claves (ADR 0025). 4 tests criptográficos validados.

---

### GAP-04: Topología de Red y Ausencia de Proxy Reverso con TLS
* **Severidad:** Resuelta (Fase 55 / Prompt 101)
* **Área:** Infraestructura / Red
* **Descripción:** El servidor nativo Node.js escucha en loopback local `127.0.0.1:3000` mediante HTTP plano.
* **Resolución Ejecutada:** Publicados manifiestos oficiales de producción en `deploy/nginx/nginx.conf`, `deploy/caddy/Caddyfile`, `deploy/docker-compose.prod.yml` y guía de arquitectura en `docs/PRODUCTION_NETWORK_TOPOLOGY.md` (ADR 0026).

---

### GAP-05: Dualidad en Rutas de API REST (`/api/v1` vs `/api/platform/v1`)
* **Severidad:** Resuelta (Fase 55 / Prompt 101)
* **Área:** Platform API / Gobernanza de Contratos
* **Descripción:** El enrutador HTTP atendía de manera indistinta rutas bajo el prefijo canónico `/api/v1/*` y bajo el alias de compatibilidad `/api/platform/v1/*`.
* **Resolución Ejecutada:** Establecido `/api/v1/*` como superficie canónica y configuradas cabeceras RFC 8594 (`Deprecation: true`, `Sunset: Thu, 31 Dec 2026 23:59:59 GMT`, `Link: </api/v1/...>; rel="successor-version"`) sobre `/api/platform/v1/*`. Test unitario validado en `tests/unit/api-surface-deprecation.test.ts`.

---

### GAP-06: Máquina de Estados de Recuperación para Agentes
* **Severidad:** Baja
* **Área:** Recovery & Resilience
* **Descripción:** El servicio `RestartRecoveryService` reconcilia de manera atómica las entidades activas no terminales de `Task`, `Execution` y `AutonomousOperation`. Sin embargo, el agregado `Agent` se trata como una definición declarativa sin máquina de estados de recuperación transaccional tras caída.
* **Impacto:** Aunque los agentes se rehidratan correctamente desde SQLite, no existe un ciclo formal de recuperación activa específico para el ciclo de vida del agente.
* **Resolución Planificada:** Documentar formalmente la naturaleza declarativa/stateless del agente en el ADR 0018 o evaluar la necesidad de estados de recuperación para agentes si se vuelven autónomos de largo plazo.

---

### GAP-07: Monitoreo de Consumibles de Hardware (Tóner de Impresora)
* **Severidad:** Informativa
* **Área:** Business Devices
* **Descripción:** La impresora comercial Brother DCP-1600 conectada por puerto local `USB001` no puede reportar niveles de tóner ni porcentaje de vida útil del tambor mediante el controlador GDI nativo sin la suite privativa del fabricante.
* **Impacto:** La plataforma debe mantener el reporte honesto de `device.consumables: UNSUPPORTED` para evitar falsas lecturas de telemetría.
* **Resolución:** Registrar la limitación como permanente para conexiones USB estándar sin agente de telemetría SNMP/Cloud.

---

### GAP-08: Semántica de Dimensiones de Presupuesto (Hard Gate vs Contabilización Post-Facto vs Costo Financiero)
* **Severidad:** Documentada / Resuelta (Fase 57.2 / Prompt 105)
* **Área:** Team Resource Governance & Runtime
* **Descripción:** Las dimensiones de presupuesto operan en tres categorías distintas:
  1. **Hard Enforcement (Comprobación Previa Bloqueante):** `executions`, `modelCalls`, `toolCalls`, `autonomousSteps` son bloqueadas antes del cómputo si el remanente es menor a la unidad requerida.
  2. **Post-Facto Accounting (Contabilización Fiel con Overshoot):** `durationMs` y `tokens` no pueden predecirse exactamente antes de invocar el modelo/tarea; se registran fielmente tras la ejecución (`allowOvershoot: true`), y al alcanzar/superar el límite transicionan el estado a `EXHAUSTED`, bloqueando cualquier despacho subsiguiente.
  3. **Not Available:** La dimensión `cost` financiero no se atribuye dinámicamente en el runtime actual (no existe tarificador de moneda multi-proveedor integrado).
* **Impacto:** Claridad absoluta en el comportamiento del runtime sin falsas suposiciones de adivinación de tokens/duración a priori.
---

## 2. Brechas Ambientales de Certificación de Release (Environmental Release Gaps)

Estas brechas representan dependencias de infraestructura y servicios externos que requieren aprovisionamiento en el host físico de producción, sin constituir fallos en el código base:

### GAP-INF-01: Terminación TLS Perimetral en Host Físico de Producción
* **Clasificación:** `OPEN ENVIRONMENTAL GAP` (No bloqueante para runtime local/aislado; bloqueante para `CERTIFIED` pleno en nube pública).
* **Área:** Topología de Red / Seguridad Perimetral
* **Descripción:** Los manifiestos de Nginx (`deploy/nginx/nginx.conf`), Caddy (`deploy/caddy/Caddyfile`) y Docker Compose (`deploy/docker-compose.prod.yml`) están 100% implementados y validados. La terminación TLS real requiere inyección de certificados SSL/TLS y configuración de DNS en el host físico de despliegue.
* **Evidencia Existente:** Manifiestos de despliegue y guía `docs/PRODUCTION_NETWORK_TOPOLOGY.md` (ADR 0026).
* **Evidencia Faltante:** Dominio DNS público y certificados emitidos por CA reconocida en host de staging/producción.

---

### GAP-SEC-01: Verificación en Vivo contra Identity Provider OIDC/JWKS Externo
* **Clasificación:** `OPEN ENVIRONMENTAL GAP` (No bloqueante para runtime local/aislado; bloqueante para `CERTIFIED` pleno en nube pública).
* **Área:** Autenticación / Seguridad
* **Descripción:** El verificador criptográfico asimétrico `JwtTokenVerifier` (RS256/ES256) y el gestor de claves `KeyStore` con rotación dinámica están 100% implementados y cubiertos por 4 tests criptográficos. La verificación en vivo requiere conectividad hacia el endpoint JWKS público de un IdP corporativo (e.g., Okta, Auth0, Keycloak).
* **Evidencia Existente:** `src/infrastructure/security/jwt-token-verifier.ts`, `tests/unit/jwt-authentication.test.ts` (ADR 0025).
* **Evidencia Faltante:** URI JWKS activa y credenciales de cliente OIDC en red pública empresarial.

---

## 3. Mejoras Post-Release y Backlog Futuro (Future Enhancements)

1. **Streaming Reactivo SSE / WebSockets:** Sustitución de polling HTTP periódico en la Consola Web por Server-Sent Events nativos para streaming de tokens y telemetría de baja latencia.
2. **Checkpoint Distribuido Multi-Nodo (`COR-08`):** Sincronización multi-región para despliegues federados en v2.0 (`BACKLOG`).


