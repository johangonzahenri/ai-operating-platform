# ADR 0046: Separación de Presupuesto, Costos y Gobernanza Financiera

## Estado
ACEPTADA

## Contexto
A medida que la AI Operating Platform evoluciona, necesitamos distinguir entre limitar el consumo de recursos (presupuesto) y rastrear el impacto financiero (contabilidad de costos). Mezclar estas preocupaciones dificulta implementar límites suaves, contabilidad posterior a la ejecución (donde solo conocemos los tokens después de la llamada) y atribución precisa.

## Decisión
Separaremos la contabilidad de costos de la gobernanza de recursos:
1. `TeamResourceBudget` sigue siendo responsable de la Gobernanza de Recursos (límites estrictos).
2. `CostRecord` y `CostSummary` manejarán la Contabilidad de Costos (seguimiento del consumo real y atribución financiera).
3. Definimos distintos `BudgetLimitType`s:
   - **HARD**: Puerta previa a la ejecución (DENY si se excede).
   - **SOFT**: Umbral de advertencia.
   - **ACCOUNTED**: Contabilidad posterior a la ejecución (puede excederse, como los tokens).
   - **RESERVED**: Cuota pre-reservada (reservar → ejecutar → liquidar → liberar).

## Consecuencias
- Mejor atribución financiera.
- Manejo adecuado de métricas que solo se conocen después de la ejecución (por ejemplo, tokens).
- Clara separación de preocupaciones entre las capas de dominio.
