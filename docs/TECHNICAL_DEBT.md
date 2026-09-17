# Registro de Deuda Técnica y Brechas Reales (Technical Debt Registry)

Este registro documenta de forma honesta, verificada y explícita las limitaciones arquitectónicas, brechas de implementación y deuda técnica identificadas durante la auditoría canónica del repositorio.

---

## 1. Brechas Arquitectónicas y Técnicas Factuales

### GAP-01: Ausencia del Adaptador para Google Gemini / Vertex AI
* **Severidad:** Media
* **Área:** Model Gateways / AI Runtime
* **Descripción:** Aunque existen adaptadores plenamente funcionales para OpenAI, Anthropic y Ollama en `src/infrastructure/model/`, la plataforma no dispone de un adaptador ejecutable para la familia de modelos Google Gemini / Vertex AI.
* **Impacto:** Las peticiones dirigidas a modelos de Google son rechazadas por `ProviderFactory` o desviadas al Stub determinista.
* **Resolución Planificada:** Implementar `GeminiModelGateway` en `src/infrastructure/model/gemini/` en la iniciativa `AOP-MODEL-GEMINI` (v1.2).

---

### GAP-02: Memoria de Agentes Exclusivamente Volátil (In-Memory)
* **Severidad:** Alta
* **Área:** Memory & Context
* **Descripción:** La plataforma cuenta con persistencia duradera en SQLite para tareas, ejecuciones, eventos, agentes y operaciones autónomas, pero el puerto `MemoryGateway` utiliza únicamente la implementación `InMemoryMemoryGateway`. No existe un adaptador `SqliteMemoryGateway` en `src/`.
* **Impacto:** Si el proceso de la plataforma se reinicia, el historial de memoria contextual por agente (`AgentMemoryScope`) y por sesión se pierde, requiriendo re-inicialización.
* **Resolución Planificada:** Desarrollar `SqliteMemoryGateway` con almacenamiento relacional duradero indexado en la iniciativa `AOP-MEMORY` (v1.2).

---

### GAP-03: Servicio de Autenticación Productivo y Rotación de Claves
* **Severidad:** Alta
* **Área:** Seguridad / Autenticación
* **Descripción:** El middleware de seguridad valida API Keys y Bearer Tokens mediante `InMemoryApiKeyRepository` y un adaptador de verificación básico. No existe un proveedor integrado de OpenID Connect (OIDC), OAuth2 o validación criptográfica de firmas asimétricas JWT con rotación automatizada de claves.
* **Impacto:** Apto para entornos controlados, desarrollo e instalaciones locales; insuficiente para despliegues empresariales expuestos a internet público sin un API Gateway externo.
* **Resolución Planificada:** Integrar un proveedor de autenticación JWT / OIDC de estándar industrial en la iniciativa `AOP-AUTH` (v1.2).

---

### GAP-04: Topología de Red y Ausencia de Proxy Reverso con TLS
* **Severidad:** Media
* **Área:** Infraestructura / Red
* **Descripción:** El servidor nativo Node.js (`src/platform/server.ts`) escucha en la dirección loopback local `127.0.0.1:3000` mediante transporte HTTP plano (sin TLS). No incluye certificados SSL nativos ni configuración integrada de proxy reverso (Nginx/Caddy).
* **Impacto:** El servidor no debe exponerse directamente a internet público en `0.0.0.0` sin una capa de terminación TLS perimetral que gestione cifrado HTTPS y certificados.
* **Resolución Planificada:** Publicar manifiestos oficiales de Nginx/Caddy y Docker Compose con terminación TLS en la iniciativa `AOP-NETWORK` (v1.2).

---

### GAP-05: Dualidad en Rutas de API REST (`/api/v1` vs `/api/platform/v1`)
* **Severidad:** Baja
* **Área:** Platform API / Gobernanza de Contratos
* **Descripción:** El enrutador HTTP (`http-router.ts`) atiende de manera indistinta rutas bajo el prefijo canónico `/api/v1/*` y bajo el alias de compatibilidad `/api/platform/v1/*`. Esta duplicidad facilita la compatibilidad histórica pero introduce ambigüedad en la documentación técnica.
* **Impacto:** Los desarrolladores externos pueden utilizar prefijos discordantes en clientes HTTP directos.
* **Resolución Planificada:** Establecer `/api/v1/*` como la única superficie canónica y emitir encabezados HTTP `Sunset` y `Deprecation` sobre `/api/platform/v1/*` en la iniciativa `AOP-API-SURFACES` (v1.2).

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
