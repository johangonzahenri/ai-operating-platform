# Inteligencia Real

La plataforma puede ejecutar el mismo ciclo de vida de Core con un modelo real sin cambiar el Planner, Coordinator, Agent Runtime o adaptadores de aplicación. El valor predeterminado sigue siendo el stub determinista para que las pruebas unitarias, de integración y entre proyectos existentes no requieran acceso a Internet o claves de API.

Cuando `MODEL_PROVIDER` no es `stub`, la raíz de composición conecta `LLMPlanner -> ModelGateway -> ProviderFactory -> proveedor seleccionado`. Los planes siguen siendo estructurados y fallan de forma segura (fail closed): el validador y el gateway de política existentes se ejecutan después de la generación del modelo y antes de la ejecución.

Tentaciones continúa llamando solo a la API de Plataforma (Platform API). Recibe resultados de descubrimiento estructurados y nunca recibe credenciales de modelo o configuración específica del proveedor. La propiedad del producto permanece local en Tentaciones.
