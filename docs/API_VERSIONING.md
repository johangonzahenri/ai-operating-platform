# API Versioning & Compatibility Policy (Versionado de API)
## Políticas de Evolución, Compatibilidad Retroactiva y Ciclo de Vida (v1.1.0)

La **Platform API** sigue estrictamente las directrices de **Versionado Semántico (SemVer 2.0.0)**.

---

## 1. Esquema de Versionado de Rutas

* **Versión Canónica Actual:** `/api/v1/*`
* **Prefijo Retrocompatible:** `/api/*` (redirige internamente a `/api/v1/*` para proteger clientes existentes).
* **Introducción de Versiones Mayores:**
  Cualquier cambio que rompa contratos existentes (eliminación de campos, cambio de tipos de datos o alteración de códigos de error) se introducirá bajo un nuevo prefijo (`/api/v2/*`).

---

## 2. Reglas de Compatibilidad hacia Atrás

1. **Adición de Campos:** La incorporación de nuevas propiedades opcionales en respuestas JSON no se considera cambio disruptivo.
2. **Depreciación de Endpoints:** Antes de retirar cualquier endpoint, este debe permanecer con advertencias de encabezado `Warning: 299 - Deprecated` durante un ciclo completo de versión menor.
