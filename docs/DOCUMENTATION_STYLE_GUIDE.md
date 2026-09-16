# Guía de Estilo Documental y Políticas de Idioma
## Estándares de Redacción, Nomenclatura y Traducción de AI Operating Platform (v1.1.0)

Este documento establece las políticas obligatorias de redacción, convenciones idiomáticas y lineamientos técnicos para autores y mantenedores de la **AI Operating Platform**.

---

## 1. Política General de Idiomas

| Entorno / Superficie | Idioma Normativo | Observaciones |
| :--- | :--- | :--- |
| **Documentación Oficial** | Español (Latinoamérica) / `es-419` | Manuales, guías arquitectónicas y reportes en español neutro profesional. |
| **Código Fuente & Tipos** | Inglés / `en` | Clases, interfaces, variables, métodos y comentarios técnicos en inglés. |
| **Interfaz de Usuario Web** | Español por defecto (`es-419`) | Conmutador dinámico a Inglés (`en`) sin recarga de página. |
| **Mensajes de Commit** | Convención Conventional Commits | Formato estándar `feat(scope): ...` o `fix(scope): ...` en inglés. |
| **Códigos de Error & Eventos** | Identificadores Técnicos en Inglés | `POLICY_VIOLATION`, `TASK_NOT_FOUND`, `execution.started`. |

---

## 2. Estándar de Español Latinoamericano

Para mantener la claridad y coherencia en toda la documentación técnica:
* Emplear vocabulario técnico ampliamente aceptado en la industria del software en América Latina.
* Evitar localismos o modismos específicos de un solo país.
* Traducir de forma consistente los conceptos funcionales:
  * `configuration` -> *configuración*
  * `application` -> *aplicación*
  * `device` -> *dispositivo*
  * `credential` -> *credencial*
  * `authorization` -> *autorización*
  * `execution` -> *ejecución*
  * `task` -> *tarea*
  * `tool` -> *herramienta*
  * `model` -> *modelo*
  * `agent` -> *agente*
  * `telemetry` -> *telemetría*
  * `observability` -> *observabilidad*
  * `security` -> *seguridad*

### Manejo de Términos Compuestos y de Dominio:
* Cuando aparezca un término arquitectónico clave por primera vez, puede presentarse en ambos idiomas:
  * *Plano de Control (Control Plane)*
  * *Fábrica de Aplicaciones (Application Factory)*
  * *Inquilino lógico (Tenant)*
* En las apariciones subsecuentes, mantener consistencia o usar el término de código cuando se haga referencia a la implementación.

---

## 3. Identificadores Técnicos Inalterables

**REGLA CRÍTICA:** Nunca deben traducirse ni alterarse los identificadores técnicos:
* Rutas de la API REST: `/api/v1/tasks`, `/api/v1/executions` (NUNCA `/api/v1/tareas`).
* Métodos HTTP: `GET`, `POST`, `DELETE`.
* Tipos de eventos de dominio: `task.completed`, `model.requested`, `policy.evaluated`.
* Claves de objetos JSON: `taskId`, `executionId`, `aggregateId`, `tenantId`.
* Códigos de error de plataforma: `CRASH_RECOVERY_RECONCILED`, `POLICY_VIOLATION`.
* Nombres de clases o SDK: `PlatformClient`, `CoreRuntime`, `AutonomousOperation`.

---

## 4. Estándar de Enlaces Internos y Rutas

* **Prohibición Absoluta de Enlaces Absolutos del Host:**
  Bajo ninguna circunstancia se deben dejar rutas como `file://<host-path>c:/Users/...` o `C:\Users\...` en documentos oficiales de Git.
* **Uso Exclusivo de Enlaces Relativos:**
  Todos los enlaces entre documentos de la carpeta `docs/` deben ser relativos:
  ```markdown
  [Referencia de API](API_REFERENCE.md)
  [ADR 0004](decisions/0004-core-runtime-execution-model.md)
  [Manual Oficial](../docs/MANUAL_OFICIAL.md)
  ```

---

## 5. Principio de Veracidad Técnica (Truth Principle)

La documentación debe describir exclusivamente la **realidad del sistema**:
1. No inventar integraciones, certificaciones ni servicios que no existan en el código fuente.
2. Utilizar siempre la escala de estados de madurez oficial:
   * `IMPLEMENTADO`
   * `PARCIAL`
   * `CONFIGURADO`
   * `NO CONFIGURADO`
   * `NO DISPONIBLE`
   * `NO SOPORTADO`
   * `DISEÑADO`
   * `FUTURO`
3. Ante hardware físico (e.g. impresora Brother DCP-1600), reportar con exactitud el estado descubierto por el sistema operativo (e.g. `Offline / WorkOffline`), sin falsear disponibilidad.
