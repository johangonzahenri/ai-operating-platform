# Application Factory 2.0 (Fábrica de Aplicaciones)
## Generación Declarativa de Micro-Frontends y Backends de Agentes (v1.1.0)

La **Application Factory** (Fábrica de Aplicaciones) es el motor generativo de la plataforma que automatiza la creación de aplicaciones gobernadas a partir de especificaciones declarativas.

---

## 1. Arquitectura de Generación

```text
[Manifiesto JSON] ──► [Application Factory Engine] ──► [Micro-Frontend + Agentes + Configuración de API]
```

### Capacidades del Motor 2.0:
* **Validación Previa:** Verificación automática de que las capacidades solicitadas existen en el `ToolRegistry` y que el inquilino posee presupuesto suficiente.
* **Generación de UI Reactiva:** Ensamblaje de componentes visuales optimizados y accesibles con estilos consistentes y soporte para internacionalización.
* **Gobernanza Nativa:** Las aplicaciones generadas nacen automáticamente vinculadas a las políticas *default-deny* y al sistema de observabilidad de la plataforma.
