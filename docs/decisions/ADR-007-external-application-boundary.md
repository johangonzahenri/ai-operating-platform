# ADR-007: Frontera de Aplicaciones Externas

## Estado
ACEPTADA

## Contexto
Las aplicaciones consumidoras externas deben ser modeladas como entidades de primera clase en el registro de la plataforma sin importar clases de dominio internas.

## Decisión
Definir la entidad de dominio `ExternalApplication` y el `ApplicationRegistryPort` para administrar metadatos, estado de implementación, estado de ejecución, modo de autenticación y alcances de capacidades.

## Alternativas Consideradas
- Listas de aplicaciones codificadas directamente (*hardcoded*) en el enrutador: rechazadas por falta de gobernanza dinámica.

## Consecuencias
- Gobernanza de aplicaciones limpia y catálogo de plataforma autodescriptivo.
- Extensible a futuros consumidores (por ejemplo, Diagnósticos de Vehículos, Soporte Técnico).
