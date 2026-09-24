# Catálogo de Casos de Uso de Automatización Empresarial

> **Matriz Canónica de Casos de Uso, Roles de Agentes, Herramientas y Niveles de Supervisión**  
> **Línea Base:** v1.4.0 Baseline | **Fase Activa:** Fase 141 (`AOP-MULTI-AGENT-WEB-AI`)  

---

## 1. Matriz Canónica de Casos de Uso por Área de Negocio

| Área de Negocio | Proceso / Caso de Uso | Agente Asignado | Herramientas Principales | Nivel de Automatización | Supervisión Humana | Requisito de Evidencia |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sales** | Calificación de Leads & Oportunidades | `RESEARCH_AGENT` | `web.search`, CRM APIs | Alto (Autónomo) | Opcional | Obligatorio |
| **Marketing** | Monitoreo de Precios y Competencia | `WEB_AGENT` | `web.search`, `web.extract` | Alto (Autónomo) | Opcional | Obligatorio (`StructuredClaimEvidence`) |
| **Customer Support** | Triaje y Resolución de Consultas | `MODEL_AGENT` | Base de Conocimiento, Chat | Medio (Asistido) | Requerida ante riesgo alto | Opcional |
| **Operations** | Conciliación de Turnos y Procesos | `AUTOMATION_AGENT` | Base de Datos, Scheduler | Alto (Autónomo) | Por excepción | Obligatorio |
| **Finance** | Detección de Distorsión de Costos | `RESEARCH_AGENT` | `calculator`, APIs Contables | Alto (Autónomo) | Requerida para ajustes | Obligatorio |
| **Procurement** | Búsqueda y Comparación de Repuestos | `WEB_AGENT` | `web.search`, `web.extract` | Alto (Autónomo) | Opcional para cotizar | Obligatorio (`OEM Part Verification`) |
| **Inventory** | Reabastecimiento Predictivo | `AUTOMATION_AGENT` | ERP Stock APIs | Alto (Autónomo) | Requerida para POs mayores | Obligatorio |
| **Logistics** | Trazabilidad de Guías de Despacho | `AUTOMATION_AGENT` | APIs Courier, `device.print`| Alto (Autónomo) | Opcional | Obligatorio |
| **HR** | Pre-selección Curricular Bounding | `RESEARCH_AGENT` | Parser de Documentos | Medio (Asistido) | Requerida para entrevistas | Obligatorio |
| **Analytics** | Agregación de KPIs Ejecutivos | `NATIVE_AGENT` | Agregador Matemático | Alto (Determinista) | Opcional | Obligatorio (0 Alucinación) |
| **Engineering** | Generación de Patches y Refactor | `CODE_AGENT` | Codex / OpenHands / Aider | Alto (Sandboxed) | Requerida para PR / Merge | Obligatorio (Passing Tests) |
| **IT** | Monitoreo Perimetral y Diagnóstico | `NATIVE_AGENT` | `system.ping`, Probes | Alto (Continuo) | Por anomalía crítica | Obligatorio |
| **Compliance** | Exportación de Evidencia SHA-256 | `VERIFICATION_AGENT` | `evidence.export` | Alto (Determinista) | Opcional | Obligatorio (Sello Criptográfico) |

---

## 2. Protocolo de Ejecución Evidence-First

Ningún agente asignado a procesos críticos puede emitir conclusiones basadas únicamente en inferencia generativa:
1. **Afirmación:** Tesis o hallazgo extraído.
2. **Fuente:** URL, registro de base de datos o llamada a herramienta verificable.
3. **Timestamp:** Marca temporal inmutable del momento de la captura.
4. **Verificación Determinista:** Confirmación algorítmica de esquemas o invariantes matemáticas.
