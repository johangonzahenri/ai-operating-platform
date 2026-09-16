# CLOUD DEPLOYMENT & PRODUCTION ARCHITECTURE GUIDE

## 1. Visión General

La **AI Operating Platform** está diseñada bajo una arquitectura desacoplada y portable:

$$\text{Local Developer Mode (SQLite WAL)} \longrightarrow \text{Deployable Container (Docker)} \longrightarrow \text{Cloud Multi-Tenant (Kubernetes / PostgreSQL)}$$

---

## 2. Modelos Arquitectónicos: Local vs Cloud

```text
CURRENT LOCAL ARCHITECTURE (Default):
Node.js Runtime (Localhost:3000) ──> SQLite (WAL Mode File persistence) ──> Local In-Memory Event Bus

TARGET CLOUD ARCHITECTURE (Deployable Target):
Load Balancer / Cloud Ingress (TLS Termination)
       ↓
API Gateway / Platform API Pods (Stateless Cluster)
       ↓
PostgreSQL 16 Cluster (Durable ACID Store) + S3 / GCS (AR 3D Assets)
       ↓
OpenTelemetry Collector (Distributed Traces & Prometheus Metrics)
```

---

## 3. Contenedores y Docker

### Multi-Stage Build
El [`Dockerfile`](../Dockerfile) implementa:
1. **Stage 1 (Builder)**: Compilación TypeScript, dependencias completas y optimización.
2. **Stage 2 (Runner)**: Imagen minimalista basada en `node:22-alpine`, usuario sin privilegios de root (`nodejs:1001`), y limpieza de paquetes de desarrollo.
3. **Healthcheck nativo**: Monitorea `/api/v1/health` cada 30 segundos.

### Ejecución con Docker Compose
```bash
# Iniciar stack completo (Platform API + PostgreSQL + OpenTelemetry Collector)
docker-compose up -d

# Verificar estado y logs
docker-compose ps
docker-compose logs -f platform-api
```

---

## 4. Estrategia de Migración y Persistencia

| Nivel | Base de Datos | Driver | Caso de Uso |
| :--- | :--- | :--- | :--- |
| **Local / Edge** | SQLite 3 (WAL) | `better-sqlite3` | Desarrollo rápido, pruebas CI, despliegues autónomos en borde. |
| **Cloud / SaaS** | PostgreSQL 16+ | `pg` / `PostgresTaskRepository` | Alta concurrencia, replicación multi-zona, backups point-in-time. |

---

## 5. Gestión de Secretos y Configuración Segura

- **Principio de Cero Secretos en Código**: Ninguna credencial (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, passwords de BD) se almacena en el repositorio ni en imágenes Docker.
- **Inyección en Tiempo de Ejecución**: A través de variables de entorno administradas por AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault o Kubernetes Secrets.
- **Sanitización de Logs**: El logger estructurado de la plataforma enmascara automáticamente tokens, contraseñas y datos biométricos.

---

## 6. Healthchecks y Observabilidad

- **Liveness Probe**: `GET /api/v1/health` verifica que el proceso HTTP responde.
- **Readiness Probe**: Verifica la conectividad con el almacenamiento persistente (`sqlite` o `postgres`).
- **Telemetry Export**: Compatibilidad con receptores OTLP (gRPC puerto 4317, HTTP puerto 4318) y Prometheus (puerto 8889).
