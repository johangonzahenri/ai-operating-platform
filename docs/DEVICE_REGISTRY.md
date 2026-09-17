# Registro de Dispositivos Empresariales (Device Registry)

Este registro cataloga de forma rigurosa y verificable el hardware empresarial, periféricos locales y adaptadores de dispositivos integrados en la **AI Operating Platform**.

---

## 1. Declaración de Honestidad Operativa

```text
SOFTWARE ADAPTER != PHYSICAL HARDWARE STATUS
DEVICE RECOGNITION != ONLINE PRINTING
```

La presencia de un adaptador de software en `src/infrastructure/device/` y pruebas unitarias passing **no significa que el dispositivo físico esté encendido, conectado por cable o listo para operar en el entorno del usuario**. 

El sistema reporta explícitamente el estado de conexión del hardware físico de manera separada de la salud del código del adaptador.

---

## 2. Inventario de Dispositivos

### 2.1 Impresora Multifuncional Comercial Brother DCP-1600 Series

* **Identificador de Dispositivo:** `printer-brother-dcp1600`
* **Fabricante (Vendor):** Brother Industries, Ltd.
* **Modelo Identificado:** Brother DCP-1600 series
* **Puerto de Conexión Local:** `USB001` (Puerto USB local nativo de Windows)
* **Controlador del Sistema Operativo:** `Brother DCP-1600 series` (Driver GDI estándar)

#### Matriz de Estado Factual del Dispositivo:

| Dimensión | Estado Factual | Evidencia y Justificación Técnica |
| :--- | :--- | :--- |
| **Adaptador de Software** | `IMPLEMENTED` | Clase `BrotherPrinterAdapter` implementando la interfaz `BusinessDeviceAdapter` en `src/infrastructure/device/brother-printer-adapter.ts`. |
| **Hardware Descubierto** | `IDENTIFIED` | Dispositivo reconocido en el registro de hardware local bajo el puerto `USB001`. |
| **Hardware Conectado Físicamente** | `OFFLINE / DISCONNECTED` | Estado reportado por el sistema: `WorkOffline: True`. El cable USB no está conectado activamente o la impresora se encuentra apagada. |
| **Disponibilidad Operativa Real** | `UNAVAILABLE` | El método `health()` reporta `reachable: false` con mensaje descriptivo: *"Brother DCP-1600 series on port USB001 is currently offline (WorkOffline: True / USB disconnected)"*. |
| **Capacidad de Impresión (Print)** | `SUPPORTED (Software)` | La lógica de despacho de trabajos (`printRaw`, `PrintJob`) y validación de documentos está implementada y lista para transmitir en cuanto el hardware esté en línea. |
| **Monitoreo de Consumibles (Tóner)** | `UNSUPPORTED` | **Limitación Técnica Honesta:** El controlador GDI estándar por USB no expone niveles de tóner ni contadores de tambor sin el agente de software privativo de Brother. La plataforma reporta `UNSUPPORTED` en lugar de inventar porcentajes falsos. |
| **Gestión y Cancelación de Trabajos** | `SUPPORTED` | Consulta de estado de trabajos (`device.job_status`) y cancelación de colas (`device.job_cancel`) implementadas en el spooler. |

#### Tests de Verificación Automatizados:
* `tests/unit/business-device-printing.test.ts` (14 tests pass):
  - Verifica inicialización con parámetros por defecto (`USB001`).
  - Verifica reporte de estado offline sin errores no controlados.
  - Verifica capacidades soportadas y no soportadas (`device.consumables: UNSUPPORTED`).
  - Verifica creación, encolamiento y ciclo de vida de `PrintJob`.
  - Verifica rechazo de impresión cuando el dispositivo no está en línea (`READY`).

#### Documentación Relacionada:
* `docs/BUSINESS_DEVICES.md`
* `docs/PRINT_OPERATIONS.md`
