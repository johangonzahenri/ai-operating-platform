# REAL OBSERVABILITY & TELEMETRY ARCHITECTURE

## 1. Separación de Responsabilidades: Telemetría vs Auditoría

$$\text{Telemetry (¿Cómo se comporta el sistema?)} \neq \text{Audit (¿Quién ejecutó qué operación y con qué permisos?)}$$

---

## 2. Modelo de Telemetría OpenTelemetry (OTel)

```text
Platform API / Core Runtime (Spans & Metrics)
       ↓
OpenTelemetry Exporter (Batching & In-Memory Buffer)
       ↓
OTLP Receiver (gRPC 4317 / HTTP 4318)
       ↓
Observability Backends (Prometheus / Grafana / Jaeger)
```

---

## 3. Sanitización Automática de Secretos (Log Redaction)

El logger estructurado garantiza que claves privadas, tokens Bearer, contraseñas y API keys nunca se emitan en texto plano:
- `sk-live-...` $\longrightarrow$ `[REDACTED]`
- `Bearer eyJ...` $\longrightarrow$ `Bearer [REDACTED]`
- Datos biométricos y contraseñas $\longrightarrow$ `[REDACTED]`

---

## 4. Retención de Datos Diferenciada

| Flujo de Datos | Período de Retención | Almacenamiento |
| :--- | :--- | :--- |
| **Logs Estructurados** | 14 días | Disco local / Syslog |
| **Métricas & Histogramas** | 90 días | Prometheus / TSDB |
| **Trazas Distribuidas (Spans)** | 7 días | OTel Collector / Jaeger |
| **EventStore Duradero** | Indefinido (Inmutable) | SQLite WAL / PostgreSQL |
| **Audit Log de Seguridad** | 365 días (Cumplimiento) | Registro de Auditoría Inmutable |
