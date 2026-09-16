# Print Operations & Document Generation (Operaciones de Impresión)
## Spooler Local Durable, Ciclo de Vida de PrintJob y Formatos (v1.1.0)

Este documento describe la arquitectura y ciclo de vida de los trabajos de impresión física emitidos por la plataforma.

---

## 1. Ciclo de Vida de un PrintJob

```text
[QUEUED] ──► [PRINTING] ──┬──► [COMPLETED]
                          └──► [FAILED]
```

* **`QUEUED`:** El documento fue recibido y almacenado en el spooler local.
* **`PRINTING`:** La orden fue transferida exitosamente al controlador de hardware del sistema operativo.
* **`COMPLETED`:** El trabajo concluyó sin errores reportados por el spooler.
* **`FAILED`:** Ocurrió un error de hardware, corte de conexión o atasco de papel.

---

## 2. Tipos de Documentos Soportados

1. **`RECEIPT` (Recibos y Tickets):** Formato optimizado para impresión térmica continua de comprobantes de venta.
2. **`INVOICE` (Facturas y Órdenes):** Formato estructurado con desglose de ítems e información fiscal.
3. **`LABEL` (Etiquetas de Despacho):** Documentos de una sola página para logística y paquetería.
