# Proyecto 08: Infraestructura Cloud & Topología Perimetral
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-08-INFRA`
* **Área de Responsabilidad:** Topología de Red, Terminación TLS, Contenedores Docker y CI/CD
* **Ubicación en Repositorio:** `deploy/`, `.github/workflows/`
* **Línea Base de Pruebas:** Manifiestos verificados + Integración en GitHub Actions CI
* **Estado Kanban:** `DONE` (Manifiestos y Topología Operativos) | `IN REVIEW` (`AOP-V1-EXIT`)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Seguridad Perimetral y Terminación TLS:** El servidor nativo Node.js (`127.0.0.1:3000`) nunca se expone directamente a redes públicas. Se implementa una capa perimetral con Nginx o Caddy que termina TLS 1.2/1.3, fuerza HSTS (`max-age=63072000`), Content-Security-Policy y X-Frame-Options: DENY (ADR 0026).
2. **Rate Limiting Perimetral:** Nginx aplica limitación de tasa a nivel IP (50 req/s con burst de 100) para amortiguar ataques de denegación de servicio (DoS) antes de alcanzar la capa de aplicación.
3. **Automatización ACME:** Caddyfile configurado para aprovisionamiento y renovación transparente de certificados Let's Encrypt sin intervención manual.
4. **Orquestación Multi-Contenedor:** `deploy/docker-compose.prod.yml` levanta el servicio de plataforma, el proxy perimetral y volúmenes persistentes en una red interna aislada (`platform_internal`).
5. **Puertas de Calidad CI/CD:** GitHub Actions ejecuta compilación TypeScript estricta, la suite completa de 1019 tests y la auditoría `docs:check` antes de cualquier merge en ramas principales.

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fase 55: Topología de Red y Manifiestos de Producción (`AOP-NETWORK`) (v1.2)    │
│ • Configuraciones declarativas en `deploy/nginx/` y `deploy/caddy/`.                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 55: Orquestación Docker Compose y Pipeline GitHub Actions (v1.2)           │
│ • Dockerfile multi-stage build y workflow CI con compresión de artefactos.             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [IN REVIEW] Fase 58: Certificación de Criterios de Salida a Producción (`AOP-V1-EXIT`) │
│ • Pruebas de carga, verificación de SLOs y auditoría de límites de concurrencia.       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
