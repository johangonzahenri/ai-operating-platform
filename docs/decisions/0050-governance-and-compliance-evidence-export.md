# ADR 0050: Governance & Compliance Evidence Export

## Estado
**APROBADA** (Fase 78 / `AOP-COMPLIANCE-EXPORT`)

## Fecha
Septiembre de 2026

## Contexto
A medida que la plataforma opera en entornos multi-empresariales y coordina flujos de trabajo autónomos, delegaciones y reconciliaciones gobernadas (Fases 75-77), surge la necesidad obligatoria de exportar paquetes de evidencia inmutables, deterministas y sellados criptográficamente para auditorías internas, revisiones regulatorias, compliance y análisis de incidentes.

Antes de la Fase 78, los datos de gobernanza se encontraban dispersos en repositorios de entidades individuales (`EnterprisePortfolio`, `GovernanceMandate`, `WorkflowInstance`, `ApprovalRequest`, `MandateReconciliationReport`, etc.) sin un contrato de exportación estandarizado, determinista, seguro ante fuga de credenciales y con garantía de integridad por hash criptográfico SHA-256.

### Principios e Invariantes de la Exportación de Evidencia:
1. **Invariante de Solo Lectura (Zero State Mutation):**
   La generación de paquetes de evidencia es 100% libre de efectos secundarios sobre el estado del sistema. NUNCA muta entidades, versiones de concurrencia ni registros históricos.

2. **Inferencia LLM Cero (0 LLM Inference):**
   Toda la agregación de datos, filtrado, redacción de secretos, serialización canónica y sellado criptográfico es 100% determinista mediante algoritmos puros en TypeScript.

3. **Cero Dependencias Externas en Tiempo de Ejecución (0 External Dependencies):**
   Implementado estrictamente utilizando los módulos nativos de Node.js (`node:crypto`) y utilidades canónicas del repositorio (`canonicalJsonStringify`, `SensitiveDataRedactor`), preservando `dependencies: {}`.

4. **Aislamiento Estricto de Inquilinos (Tenant Boundary Isolation):**
   Toda solicitud de exportación está anclada al inquilino autenticado (`tenantId`). Cualquier intento de referenciar recursos o alcances de otros inquilinos falla de forma segura con `TenantBoundaryViolationError` o `EvidenceExportNotFoundError` (*fail-closed*).

5. **Límites Estrictos y Paginación Gobernada:**
   - Rango de fechas máximo: 90 días (`MAX_DATE_RANGE_MS`).
   - Límite máximo de registros por exportación: 1,000 registros (`MAX_EXPORT_RECORDS`).
   - Validación cronológica: `fromDate <= toDate`.

6. **Redacción de Datos Sensibles y Sellado SHA-256:**
   Todos los registros exportados son procesados por `SensitiveDataRedactor` para eliminar claves API, contraseñas y tokens. El paquete resultante se serializa canónicamente y se genera un hash SHA-256 inmutable en el manifiesto (`EvidenceExportManifest.integritySeal`).

## Decisión

1. **Dominio de Exportación de Evidencia (`src/domain/governance/`):**
   - **`evidence-export.ts`**: Definiciones de tipos para los 9 alcances de exportación (`TENANT`, `PORTFOLIO`, `ENTERPRISE`, `WORKFLOW`, `EXECUTION`, `MANDATE`, `APPROVAL`, `RECONCILIATION`, `AUDIT_TRAIL`), entidad `EvidenceExportPackage`, manifiesto `EvidenceExportManifest` y serialización canónica `canonicalJsonStringify()`.
   - **`evidence-export-errors.ts`**: Jerarquía formal de excepciones (`EvidenceExportError`, `EvidenceExportValidationError`, `EvidenceExportPermissionDeniedError`, `EvidenceExportNotFoundError`, `EvidenceExportScopeForbiddenError`, `EvidenceExportIntegrityError`, `TenantBoundaryViolationError`, `EvidenceFilterBoundsExceededError`).

2. **Capa de Aplicación (`src/application/governance/`):**
   - **`EvidenceExportService` (`evidence-export-service.ts`)**:
     - Agregación estructurada a través de repositorios de dominio (portafolios, mandatos, ejecuciones, auditoría, reconciliación, aprobaciones).
     - Validación de límites de consulta y aislamiento de inquilino.
     - Redacción automática de secretos mediante `SensitiveDataRedactor`.
     - Caché de idempotencia en memoria (`idempotencyKey`).
     - Sellado criptográfico SHA-256 mediante `node:crypto`.

3. **Exposición REST API y SDK Client (`src/platform/api/`, `src/platform-client/`):**
   - **Endpoint REST**: `POST /api/v1/governance/evidence/export` con autenticación por API Key / RBAC y soporte de idempotencia (`Idempotency-Key` header).
   - **SDK Client**: Métodos tipados `client.exportEvidence()` y `client.governance.exportEvidence()`.

4. **Suites de Pruebas Automatizadas:**
   - `tests/unit/evidence-export.test.ts`: 23 pruebas unitarias exhaustivas (invariantes de solo lectura, los 9 alcances, límites de fechas/registros, redacción de secretos, sellado SHA-256, OCC/idempotencia).
   - `tests/platform/evidence-export.test.ts`: 9 pruebas de integración de plataforma HTTP REST y SDK Client.

## Consecuencias

### Positivas:
- Auditoría regulatoria y de gobernanza determinista con sellado criptográfico demostrable.
- Soporte para exportación en 9 dimensiones organizacionales sin riesgo de mutación ni fuga de datos sensibles.
- Cero dependencias añadidas al proyecto (`dependencies: {}`).
- Cobertura completa de pruebas (32 pruebas de Fase 78 añadidas, total plataforma 1580 tests verdes).

### Neutras:
- Las exportaciones masivas que superen 1,000 registros requieren que el cliente pagine mediante ventanas temporales más acotadas dentro de los 90 días permitidos.
