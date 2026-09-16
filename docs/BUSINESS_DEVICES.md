# Business Devices & Hardware Integration

## 1. Overview & Architectural Principle

The **AI Operating Platform** provides a secure, tenant-isolated, capability-governed boundary for physical business hardware, point-of-sale peripherals, and warehouse logistics equipment.

Following the fundamental invariant:
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$

Devices are managed at the **Platform & Infrastructure Layer**, never polluting the Core Engine internals. Applications interact with physical hardware exclusively through standard **Platform API v1** contracts and capability grants (`device.print`, `device.manage`).

---

## 2. Hardware Truth & Zero Fabrication

In accordance with strict operational truth standards:
- Real hardware discovery on the local Windows host discovered a **Brother DCP-1600 series** printer on port `USB001` with driver `Brother DCP-1600 series`.
- Operational state: `WorkOffline: True` (offline / awaiting physical USB plug-in).
- Status classification:
  - **SUPPORTED**: Local raw GDI spooler queue submission via Windows print subsystem.
  - **UNSUPPORTED**: Remote network SNMP/IPP toner levels querying (local raw GDI devices without vendor proprietary agents do not expose direct toner counters).
  - **UNAVAILABLE / READY**: Real-time status accurately distinguishing whether the device is physically connected and online or offline.

---

## 3. Device Domain Model

A `BusinessDevice` is represented by:
- **`id`**: Unique identifier (e.g. `printer-brother-dcp1600`).
- **`name`**: Human-readable label (e.g. `Brother DCP-1600 Series Warehouse Printer`).
- **`type`**: `PRINTER` | `SCANNER` | `PAYMENT_TERMINAL` | `POS_DISPLAY` | `SCALE` | `CAMERA` | `SENSOR`.
- **`vendor`**: Hardware manufacturer (`Brother`, `Zebra`, `Epson`, etc.).
- **`model`**: Model designation (`Brother DCP-1600 series`).
- **`connection`**:
  - `type`: `USB` | `NETWORK_IP` | `BLUETOOTH` | `SERIAL` | `CLOUD` | `SPOOLER`
  - `port`: `USB001`
  - `driverName`: `Brother DCP-1600 series`
  - `spoolerName`: `winprint`
- **`capabilities`**: Granular map with support statuses (`SUPPORTED`, `UNSUPPORTED`, `AVAILABLE`, `UNAVAILABLE`).
- **`tenantId`**: Tenant isolation boundary (e.g. `tenant-tentaciones`).
- **`status`**: `READY` | `DEGRADED` | `UNAVAILABLE` | `UNCONFIGURED` | `FAILED` | `BUSY`.

---

## 4. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/devices` | List registered business devices for caller tenant |
| `GET` | `/api/v1/devices/:id` | Get specific device details and connection |
| `POST` | `/api/v1/devices` | Register a new business device |
| `PATCH` | `/api/v1/devices/:id` | Update device parameters |
| `DELETE` | `/api/v1/devices/:id` | Unregister a device |
| `GET` | `/api/v1/devices/:id/health` | Run an active health probe against the device |
| `GET` | `/api/v1/devices/:id/capabilities` | Inspect declared device capabilities |
| `GET` | `/api/v1/devices/:id/status` | Get real-time connection status |
| `GET` | `/api/v1/devices/:id/consumables` | Query consumable levels (or unsupported disclaimer) |

---

## 5. Security & Isolation Invariants

1. **Tenant Isolation**: A tenant cannot query, control, or submit print jobs to another tenant's devices.
2. **Capability Verification**: An application cannot dispatch print jobs unless granted `device.print`.
3. **Suspension Block**: Suspended applications or tenants are forbidden from hardware operations.
4. **Idempotency**: Duplicate job requests with the same `Idempotency-Key` return identical responses without duplicate hardware execution.
