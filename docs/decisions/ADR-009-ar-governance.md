# ADR-009: Gobernanza de Probador Virtual AR/3D

## Estado
ACEPTADA

## Contexto
Las características del probador virtual requieren identificadores de activos 3D gobernados, calibraciones de cuerpo de avatar y reglas de dimensionamiento deterministas sin fallar si faltan activos 3D.

## Decisión
Gobernar los activos de AR con el formato URN `urn:tentaciones:ar:<category>:<productSlug>`, SemVer estricto (v1.0.0), perfiles de avatar (Nova, Sora, Mateo) y reglas de tamaño deterministas. Los activos malformados o faltantes se degradan de forma segura a `STANDARD_2D_VIEW`.

## Alternativas Consideradas
- Almacenar URLs de archivos 3D crudos no validados en los prompts del LLM: rechazado por riesgos de alucinación y confiabilidad.

## Consecuencias
- Experiencia de probador virtual resiliente.
- Asesoramiento de tamaño confiable respaldado por tablas de medidas deterministas.
