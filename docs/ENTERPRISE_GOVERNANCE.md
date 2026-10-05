# Gobernanza Empresarial y Plano de Control — Plataforma Operativa de IA

## 1. Visión General del Modelo de Gobernanza
El marco de Gobernanza Empresarial garantiza la seguridad operativa auditable y de fallo seguro (fail-closed) en todas las interacciones de IA:
$$\text{Identidad} \to \text{Autenticación} \to \text{Autorización} \to \text{Política} \to \text{Ejecución} \to \text{Auditoría} \to \text{Revisión}$$

---

## 2. Clasificación de Riesgos de IA y Supervisión Humana
Las operaciones se clasifican en cuatro niveles de riesgo con salvaguardas obligatorias de humanos en el bucle (human-in-the-loop):

| Nivel de Riesgo | Operaciones de Ejemplo | Nivel de Supervisión | Mecanismo de Aplicación |
| :--- | :--- | :--- | :--- |
| **LOW** (Bajo) | Descubrimiento de productos, búsqueda en el catálogo | `AUTOMATIC` | Totalmente automatizado |
| **MEDIUM** (Medio) | Recomendaciones, probador virtual AR, mutaciones de carrito | `AUTOMATIC_AUDIT` / `USER_CONFIRMATION` | Registrado en pista de auditoría / Confirmación del usuario |
| **HIGH** (Alto) | Pago de pedidos, pagos, cambios de credenciales de aplicación | `USER_CONFIRMATION` | Aprobación explícita del usuario |
| **CRITICAL** (Crítico) | Mutaciones de políticas de seguridad, baja de inquilinos | `HUMAN_APPROVAL` | Aprobación de administrador de operador dual |

---

## 3. Gestión del Ciclo de Vida de las Políticas
Las políticas siguen un ciclo de vida formal de versionado inmutable:
$$\text{DRAFT} \to \text{REVIEW} \to \text{APPROVED} \to \text{ACTIVE} \to \text{SUSPENDED} \to \text{RETIRED}$$
Las políticas activas son inmutables. Las modificaciones producen una nueva versión (`version: N+1`) asegurando la reproducibilidad de la auditoría.

---

## 4. Ciclo de Vida de Incorporación y Baja de Aplicaciones
1. **Incorporación (Onboarding)**: `REGISTER` $\to$ `IDENTIFY` $\to$ `AUTHENTICATE` $\to$ `REQUEST_CAPABILITIES` $\to$ `APPROVE` $\to$ `CONNECT` $\to$ `OBSERVE`.
2. **Baja (Offboarding)**: `DISABLE` $\to$ `REVOKE` $\to$ `AUDIT`. Las credenciales de la aplicación se invalidan de inmediato, mientras que los diarios de eventos históricos permanecen intactos para el cumplimiento normativo.
