# Topología de Red y Proxy Reverso de Producción (Production Network Topology)

Este documento especifica la **arquitectura perimetral, topología de red y directivas de seguridad de transporte** requeridas para el despliegue productivo de la `AI Operating Platform`, resolviendo la brecha **GAP-04** bajo la iniciativa **`AOP-NETWORK`**.

---

## 1. Arquitectura de Red y Segmentación Perimetral

Por diseño de seguridad fail-closed, el servidor HTTP nativo de la plataforma (`src/platform/server.ts`) escucha en la interfaz de bucle local (`127.0.0.1:3000` o dentro de la red interna Docker) y **nunca debe ser expuesto directamente a internet público en `0.0.0.0` sin intermediación perimetral**.

La exposición a redes corporativas o internet requiere un **Proxy Reverso de Terminación TLS** (Caddy o Nginx) actuando como punto único de entrada.

```
                             INTERNET / CLIENTES EXTERNOS
                                          │
                                          │ HTTPS (443 / TLS 1.3)
                                          ▼
                      ┌───────────────────────────────────────┐
                      │     PERÍMETRO / PROXY REVERSO         │
                      │         (Nginx / Caddy)               │
                      │  - Terminación TLS (A+ Profile)       │
                      │  - Rate Limiting Perimetral (50 r/s)  │
                      │  - Inyección de X-Request-Id          │
                      │  - Cabeceras HSTS, CSP, X-Frame       │
                      └───────────────────┬───────────────────┘
                                          │
                                          │ HTTP/1.1 (Red Aislada / Bridge)
                                          │ Host: platform:3000
                                          ▼
                      ┌───────────────────────────────────────┐
                      │      AI OPERATING PLATFORM CORE       │
                      │       (Node.js Native Server)         │
                      │  - Rate Limiter por Aplicación / Tier │
                      │  - Autenticación JWT / API Key        │
                      │  - Normalización de Payload (1MB)     │
                      │  - Orquestador y Persistencia SQLite  │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │   VOLUMEN PERSISTENTE  │
                             │      data/app.db       │
                             │       (WAL Mode)       │
                             └────────────────────────┘
```

---

## 2. Matriz de Puertos y Flujos de Comunicación

| Puerto | Protocolo | Capa | Destino | Propósito / Control |
| :--- | :--- | :--- | :--- | :--- |
| **`80/TCP`** | HTTP | Perímetro Externo | Reverse Proxy | Redirección obligatoria HTTP 301 a HTTPS y desafíos ACME `/.well-known/acme-challenge/`. |
| **`443/TCP`** | HTTPS | Perímetro Externo | Reverse Proxy | Entrada canónica de tráfico seguro para Web Console, APIs REST y clientes SDK. |
| **`3000/TCP`** | HTTP | Red Interna / Local | Platform Server | Tráfico desprovisto de TLS directo, restringido a loopback (`127.0.0.1`) o red `platform_internal`. |
| **`11434/TCP`** | HTTP | Red Interna / Host | Ollama Local | Conexión interna opcional a modelos locales sin exposición al exterior. |

---

## 3. Terminación TLS y Política de Certificados

1. **Protocolos Soportados:** Se habilita exclusivamente **TLSv1.2** y **TLSv1.3**. Protocolos obsoletos (SSLv3, TLS 1.0, TLS 1.1) son denegados por configuración.
2. **Cifrado de Alta Seguridad:** Cifrados ECDHE con curvas elípticas P-256 / P-384 y AES-GCM, garantizando *Forward Secrecy* estricto.
3. **Automatización ACME:** La configuración de Caddy (`deploy/caddy/Caddyfile`) automatiza la emisión y renovación trimestral de certificados TLS vía Let's Encrypt o ZeroSSL sin intervención manual.
4. **Infraestructura Privada:** En caso de redes corporativas cerradas, el archivo `deploy/nginx/nginx.conf` permite montar certificados emitidos por la Autoridad Certificadora (CA) interna de la organización.

---

## 4. Rate Limiting en Doble Capa (Perímetro + Dominio)

La plataforma aplica el principio de defensa en profundidad mediante limitación de tasa en dos niveles coordinados:

1. **Capa Perimetral (Proxy Reverso):**
   * **Zona:** `platform_api_zone` indexada por `$binary_remote_addr`.
   * **Tasa Base:** 50 peticiones por segundo por IP cliente.
   * **Ráfaga Permitida:** Ráfagas de hasta 30 peticiones sin retardo (`burst=30 nodelay`).
   * **Código de Rechazo:** `HTTP 429 Too Many Requests`.

2. **Capa de Dominio (Application RateLimiter):**
   * Gobernado por la entidad `RateLimiter` en `src/platform/api/rate-limiter.ts`.
   * Evalúa cuotas según el nivel contratado (`TIER_FREE`, `TIER_PRO`, `TIER_ENTERPRISE`) o el identificador de aplicación (`applicationId`).
   * Emite cabeceras de trazabilidad: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` y `Retry-After`.

---

## 5. Cabeceras de Seguridad Perimetral

Tanto Nginx como Caddy inyectan de forma mandatoria las siguientes cabeceras de respuesta HTTP:

* **`Strict-Transport-Security`:** `"max-age=63072000; includeSubDomains; preload"` (forzar HTTPS durante 2 años en navegadores modernos).
* **`X-Frame-Options`:** `"DENY"` (prevención de ataques de Clickjacking).
* **`X-Content-Type-Options`:** `"nosniff"` (bloqueo de derivación errónea de tipo MIME).
* **`Referrer-Policy`:** `"strict-origin-when-cross-origin"`.
* **`Content-Security-Policy`:** `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"`.

---

## 6. Despliegue de Referencia en Producción

El archivo `deploy/docker-compose.prod.yml` proporciona la definición oficial para levantar la pila contenerizada en un entorno Linux de producción:

```bash
# 1. Configurar variables de entorno productivas
cp .env.example .env

# 2. Desplegar la pila con proxy reverso seguro
docker-compose -f deploy/docker-compose.prod.yml up -d

# 3. Verificar estado de salud perimetral
curl -k https://localhost/api/v1/health/liveness
```

El contenedor `platform` ejecuta bajo usuario sin privilegios y monta el volumen persistente `platform_data` para resguardar la base de datos `data/app.db` y su diario WAL.
