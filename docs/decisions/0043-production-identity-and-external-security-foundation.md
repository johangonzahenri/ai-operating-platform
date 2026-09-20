# ADR 0043: Production Identity, OIDC / JWKS Dynamic Key Rotation & External Security Foundation

## Estado
**APROBADA** (Fase 74 / `AOP-V1.4-SECURITY-FOUNDATION`)

## Fecha
Septiembre de 2026

## Contexto
Como parte de la transición de **AI Operating Platform (AOP)** desde una plataforma operacional interna hacia una plataforma empresarial expuesta de forma segura a múltiples consumidores y aplicaciones (Tentaciones AI Commerce, Vehicle Parts Platform, Enterprise Support Agent, n8n Hubs y futuros clientes autónomos multi-empresariales), se requiere consolidar los fundamentos de identidad y seguridad externa previstos para la línea base v1.4.

En fases previas se formalizaron las credenciales API (`ApiCredential`, ADR 0040) y la topología perimetral de red (`NETWORK_TOPOLOGY`, ADR 0041). Sin embargo, para soportar Identity Providers corporativos (tales como Microsoft Entra ID, Google Cloud Identity, Okta, Auth0, Keycloak) y una arquitectura Zero-Trust estricta:
1. La plataforma debe ser agnóstica respecto al proveedor OIDC concreto, soportando configuración declarativa de `issuer`, `jwksUri`, `audience`, algoritmos permitidos (`RS256`, `ES256`, `HS256`) y tolerancia de reloj (*clock skew*).
2. La pasarela de tokens `JwtTokenVerifier` debe implementar recuperación dinámica de claves públicas JWKS (JSON Web Key Set) con caché en memoria (TTL configurable) y refresco automático ante detección de nuevos identificadores de clave (`kid`) para gestionar la rotación de claves criptográficas sin interrupción de servicio.
3. La verificación y resolución de identidad debe operar bajo el principio de fallo seguro (*fail-closed*): en caso de inalcanzabilidad del JWKS o inconsistencia de emisor/audiencia/expiración, la solicitud es rechazada de inmediato (`401 UNAUTHORIZED`).
4. Debe mantenerse la separación estricta de dominios:
   $$\text{Red} \neq \text{Identidad} \neq \text{Inquilino (Tenant)} \neq \text{Aplicación} \neq \text{Autorización} \neq \text{Política}$$
5. Debe distinguirse con honestidad arquitectónica el estado del software:
   $$\text{CODE READY / VERIFIED LOCALLY} \quad \text{vs} \quad \text{ENVIRONMENT PROVISIONING PENDING} \quad \text{vs} \quad \text{LIVE VERIFIED}$$

## Decisión
1. **Verificador Asimétrico OIDC / JWKS en `src/infrastructure/security/jwt-token-verifier.ts`:**
   - Soporte nativo para resolución de llaves JWKS vía HTTP(S) nativo sin dependencias externas (`node:*` / `crypto.createPublicKey({ format: 'jwk' })`).
   - Caché con TTL (default 5 minutos) y forzado de refresco ante claves no encontradas (`unknown kid`).
   - Rechazo estricto de tokens con `alg=none`, algoritmos no permitidos, emisores no coincidentes, audiencias ajenas o firmas inválidas.
2. **Validación Determinista de Configuración de Producción (`src/infrastructure/config/config.ts`):**
   - Variables de entorno declarativas: `OIDC_ENABLED`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI`, `OIDC_ALLOWED_ALGORITHMS`, `OIDC_CLOCK_TOLERANCE_SEC`.
   - En `NODE_ENV=production`, si `OIDC_ENABLED=true`, el sistema valida de manera bloqueante (*fail-closed*) que tanto `OIDC_ISSUER` como `OIDC_JWKS_URI` sean URLs válidas con protocolo seguro `https://`.
3. **Pipeline de Peticiones Zero-Trust:**
   $$\text{Aceptación de Red} \rightarrow \text{Resolución de Proxy Confiable} \rightarrow \text{Autenticación (API Key / OIDC JWT)} \rightarrow \text{Resolución de Principal} \rightarrow \text{Reconciliación de Tenant/App} \rightarrow \text{Evaluación de Scopes (RBAC)} \rightarrow \text{Política de Gobernanza (PolicyGateway)} \rightarrow \text{Ejecución en Motor}$$
4. **Telemetría e Inspección de Seguridad Perimetral:**
   - Endpoints `/api/v1/diagnostics/network` y `/network/diagnostics` exponen el estado de configuración del proveedor de identidad (`identityProvider: { oidcConfigured, oidcIssuer, allowedAlgorithms, authModesSupported }`) sin filtrar secretos, claves privadas ni tokens.
5. **Estado de Brechas Ambientales:**
   - Se mantiene el estado formal de `GAP-INF-01` (Live TLS Edge Termination) y `GAP-SEC-01` (Live External OIDC/JWKS IdP Connectivity) como `OPEN ENVIRONMENTAL GAPS` / `CODE READY - PENDING LIVE PROVISIONING`, ratificando que el software está 100% verificado y preparado para producción una vez aprovisionada la infraestructura en la nube empresarial.

## Consecuencias
* **Positivas:**
  * Soporte completo y nativo para autenticación empresarial federada (OIDC) y API Keys de alta entropía bajo una arquitectura unificada.
  * 0 dependencias externas en tiempo de ejecución (`dependencies: {}`).
  * Tolerancia a fallos y rotación dinámica de claves asimétricas (RS256/ES256) sin reinicio del servidor.
  * Inmunidad ante ataques de suplantación de identidad, spoofing de cabeceras de red y cruce indebido de inquilinos (*cross-tenant breach*).
* **Invariantes Mantenidos:**
  * 0 `.innerHTML` en front-end.
  * Aislamiento local estricto de la impresora comercial Brother DCP-1600.
