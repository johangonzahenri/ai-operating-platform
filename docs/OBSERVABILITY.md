# Observability & Telemetry Architecture (Observabilidad y Telemetría)
## Estándares de Trazabilidad, Métricas OpenTelemetry y Auditoría (v1.1.0)

La observabilidad en la **AI Operating Platform** está diseñada para proporcionar diagnósticos exhaustivos en tiempo real y análisis forense inmutable.

---

## 1. Los Tres Pilares de la Observabilidad

1. **Logs Estructurados en Formato JSON:**
   Emitidos por `ProductionStructuredLogger` con marca temporal ISO, nivel (`INFO`, `WARN`, `ERROR`), subsistema y `traceId`.
2. **Métricas de Consumo y Latencia:**
   * Conteo de invocaciones a modelos LLM y duración de inferencia en milisegundos.
   * Contadores de tokens generados y consumidos por agente y por inquilino.
   * Estado y latencia de transacciones en SQLite WAL.
3. **Trazabilidad Distribuida (OpenTelemetry):**
   * Cada tarea genera un `traceId` único que se propaga a través del enrutador HTTP, orquestador, pasarela de políticas, adaptadores de modelos y eventos de dominio.

---

## 2. Integración con Herramientas de Industria

* **Prometheus:** Métricas expuestas en formato estándar para monitoreo continuo.
* **Grafana:** Dashboards preconfigurados para supervisar la salud del cluster y consumo de cuotas.
* **Datadog / New Relic:** Compatibilidad completa gracias a exportadores OpenTelemetry estandarizados.
