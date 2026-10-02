# ADR-002: Arquitectura Hexagonal (Puertos y Adaptadores)

## Estado
ACEPTADA

## Contexto
El Core Engine debe permanecer agnóstico a los proveedores de modelos concretos (Ollama, OpenAI, Anthropic), sistemas de almacenamiento (SQLite, In-Memory) e interfaces de usuario.

## Decisión
Adoptar Arquitectura Hexagonal en todos los subsistemas:
- El dominio define puertos (interfaces) para modelos, herramientas, tareas, eventos y aplicaciones.
- La infraestructura proporciona adaptadores concretos adhiriéndose estrictamente a los contratos del dominio.
- La raíz de composición conecta las dependencias explícitamente sin singletons globales.

## Alternativas Consideradas
- Inyección de dependencias concretas directamente en todo el dominio: rechazada por violación de pureza.

## Consecuencias
- La infraestructura conectable permite la simulación sin esfuerzo en pruebas unitarias.
- Alta resiliencia y evolución modular.
