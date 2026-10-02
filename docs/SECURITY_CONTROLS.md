# Controles de Seguridad — AI Operating Platform

## Aclaración Importante

Este documento enumera los **controles de seguridad concretos** implementados en la plataforma.
NO afirmamos "inmunidad XSS" — implementamos **controles activos contra XSS**.

## Controles de Seguridad del DOM
| Control | Evidencia | Verificación |
|:---|:---|:---|
| Cero `innerHTML` | `scripts/docs-check.mjs` escanea `app.js` | VERIFIED |
| Cero `outerHTML` | Análisis estático | VERIFIED |
| Cero `eval()` | Búsqueda de código | VERIFIED |
| Cero constructor `Function()` | Búsqueda de código | VERIFIED |
| Cero `document.write()` | Búsqueda de código | VERIFIED |
| Cero scripts en línea | Sin etiquetas `<script>` con código en línea | VERIFIED |
| Construcción del DOM vía `document.createElement` + `textContent` | Revisión de código fuente | VERIFIED |

## Cabeceras HTTP de Seguridad
| Cabecera | Valor | Propósito |
|:---|:---|:---|
| Content-Security-Policy | `default-src 'self'; script-src 'self'` | Prevenir XSS vía scripts externos |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Forzar HTTPS |
| X-Content-Type-Options | `nosniff` | Prevenir adivinación de MIME (MIME sniffing) |
| X-Frame-Options | `DENY` | Prevenir clickjacking |
| Vary | `Origin` | Caché CORS adecuado |

## Controles de Autenticación
| Control | Implementación | Estado |
|:---|:---|:---|
| Hashing de API Key | SHA-256 con prefijo de clave | VERIFIED |
| Verificación JWT | RS256/ES256 nativo `node:crypto` | VERIFIED |
| Rotación de claves JWKS | Obtención dinámica con caché TTL | VERIFIED |
| Tolerancia de reloj | Configurable para exp/nbf | VERIFIED |

## Controles de Autorización  
| Control | Implementación | Estado |
|:---|:---|:---|
| Por defecto fail-closed | PolicyGateway DENY en cualquier error | VERIFIED |
| Evaluación RBAC | Coincidencia de rol-permiso | VERIFIED |
| Aislamiento de inquilinos | CrossTenantOrganizationError | VERIFIED |
| Lista blanca de herramientas | Verificación estricta de Agent.tools | VERIFIED |
| Aislamiento de memoria | Partición de Agent.memoryScope | VERIFIED |

## Controles de Red
| Control | Implementación | Estado |
|:---|:---|:---|
| Enlace loopback | `127.0.0.1:3000` | VERIFIED |
| Validación de cabecera Host | Verificación de allowedHosts | VERIFIED |
| Límite de tamaño de carga útil | 1MB (HTTP 413) | VERIFIED |
| Imposición de tipo de medio | application/json (HTTP 415) | VERIFIED |
| Prevención de salto de directorio | Saneamiento del servicio de archivos estáticos | VERIFIED |
| Límite de tasa (Rate limiting) | Ventana deslizante por ruta | VERIFIED |

## Brechas Abiertas
| Brecha | Descripción | Objetivo |
|:---|:---|:---|
| GAP-SEC-01 | Conexión IdP en vivo OIDC/JWKS | v1.4 |
| GAP-INF-01 | Terminación TLS en host en vivo | v1.4 |
| Trusted Types | Aún no implementado | v1.5 |
