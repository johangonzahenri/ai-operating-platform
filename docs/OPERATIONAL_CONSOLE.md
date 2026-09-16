# Operational Console (Consola Operacional de Inteligencia)
## Manual de Operaciones y Reconstrucción de Estados de Ejecución (v1.1.0)

La **Operational Console** (Consola Operacional) es el componente central de auditoría y diagnóstico para ingenieros de sistemas y operadores de inteligencia artificial.

---

## 1. Fuente de Verdad y Consumo de APIs

La consola no mantiene un estado secundario ni duplica datos; consume estrictamente el contrato oficial de la Platform API:
* `GET /api/v1/health`: Telemetría de estado del motor y métricas de concurrencia.
* `GET /api/v1/events`: Consulta cronológica paginada al almacén de eventos durables (`EventStore`).
* `GET /api/v1/executions/:id`: Reconstrucción forense del ciclo de vida de una ejecución.

---

## 2. Flujo de Inspección Forense

```text
[Selección de Evento] ──► [Apertura de Modal Accesible] ──► [Inspección de JSON Inmutable] ──► [Trazabilidad por traceId]
```

1. **Correlación de Trazas:** El operador puede copiar el `traceId` de un evento sospechoso o fallido y filtrar el flujo de eventos para reconstruir cada paso desde la solicitud del usuario hasta el resultado durable.
2. **Preservación de Inmutabilidad:** Los payloads mostrados provienen directamente de registros inmutables congelados en SQLite; no pueden ser alterados por clientes web.
