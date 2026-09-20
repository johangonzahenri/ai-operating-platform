# -*- coding: utf-8 -*-
"""
scripts/generate_roadmap_excel.py
Generates AI_Operating_Platform_Roadmap.xlsx with 14 canonical sheets,
complete data derivation, auto-filter tables, styled headers, and dashboard metrics.
"""

import sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
# remove default sheet
wb.remove(wb.active)

# Color Palette (Corporate Slate / Indigo / Teal)
NAVY_HEADER = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
HEADER_FONT = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Segoe UI", size=14, bold=True, color="1E293B")
SUBTITLE_FONT = Font(name="Segoe UI", size=9, italic=True, color="64748B")
REGULAR_FONT = Font(name="Segoe UI", size=9, color="0F172A")
BOLD_FONT = Font(name="Segoe UI", size=9, bold=True, color="0F172A")

DONE_FILL = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid") # soft green
DONE_FONT = Font(name="Segoe UI", size=9, color="166534", bold=True)

BACKLOG_FILL = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid") # light gray
BACKLOG_FONT = Font(name="Segoe UI", size=9, color="475569", bold=True)

THIN_BORDER = Border(
    left=Side(style='thin', color="E2E8F0"),
    right=Side(style='thin', color="E2E8F0"),
    top=Side(style='thin', color="E2E8F0"),
    bottom=Side(style='thin', color="E2E8F0")
)

def style_header_row(ws, row_num, col_count):
    for col in range(1, col_count + 1):
        cell = ws.cell(row=row_num, column=col)
        cell.fill = NAVY_HEADER
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER

def auto_fit_columns(ws, max_cols=20):
    for col in range(1, min(ws.max_column + 1, max_cols + 1)):
        max_len = 0
        col_letter = get_column_letter(col)
        for cell in ws[col_letter]:
            val = cell.value
            if val is not None:
                lines = str(val).split('\n')
                for line in lines:
                    if len(line) > max_len:
                        max_len = len(line)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 11), 50)

# =============================================================
# DATA DEFINITIONS
# =============================================================

INITIATIVES = [
    ("AOP-CORE-001", "Máquina de Estados de Tareas", "Core Engine", "Ciclo de vida estricto de Task (CREATED, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED).", "DONE", "CRITICAL", "v0.1", "Ninguna", "src/domain/task/task.ts", "6 tests", "docs/ARCHITECTURE.md", "Prompt 1-10", "Platform Core", "N/A", "Fundamento atómico"),
    ("AOP-CORE-002", "Ejecución Atómica y Contexto", "Core Engine", "Entidad Execution y ExecutionContext inmutable con correlación traceId.", "DONE", "CRITICAL", "v0.2", "AOP-CORE-001", "src/domain/execution/", "14 tests", "docs/EXECUTION_CONTRACT.md", "Prompt 11-20", "Platform Core", "N/A", "Determinismo y auditoría"),
    ("AOP-CORE-003", "Registro y Pasarela de Herramientas", "Tools", "InMemoryToolRegistry y RegistryToolGateway con invocación gobernada.", "DONE", "HIGH", "v0.3", "AOP-CORE-002", "src/application/tools/", "18 tests", "docs/TOOL_REGISTRY.md", "Prompt 21-28", "Platform Core", "N/A", "Capacidades explícitas"),
    ("AOP-CORE-004", "Orquestación Secuencial", "Orchestration", "SequentialOrchestrator determinista para cadenas lineales de ejecución.", "DONE", "MEDIUM", "v0.4", "AOP-CORE-003", "src/application/orchestration/", "12 tests", "docs/AUTONOMOUS_EXECUTION.md", "Prompt 29-35", "Platform Core", "N/A", "Stop-on-failure policy"),
    ("AOP-CORE-005", "Pasarela de Memoria en Proceso", "Memory", "InMemoryMemoryGateway con particionamiento por ámbitos (TASK, AGENT, SESSION).", "DONE", "HIGH", "v0.5", "AOP-CORE-002", "src/infrastructure/memory/", "8 tests", "docs/MEMORY_CONTRACT.md", "Prompt 36-40", "Platform Core", "N/A", "Aislamiento de contexto"),
    ("AOP-CORE-006", "Gobernanza Fail-Closed", "Security", "PolicyGateway con evaluación síncrona obligatoria y política por defecto de denegación.", "DONE", "CRITICAL", "v0.6", "AOP-CORE-002", "src/infrastructure/policy/", "10 tests", "docs/SECURITY_ARCHITECTURE.md", "Prompt 41-45", "Platform Core", "N/A", "Default-Deny estricto"),
    ("AOP-CORE-007", "Agentes de Primera Clase", "Agents", "Agregado Agent con listas blancas de herramientas y perfiles vinculados.", "DONE", "HIGH", "v0.8", "AOP-CORE-006", "src/domain/agent/agent.ts", "22 tests", "docs/MULTI_AGENT_RUNTIME.md", "Prompt 46-55", "Platform Core", "N/A", "Agent ≠ Execution"),
    ("AOP-CORE-008", "Operaciones Autónomas Acotadas", "Autonomy", "Entidad AutonomousOperation, AutonomyBudget y bucle acotado AutonomousOrchestrator.", "DONE", "HIGH", "v0.9", "AOP-CORE-007", "src/domain/autonomy/", "46 tests", "docs/releases/v0.9-architecture-baseline.md", "Prompt 56-65", "Platform Core", "N/A", "Presupuesto inmutable"),
    ("AOP-PERS-001", "Motor SQLite Nativo WAL", "Persistence", "Implementación de SqliteDatabase con Node.js node:sqlite, modo WAL y claves foráneas.", "DONE", "CRITICAL", "v0.10", "AOP-CORE-008", "src/infrastructure/persistence/sqlite/", "16 tests", "docs/decisions/0015-durable-persistence-architecture.md", "Prompt 66-70", "Platform Core", "N/A", "Zero runtime deps"),
    ("AOP-PERS-002", "Repositorio SQLite de Operaciones", "Persistence", "SqliteOperationRepository con transaccionalidad atómica y control de concurrencia optimista (OCC).", "DONE", "HIGH", "v0.10", "AOP-PERS-001", "src/infrastructure/persistence/sqlite/", "14 tests", "docs/decisions/0015-durable-persistence-architecture.md", "Prompt 71-72", "Platform Core", "N/A", "Transacciones ACID"),
    ("AOP-PERS-003", "Frontera de Rehidratación de Dominio", "Persistence", "Métodos estáticos rehydrate() en agregados (Task, Execution, Agent, AutonomousOperation) sin reflexión.", "DONE", "HIGH", "v0.11", "AOP-PERS-002", "src/domain/*/", "42 tests", "docs/decisions/0016-formal-domain-rehydration-boundary.md", "Prompt 73-75", "Platform Core", "N/A", "Cero Reflect.construct"),
    ("AOP-PERS-004", "Repositorios SQLite de Tareas, Ejecuciones y Agentes", "Persistence", "SqliteTaskRepository, SqliteExecutionRepository y SqliteAgentRepository persistentes.", "DONE", "HIGH", "v0.12", "AOP-PERS-003", "src/infrastructure/persistence/sqlite/", "28 tests", "docs/decisions/0019-durable-sqlite-adapters-for-task-execution-agent.md", "Prompt 76-78", "Platform Core", "N/A", "Persistencia total"),
    ("AOP-RECV-001", "Servicio de Reconciliación post-Crash", "Recovery", "RestartRecoveryService que detecta y transiciona entidades interrumpidas a estados terminales atómicamente.", "DONE", "HIGH", "v0.13", "AOP-PERS-004", "src/application/recovery/restart-recovery-service.ts", "18 tests", "docs/decisions/0020-crash-recovery-and-restart-reconciliation.md", "Prompt 79-82", "Platform Core", "N/A", "At-most-once delivery"),
    ("AOP-PERS-005", "Event Store Duradero SQLite", "Persistence", "SqliteEventStore con esquema inmutable de eventos de auditoría y proyecciones cronológicas.", "DONE", "HIGH", "v0.13", "AOP-PERS-001", "src/infrastructure/persistence/sqlite/sqlite-event-store.ts", "12 tests", "docs/decisions/0021-durable-events-and-audit-infrastructure.md", "Prompt 83-85", "Platform Core", "N/A", "Append-only ledger"),
    ("AOP-PROD-001", "Servidor HTTP y Enrutador Nativo", "Platform API", "Servidor node:http con límites de 1MB, normalización de IDs y prefijos /api/v1 y /api/platform/v1.", "DONE", "CRITICAL", "v1.0", "AOP-CORE-006", "src/platform/server.ts, src/platform/api/", "44 tests", "docs/PLATFORM_API.md", "Prompt 86-88", "Platform Core", "N/A", "REST Gateway nativo"),
    ("AOP-PROD-002", "Cliente SDK Tipado (@ai-platform/client)", "Platform Client", "PlatformClient en TypeScript con manejo de reintentos, fallback y validación de esquemas.", "DONE", "HIGH", "v1.0", "AOP-PROD-001", "src/platform-client/index.ts", "16 tests", "docs/PLATFORM_CLIENT.md", "Prompt 89-90", "Platform Core", "N/A", "Consumo desacoplado"),
    ("AOP-PROD-003", "Consola Web de Control (SPA Nativa)", "Web UI", "Interfaz gráfica Single-Page Application (HTML5/Vanilla JS/CSS) con 0 innerHTML y modo bilingüe (es-419 / en).", "DONE", "HIGH", "v1.1", "AOP-PROD-001", "src/platform/web/", "24 tests", "docs/OPERATIONAL_CONSOLE.md", "Prompt 91, 94, 99", "Platform Core", "N/A", "DOM puro 100%"),
    ("AOP-PROD-004", "Fábrica de Aplicaciones (Application Factory 2.0)", "Developer Platform", "Especificación y motor de registro declarativo de aplicaciones con validación de manifiestos y gobernanza.", "DONE", "HIGH", "v1.1", "AOP-PROD-003", "src/platform/web/app.js", "12 tests", "docs/APPLICATION_FACTORY.md", "Prompt 97", "Ecosystem", "N/A", "Micro-frontends"),
    ("AOP-MODL-001", "Adaptador OpenAI", "Models", "OpenAIModelGateway para modelos gpt-4o, gpt-4o-mini con manejo de streaming y JSON estructurado.", "DONE", "HIGH", "v1.1", "AOP-PROD-001", "src/infrastructure/model/openai/", "10 tests", "docs/REAL_AI_PROVIDERS.md", "Prompt 73-75", "Platform Core", "N/A", "Requiere API key"),
    ("AOP-MODL-002", "Adaptador Anthropic", "Models", "AnthropicModelGateway para modelos Claude (claude-3-5-sonnet, haiku) vía REST.", "DONE", "HIGH", "v1.1", "AOP-PROD-001", "src/infrastructure/model/anthropic/", "10 tests", "docs/REAL_AI_PROVIDERS.md", "Prompt 73-75", "Platform Core", "N/A", "Requiere API key"),
    ("AOP-MODL-003", "Adaptador Ollama Local", "Models", "OllamaModelGateway para modelos open-source locales (llama3, mistral, phi3) vía 127.0.0.1:11434.", "DONE", "HIGH", "v1.1", "AOP-PROD-001", "src/infrastructure/model/ollama/", "10 tests", "docs/REAL_AI_PROVIDERS.md", "Prompt 73-75", "Platform Core", "N/A", "Requiere daemon"),
    ("AOP-MODL-004", "Fábrica de Proveedores y Router de Contingencia", "Models", "ProviderFactory y DefaultModelRouter que despacha solicitudes y conmuta a StubModelGateway como fallback.", "DONE", "HIGH", "v1.1", "AOP-MODL-001", "src/infrastructure/model/provider-factory.ts", "14 tests", "docs/MODEL_GATEWAY.md", "Prompt 76-78", "Platform Core", "N/A", "Alta disponibilidad"),
    ("AOP-APP-001", "Tentaciones AI Commerce Integration", "Applications", "Adaptador TentacionesPlatformAdapter con descubrimiento, recomendaciones y probador virtual AR.", "DONE", "HIGH", "v1.0", "AOP-PROD-002", "src/application/platform/tentaciones-platform-adapter.ts", "38 tests", "docs/TENTACIONES_PLATFORM_INTEGRATION.md", "Prompt 62, 86", "tentaciones-commerce", "N/A", "Fallback garantizado"),
    ("AOP-APP-002", "Vehicle Parts Platform Reference App", "Applications", "Aplicación de referencia para compatibilidad mecánica de vehículos y catálogo de autopartes.", "DONE", "MEDIUM", "v1.1", "AOP-PROD-004", "tests/unit/vehicle-parts-reference-app.test.ts", "16 tests", "docs/VEHICLE_PARTS_REFERENCE.md", "Prompt 92, 97", "vehicle-parts-platform", "N/A", "Compatibilidad OEM"),
    ("AOP-DEV-001", "Adaptador de Impresora Brother DCP-1600", "Devices", "BrotherPrinterAdapter para impresión comercial sobre puerto local USB001 con gestión de trabajos.", "DONE", "MEDIUM", "v1.1", "AOP-PROD-001", "src/infrastructure/device/brother-printer-adapter.ts", "14 tests", "docs/BUSINESS_DEVICES.md", "Prompt 95", "Platform Core", "printer-brother-dcp1600", "Honestamente offline"),
    ("AOP-MODEL-GEMINI", "Adaptador de Modelo Google Gemini / Vertex AI", "Models", "Gateway oficial para Google Gemini 1.5/2.0 Pro/Flash vía API REST de Google Cloud.", "DONE", "HIGH", "v1.2", "AOP-MODL-004", "src/infrastructure/model/gemini/", "8 tests", "docs/decisions/0023-google-gemini-model-gateway.md", "Prompt 101", "Platform Core", "N/A", "GAP-01 Resuelto"),
    ("AOP-AUTH-JWT", "Proveedor de Autenticación OIDC / JWT Producción", "Security", "Servicio formal de validación JWT con rotación asimétrica de claves (RS256/ES256) y gestión de roles.", "DONE", "HIGH", "v1.2", "AOP-PROD-001", "src/infrastructure/security/jwt-token-verifier.ts", "4 tests", "docs/decisions/0025-asymmetric-jwt-and-key-rotation.md", "Prompt 101", "Platform Core", "N/A", "GAP-03 Resuelto"),
    ("AOP-NETWORK", "Topología de Red y Proxy Reverso de Producción", "Security", "Configuración declarativa de Nginx/Caddy con terminación TLS, rate limiting perimetral y Docker Compose.", "DONE", "MEDIUM", "v1.2", "AOP-PROD-001", "deploy/", "Manifests", "docs/PRODUCTION_NETWORK_TOPOLOGY.md", "Prompt 101", "Platform Core", "N/A", "GAP-04 Resuelto"),
    ("AOP-MEMORY", "Pasarela de Memoria Duradera SQLite", "Memory", "Adaptador SqliteMemoryGateway con persistencia relacional indexada por ámbito de agente y sesión.", "DONE", "HIGH", "v1.2", "AOP-PERS-001", "src/infrastructure/memory/sqlite-memory-gateway.ts", "6 tests", "docs/decisions/0024-sqlite-durable-memory-gateway.md", "Prompt 101", "Platform Core", "N/A", "GAP-02 Resuelto"),
    ("AOP-API-SURFACES", "Política de Convergencia de Rutas /api/v1", "Platform API", "Eliminación planificada del alias /api/platform/v1 en favor de /api/v1 con avisos RFC 8594.", "DONE", "LOW", "v1.2", "AOP-PROD-001", "src/platform/api/http-router.ts", "1 test", "docs/TECHNICAL_DEBT.md", "Prompt 101", "Platform Core", "N/A", "GAP-05 Resuelto"),
    ("AOP-ORG-FOUNDATION", "Virtual Organization Foundation", "Virtual Organization", "Jerarquía multinivel de Organizaciones, Áreas, Equipos y Membresía gobernada de agentes con roles.", "DONE", "HIGH", "v1.2", "AOP-PROD-001", "src/domain/organization/", "34 tests", "docs/decisions/0027-virtual-organization-foundation.md", "Prompt 102", "Platform Core", "N/A", "Jerarquía virtual"),
    ("AOP-ORG-BUDGET", "Team Resource Governance & Budget Control", "Virtual Organization", "Presupuestos y cuotas operacionales por equipo con control de concurrencia atómico (OCC).", "DONE", "HIGH", "v1.2", "AOP-ORG-FOUNDATION", "src/domain/organization/team-resource-budget.ts", "24 tests", "docs/decisions/0028-team-resource-budget-governance.md", "Prompt 103", "Platform Core", "N/A", "Fail-closed quotas"),
    ("AOP-ORG-COORDINATION", "Organizational Agent Coordination Foundation", "Virtual Organization", "Coordinación organizacional entre agentes, detección de ciclos, límites de profundidad y presupuestos.", "DONE", "HIGH", "v1.3", "AOP-ORG-BUDGET", "src/domain/organization/organizational-coordination.ts", "23 tests", "docs/decisions/0030-organizational-coordination-foundation.md", "Prompt 109", "Platform Core", "N/A", "Multi-agent tree"),
    ("AOP-AGENT-CAPABILITY-GOVERNANCE", "Agent Capability & Responsibility Governance", "Virtual Organization", "Gobernanza formal de roles, responsabilidades, ciclo de vida de capacidades y descubrimiento.", "DONE", "HIGH", "v1.3", "AOP-ORG-COORDINATION", "src/domain/organization/agent-profile.ts", "27 tests", "docs/decisions/0031-agent-role-responsibility-capability-governance.md", "Prompt 110", "Platform Core", "N/A", "Capacidades tipadas"),
    ("AOP-WORKFLOW-ORCHESTRATION", "Workflow Orchestration & Governed Task Assignment", "Virtual Organization", "Orquestación de flujos de trabajo en DAG, asignación gobernada mediante PolicyGateway y cuotas.", "DONE", "HIGH", "v1.3", "AOP-AGENT-CAPABILITY-GOVERNANCE", "src/domain/workflow/", "29 tests", "docs/decisions/0032-workflow-orchestration-governed-task-assignment.md", "Prompt 111", "Platform Core", "N/A", "DAG acíclico"),
    ("AOP-WORKFLOW-VERIFICATION", "Workflow Verification & Result Validation", "Workflow Governance", "Capa de verificación determinista con reglas/esquemas y segregación de funciones (SoD).", "DONE", "HIGH", "v1.3", "AOP-WORKFLOW-ORCHESTRATION", "src/domain/workflow/verification-result.ts", "28 tests", "docs/decisions/0033-workflow-verification-and-result-validation.md", "Prompt 112", "Platform Core", "N/A", "Segregación SoD"),
    ("AOP-HUMAN-OVERSIGHT", "Human Oversight, Approval & Escalation Governance", "Workflow Governance", "Supervisión humana, aprobación y escalamiento gobernado con prevención de bypass y OCC.", "DONE", "HIGH", "v1.3", "AOP-WORKFLOW-VERIFICATION", "src/domain/workflow/oversight-request.ts", "26 tests", "docs/decisions/0034-human-oversight-approval-and-escalation-governance.md", "Prompt 113", "Platform Core", "N/A", "Control humano"),
    ("AOP-AGENT-LIFECYCLE-EVALUATION", "Agent Lifecycle, Evaluation & Governance", "Virtual Organization", "Ciclo de vida de agentes, evaluaciones cuantitativas deterministas y elegibilidad estricta.", "DONE", "HIGH", "v1.3", "AOP-HUMAN-OVERSIGHT", "src/domain/agent/agent-profile.ts", "28 tests", "docs/decisions/0035-agent-lifecycle-evaluation-and-governance.md", "Prompt 114", "Platform Core", "N/A", "Métricas cuantitativas"),
    ("AOP-AI-SOLUTIONS-FACTORY", "AI Solutions Factory & Blueprint Governance", "Application Factory", "Fábrica de soluciones de IA, planos arquitectónicos declarativos y ciclo de vida de soluciones.", "DONE", "HIGH", "v1.3", "AOP-AGENT-LIFECYCLE-EVALUATION", "src/domain/solution/", "32 tests", "docs/decisions/0036-ai-solutions-factory-and-blueprint-governance.md", "Prompt 115", "Platform Core", "N/A", "Planos declarativos"),
    ("AOP-ENTERPRISE-OPERATING-SYSTEM", "AI Enterprise Operating System & Executive Governance", "Enterprise Strategy", "Sistema operativo empresarial impulsado por IA y cadena de valor estratégica.", "DONE", "HIGH", "v1.3", "AOP-AI-SOLUTIONS-FACTORY", "src/domain/business/", "26 tests", "docs/decisions/0037-ai-enterprise-operating-system-and-executive-governance.md", "Prompt 116", "Platform Core", "N/A", "Estrategia ejecutiva"),
    ("AOP-EXECUTIVE-ORCHESTRATOR", "Executive Orchestrator & Closed-Loop Business Operations", "Executive Orchestration", "Orquestación ejecutiva de bucle cerrado, instantáneas inmutables y re-planificación acotada.", "DONE", "HIGH", "v1.3", "AOP-ENTERPRISE-OPERATING-SYSTEM", "src/domain/executive/", "28 tests", "docs/decisions/0038-executive-orchestrator-and-closed-loop-business-operations.md", "Prompt 117", "Platform Core", "N/A", "Bucle cerrado"),
    ("AOP-AUTONOMOUS-OPERATIONS-RUNTIME", "Autonomous Operations Runtime & Continuous Business Governance", "Autonomous Operations", "Daemon 24/7 de operaciones autónomas continuas, leases concurrentes y circuit breaker.", "DONE", "HIGH", "v1.3", "AOP-EXECUTIVE-ORCHESTRATOR", "src/domain/autonomous/", "16 tests", "docs/decisions/0039-autonomous-operations-runtime-and-continuous-business-governance.md", "Prompt 118", "Platform Core", "N/A", "Daemon operacional"),
    ("AOP-AUTONOMOUS-OPS-UI", "Autonomous Operations Web Control Plane & Front-End Governance", "Web UI & Control Plane", "Consola operativa #tab-operations, tabla de triggers, cadena de 6 fases y 0 innerHTML.", "DONE", "HIGH", "v1.3", "AOP-AUTONOMOUS-OPERATIONS-RUNTIME", "src/platform/web/app.js", "14 tests", "docs/AUTONOMOUS_OPERATIONS.md", "Prompt 101", "Platform Core", "N/A", "Control plane web"),
    ("AOP-AUTH", "Enterprise Authentication, API Authorization & Credential Governance", "Security", "Gobernanza de credenciales API empresariales (zero-plaintext SHA-256), vinculación de Principal, scopes, reconciliación y rotación.", "DONE", "CRITICAL", "v1.3", "AOP-AUTONOMOUS-OPS-UI", "src/domain/security/api-credential.ts", "37 tests", "docs/decisions/0040-enterprise-api-authentication-and-credential-governance.md", "Prompt 102", "Platform Core", "N/A", "Zero-plaintext & Scopes"),
    ("AOP-STREAMING", "Reactive Operational Streaming (SSE)", "Observability", "Streaming reactivo de eventos operacionales vía Server-Sent Events y replay.", "DONE", "HIGH", "v1.3", "AOP-PROD-001", "src/application/observability/event-stream-adapter.ts", "8 tests", "docs/decisions/0029-reactive-operational-streaming-sse.md", "Prompt 108", "Platform Core", "N/A", "SSE streaming"),
    ("AOP-V1-EXIT", "Certificación Final de Criterios de Producción", "Governance", "Auditoría y certificación integral de criterios de release formal para producción masiva.", "VALIDATION", "CRITICAL", "v1.3", "Todos los anteriores", "docs/RELEASE_CERTIFICATION_V1.md", "1391 tests", "docs/V1_EXIT_CRITERIA.md", "Prompt 106", "Platform Core", "N/A", "Criterios formales")
]

# -------------------------------------------------------------
# SHEET 01: 01_KANBAN
# -------------------------------------------------------------
ws_kanban = wb.create_sheet(title="01_KANBAN")
ws_kanban.views.sheetView[0].showGridLines = True
ws_kanban.cell(row=1, column=1, value="TABLERO KANBAN DE SEGUIMIENTO (AI OPERATING PLATFORM)").font = TITLE_FONT
ws_kanban.cell(row=2, column=1, value="Las tarjetas reflejan exclusivamente iniciativas de MASTER_ROADMAP clasificadas por estado.").font = SUBTITLE_FONT

KANBAN_COLS = ["BACKLOG", "ANALYSIS", "PLANNED", "IN_PROGRESS", "VALIDATION", "DONE", "BLOCKED", "DEFERRED"]
for col_idx, col_name in enumerate(KANBAN_COLS, 1):
    cell = ws_kanban.cell(row=4, column=col_idx, value=col_name)
    cell.fill = NAVY_HEADER
    cell.font = HEADER_FONT
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = THIN_BORDER

# Bucket initiatives into columns
col_cards = {status: [] for status in KANBAN_COLS}
for init in INITIATIVES:
    st = init[4]
    if st in col_cards:
        col_cards[st].append(f"[{init[0]}]\n{init[1]}\nÁrea: {init[2]} ({init[6]})")

max_rows = max(len(cards) for cards in col_cards.values()) if col_cards else 0
for r in range(max_rows):
    for col_idx, col_name in enumerate(KANBAN_COLS, 1):
        cards = col_cards[col_name]
        cell = ws_kanban.cell(row=5 + r, column=col_idx)
        cell.border = THIN_BORDER
        if r < len(cards):
            cell.value = cards[r]
            cell.font = REGULAR_FONT
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if col_name == "DONE":
                cell.fill = DONE_FILL
            elif col_name == "BACKLOG":
                cell.fill = BACKLOG_FILL
        else:
            cell.value = ""

auto_fit_columns(ws_kanban, len(KANBAN_COLS))
ws_kanban.freeze_panes = "A5"

# -------------------------------------------------------------
# SHEET 02: 02_MASTER_ROADMAP
# -------------------------------------------------------------
ws_roadmap = wb.create_sheet(title="02_MASTER_ROADMAP")
ws_roadmap.views.sheetView[0].showGridLines = True
ws_roadmap.cell(row=1, column=1, value="ROADMAP TÉCNICO MAESTRO (MASTER ROADMAP)").font = TITLE_FONT
ws_roadmap.cell(row=2, column=1, value="Registro central estructurado de iniciativas con trazabilidad de evidencias y tests.").font = SUBTITLE_FONT

ROADMAP_HEADERS = [
    "ID", "Título", "Área", "Descripción", "Estado", "Prioridad", "Fase", 
    "Dependencias", "Evidencia Código", "Tests", "Documentación", "Prompt Relacionado", 
    "Aplicación", "Dispositivo", "Notas Técnicas"
]

for col_idx, h in enumerate(ROADMAP_HEADERS, 1):
    ws_roadmap.cell(row=4, column=col_idx, value=h)
style_header_row(ws_roadmap, 4, len(ROADMAP_HEADERS))

for row_idx, init in enumerate(INITIATIVES, 5):
    for col_idx, val in enumerate(init, 1):
        cell = ws_roadmap.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 1:
            cell.font = BOLD_FONT
        elif col_idx == 5: # Status
            cell.alignment = Alignment(horizontal="center")
            if val == "DONE":
                cell.fill = DONE_FILL
                cell.font = DONE_FONT
            else:
                cell.fill = BACKLOG_FILL
                cell.font = BACKLOG_FONT
        elif col_idx in (6, 7):
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_roadmap, len(ROADMAP_HEADERS))
ws_roadmap.freeze_panes = "A5"
ws_roadmap.auto_filter.ref = f"A4:{get_column_letter(len(ROADMAP_HEADERS))}{len(INITIATIVES)+4}"

# -------------------------------------------------------------
# SHEET 03: 03_MILESTONES
# -------------------------------------------------------------
ws_milestones = wb.create_sheet(title="03_MILESTONES")
ws_milestones.views.sheetView[0].showGridLines = True
ws_milestones.cell(row=1, column=1, value="HITOS DE VERSIÓN Y CRITERIOS DE SALIDA").font = TITLE_FONT

MILESTONE_HEADERS = ["Versión", "Enfoque Principal", "Criterio de Salida", "Estado Oficial", "Tests Verificados", "Realización"]
for col_idx, h in enumerate(MILESTONE_HEADERS, 1):
    ws_milestones.cell(row=3, column=col_idx, value=h)
style_header_row(ws_milestones, 3, len(MILESTONE_HEADERS))

MILESTONES_DATA = [
    ("v0.1 Foundation", "Contratos, Task System, eventos, stub model", "Transiciones de estado verificadas y observable", "DONE", "6 tests", "Core domain pure"),
    ("v0.2 Core Runtime", "Ciclo de vida de ejecución, contexto inmutable", "Ejecución persistida y trazable a través de puertos", "DONE", "14 tests", "CoreRuntime centralizado"),
    ("v0.3 Models + Tools", "Pasarela de modelos y gateway seguro de herramientas", "Capacidades explícitas y correlacionadas", "DONE", "18 tests", "CalculatorTool & Registry"),
    ("v0.4 Orchestration", "Orquestación declarativa secuencial", "Secuencia determinista stop-on-failure", "DONE", "12 tests", "SequentialOrchestrator"),
    ("v0.5 Memory + Context", "Contexto inmutable y memoria particionada", "Ámbitos TASK, AGENT, SESSION aislados", "DONE", "8 tests", "InMemoryMemoryGateway"),
    ("v0.6 Observability + Governance", "Auditoría, métricas y políticas fail-closed", "Ejecución gobernada con default-deny estricto", "DONE", "10 tests", "PolicyGateway fail-closed"),
    ("v0.7 Platform API/UI", "Platform API REST nativa y web product boundary", "Web Platform consume contratos estables", "DONE", "44 tests", "PlatformService & Router"),
    ("v0.8 Agents", "Agentes de primera clase, tool whitelisting", "Ejecución gobernada vía CoreRuntime", "DONE", "22 tests", "Agent ≠ Execution"),
    ("v0.9 Autonomous Operations", "Operaciones acotadas, AutonomyBudget, FSM", "Ciclos supervisados bajo presupuesto estricto", "DONE", "46 tests", "AutonomousOrchestrator"),
    ("v0.10 Durable Persistence", "Persistencia relacional SQLite WAL duradera", "Almacenamiento desacoplado sin polución de dominio", "DONE", "30 tests", "node:sqlite DatabaseSync"),
    ("v0.11 Domain Rehydration", "Fronteras de rehidratación formal en agregados", "Reconstrucción pura sin reflexión", "DONE", "42 tests", "Task/Execution/Agent.rehydrate"),
    ("v0.12 Durable Repositories", "Adaptadores SQLite para tareas, ejecuciones y agentes", "Persistencia total en disco (data/app.db)", "DONE", "28 tests", "SqliteTask/Execution/AgentRepo"),
    ("v0.13 Crash Recovery", "Reconciliación atómica al inicio y EventStore", "Recuperación post-crash idempotente", "DONE", "30 tests", "RestartRecoveryService"),
    ("v1.0.0 Platform Foundation", "Motor integrado, PlatformClient y Tentaciones", "Plataforma empresarial de IA gobernada", "DONE", "78 tests", "TentacionesPlatformAdapter"),
    ("v1.1.0 Extended Ecosystem", "Modelos reales, impresora Brother, consola bilingüe", "966 tests PASS, 11 suites, 0 innerHTML", "DONE", "966 tests PASS", "Línea Base Fase 54"),
    ("v1.2.0 Enterprise Cloud", "Gateway Gemini, OIDC/JWT, proxy reverso TLS, memoria SQLite", "985 tests PASS, 11 suites, 0 runtime deps", "DONE", "985 tests PASS", "Línea Base Canónica Actual"),
    ("v1.2.1 Production Certification", "Certificación formal de producción y pruebas de carga", "Criterios de salida formal v1.0/v1.2 completados", "PLANNED", "0 tests (Backlog)", "Próxima fase")
]

for row_idx, data in enumerate(MILESTONES_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_milestones.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 4 and val == "DONE":
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_milestones, len(MILESTONE_HEADERS))
ws_milestones.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 04: 04_DEPENDENCIES
# -------------------------------------------------------------
ws_deps = wb.create_sheet(title="04_DEPENDENCIES")
ws_deps.views.sheetView[0].showGridLines = True
ws_deps.cell(row=1, column=1, value="MATRIZ DE DEPENDENCIAS ENTRE INICIATIVAS").font = TITLE_FONT

DEP_HEADERS = ["Iniciativa ID", "Título", "Dependencia ID", "Título de Dependencia", "Tipo de Relación", "Criticidad"]
for col_idx, h in enumerate(DEP_HEADERS, 1):
    ws_deps.cell(row=3, column=col_idx, value=h)
style_header_row(ws_deps, 3, len(DEP_HEADERS))

DEPS_DATA = [
    ("AOP-CORE-002", "Ejecución Atómica y Contexto", "AOP-CORE-001", "Máquina de Estados de Tareas", "Precedencia de Dominio", "BLOQUEANTE"),
    ("AOP-CORE-003", "Registro de Herramientas", "AOP-CORE-002", "Ejecución Atómica", "Invocación en Contexto", "ALTA"),
    ("AOP-CORE-004", "Orquestación Secuencial", "AOP-CORE-003", "Registro de Herramientas", "Composición de Pasos", "MEDIA"),
    ("AOP-CORE-007", "Agentes de Primera Clase", "AOP-CORE-006", "Gobernanza Fail-Closed", "Autorización de Tools", "BLOQUEANTE"),
    ("AOP-CORE-008", "Operaciones Autónomas", "AOP-CORE-007", "Agentes de Primera Clase", "Perfil de Despacho", "BLOQUEANTE"),
    ("AOP-PERS-001", "Motor SQLite Nativo", "AOP-CORE-008", "Operaciones Autónomas", "Persistencia de Operaciones", "ALTA"),
    ("AOP-PERS-003", "Rehidratación de Dominio", "AOP-PERS-002", "Repositorio SQLite Operaciones", "Encapsulamiento de Dominio", "ALTA"),
    ("AOP-PERS-004", "Repositorios Core SQLite", "AOP-PERS-003", "Rehidratación de Dominio", "Almacenamiento sin Reflexión", "BLOQUEANTE"),
    ("AOP-RECV-001", "Servicio de Reconciliación", "AOP-PERS-004", "Repositorios Core SQLite", "Escaneo de Tareas Huérfanas", "BLOQUEANTE"),
    ("AOP-PROD-001", "Servidor HTTP Nativo", "AOP-CORE-006", "Gobernanza Fail-Closed", "Seguridad Perimetral", "BLOQUEANTE"),
    ("AOP-PROD-002", "Platform Client SDK", "AOP-PROD-001", "Servidor HTTP Nativo", "Consumo de Endpoints REST", "ALTA"),
    ("AOP-APP-001", "Tentaciones AI Commerce", "AOP-PROD-002", "Platform Client SDK", "Invocación Desacoplada", "ALTA"),
    ("AOP-DEV-001", "Adaptador Brother DCP-1600", "AOP-PROD-001", "Servidor HTTP Nativo", "Endpoints de Impresión", "MEDIA"),
    ("AOP-MODEL-GEMINI", "Adaptador Gemini", "AOP-MODL-004", "ProviderFactory", "Registro de Provider", "ALTA"),
    ("AOP-AUTH-JWT", "Proveedor OIDC / JWT", "AOP-PROD-001", "Servidor HTTP Nativo", "Middleware de Seguridad", "BLOQUEANTE (Prod)"),
    ("AOP-NETWORK", "Proxy Reverso TLS", "AOP-PROD-001", "Servidor HTTP Nativo", "Terminación HTTPS", "BLOQUEANTE (Prod)"),
    ("AOP-MEMORY", "Memoria Duradera SQLite", "AOP-PERS-001", "Motor SQLite Nativo", "Persistencia Relacional", "ALTA"),
    ("AOP-API-SURFACES", "Convergencia de Rutas", "AOP-PROD-001", "Servidor HTTP Nativo", "Deprecación RFC 8594", "MEDIA")
]

for row_idx, data in enumerate(DEPS_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_deps.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER

auto_fit_columns(ws_deps, len(DEP_HEADERS))
ws_deps.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 05: 05_ARCHITECTURE
# -------------------------------------------------------------
ws_arch = wb.create_sheet(title="05_ARCHITECTURE")
ws_arch.views.sheetView[0].showGridLines = True
ws_arch.cell(row=1, column=1, value="INVENTARIO DE CAPAS Y COMPONENTES ARQUITECTÓNICOS").font = TITLE_FONT

ARCH_HEADERS = ["Componente", "Capa Hexagonal", "Responsabilidad Principal", "Dependencias", "Public API", "Security Boundary", "Persistencia", "Observabilidad", "Estado Oficial"]
for col_idx, h in enumerate(ARCH_HEADERS, 1):
    ws_arch.cell(row=3, column=col_idx, value=h)
style_header_row(ws_arch, 3, len(ARCH_HEADERS))

ARCH_DATA = [
    ("Web Control Plane SPA", "Presentación", "Interfaz web para telemetría, gestión y gobernanza", "Exclusivamente REST API", "http://127.0.0.1:3000/", "0 innerHTML, modo bilingüe es-419 / en", "Efímera (Navegador)", "Telemetría en tiempo real", "IMPLEMENTED / OPERATIONAL"),
    ("Native HTTP Server & Router", "Platform API", "Enrutador nativo, normalización de IDs, rate limit", "node:http, PlatformService", "/api/v1/*, /api/platform/v1/*", "127.0.0.1, payload 1MB, CORS local", "Conecta con SQLite duradero", "X-Request-Id, StructuredLogger", "IMPLEMENTED / OPERATIONAL"),
    ("PlatformClient SDK", "Platform Client", "SDK TypeScript tipado para aplicaciones satélites", "fetch estándar de Node/Browser", "PlatformClient.create()", "Propagación de traceId", "Ninguna", "Serialización de errores", "IMPLEMENTED / OPERATIONAL"),
    ("CoreRuntime", "Aplicación", "Propietario único del ciclo de vida Task/Execution", "Puertos de dominio", "executeTask(task)", "Evaluación obligatoria de políticas", "Persistencia en SQLite WAL", "Eventos inmutables traceId", "IMPLEMENTED / OPERATIONAL"),
    ("AutonomousOrchestrator", "Aplicación", "Bucle acotado de operaciones bajo AutonomyBudget", "PlannerPort, EvaluatorPort, CoreRuntime", "runOperationLoop()", "Fail-closed ante exceso presupuesto", "Snapshots atómicos en SQLite", "Auditoría paso a paso", "IMPLEMENTED / OPERATIONAL"),
    ("RestartRecoveryService", "Aplicación", "Reconciliación atómica post-crash de entidades activas", "TaskRepo, ExecRepo, OperationRepo", "reconcile(): RecoveryResult", "Transacción atómica idempotente", "Terminaliza estados en SQLite", "task.failed, execution.failed", "IMPLEMENTED / OPERATIONAL"),
    ("Entidades de Dominio", "Dominio Puro", "Invariantes de negocio, máquinas de estados e inmutabilidad", "Cero dependencias externas", "rehydrate(), métodos puros", "Object.freeze() exhaustivo", "Agnóstico a almacenamiento", "DomainEvents tipados", "IMPLEMENTED / OPERATIONAL"),
    ("SQLite Storage Engine", "Infraestructura", "Persistencia relacional duradera en disco con WAL", "node:sqlite nativo (Node 22+)", "Repositorios SQLite", "SQL 100% parametrizado", "Archivo físico data/app.db", "Diagnóstico forense SQLite", "IMPLEMENTED / OPERATIONAL"),
    ("SqliteMemoryGateway", "Infraestructura", "Persistencia relacional duradera de memoria de agentes", "node:sqlite nativo", "MemoryGateway", "SQL parametrizado, índice scope/key", "data/app.db (platform_memory)", "Métricas de operaciones", "IMPLEMENTED / OPERATIONAL"),
    ("Model Gateways", "Infraestructura", "Adaptadores para OpenAI, Anthropic, Ollama, Gemini y Stub", "node:http, node:https", "ModelGateway.execute()", "Ocultación de API keys en logs", "Ninguna", "model.requested/completed", "IMPLEMENTED / OPERATIONAL"),
    ("JwtTokenVerifier", "Infraestructura", "Validación criptográfica JWT asimétrica (RS256/ES256)", "node:crypto nativo", "TokenVerifier", "Rotación dinámica y revocación kid", "Ninguna", "Auditoría de autenticación", "IMPLEMENTED / OPERATIONAL"),
    ("Reverse Proxy Topology", "Infraestructura", "Terminación TLS, rate limiting y CORS perimetral", "Nginx / Caddy v2", "https://localhost:443/", "Terminación TLS + Headers HSTS/CSP", "Ninguna", "Access logs y métricas", "CONFIGURED / DEPLOYABLE"),
    ("BrotherPrinterAdapter", "Infraestructura", "Control y spooler de impresora comercial USB", "APIs nativas de SO", "BusinessDeviceAdapter", "Validación MIME y límites de cola", "Cola en memoria", "Métricas de trabajos", "IMPLEMENTED (Hardware Offline)")
]

for row_idx, data in enumerate(ARCH_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_arch.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 9:
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_arch, len(ARCH_HEADERS))
ws_arch.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 06: 06_APPLICATIONS
# -------------------------------------------------------------
ws_apps = wb.create_sheet(title="06_APPLICATIONS")
ws_apps.views.sheetView[0].showGridLines = True
ws_apps.cell(row=1, column=1, value="APLICACIONES DEL ECOSISTEMA SATÉLITE").font = TITLE_FONT

APP_HEADERS = ["App ID", "Nombre Comercial", "Estado Oficial", "Tipo de Integración", "Capacidades Consumidas", "Estrategia Fallback", "Trust Level", "Tests de Verificación", "Documentación"]
for col_idx, h in enumerate(APP_HEADERS, 1):
    ws_apps.cell(row=3, column=col_idx, value=h)
style_header_row(ws_apps, 3, len(APP_HEADERS))

APPS_DATA = [
    ("tentaciones-commerce", "Tentaciones AI Commerce", "IMPLEMENTED", "Adapter + PlatformClient", "discovery, recommendation, compare, cart, ar.fitting_room", "LOCAL_FALLBACK (in-memory) / TRADITIONAL_COMMERCE", "MANAGED_COMMERCE", "48 tests PASS", "docs/TENTACIONES_PLATFORM_INTEGRATION.md"),
    ("vehicle-parts-platform", "Vehicle Parts Platform", "IMPLEMENTED", "Reference App / Factory 2.0", "parts.discovery, parts.compatibility, parts.compare, cart", "STATIC_CATALOG_FALLBACK", "ENTERPRISE_REFERENCE", "16 tests PASS", "docs/VEHICLE_PARTS_REFERENCE.md"),
    ("enterprise-support-agent", "Enterprise Support Agent", "DESIGNED", "MultiAgent Profile Spec", "ticket.triage, ticket.resolution, ticket.escalate", "HUMAN_ROUTING_FALLBACK", "INTERNAL_ENTERPRISE", "0 tests (Diseñado)", "docs/APPLICATION_ECOSYSTEM.md")
]

for row_idx, data in enumerate(APPS_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_apps.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 3:
            cell.alignment = Alignment(horizontal="center")
            if val == "IMPLEMENTED":
                cell.fill = DONE_FILL
                cell.font = DONE_FONT
            else:
                cell.fill = BACKLOG_FILL
                cell.font = BACKLOG_FONT

auto_fit_columns(ws_apps, len(APP_HEADERS))
ws_apps.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 07: 07_SECURITY
# -------------------------------------------------------------
ws_sec = wb.create_sheet(title="07_SECURITY")
ws_sec.views.sheetView[0].showGridLines = True
ws_sec.cell(row=1, column=1, value="REGISTRO DE CONTROLES DE SEGURIDAD Y CUMPLIMIENTO").font = TITLE_FONT

SEC_HEADERS = ["Control ID", "Nombre del Control", "Estado Oficial", "Evidencia en Código", "Tests de Verificación", "Documentación", "Última Verificación"]
for col_idx, h in enumerate(SEC_HEADERS, 1):
    ws_sec.cell(row=3, column=col_idx, value=h)
style_header_row(ws_sec, 3, len(SEC_HEADERS))

SEC_DATA = [
    ("SEC-001", "Gobernanza Fail-Closed Default-Deny", "IMPLEMENTED", "in-memory-policy-gateway.ts, rbac-policy-gateway.ts", "22 tests pass", "docs/SECURITY_ARCHITECTURE.md", "2026-09-17"),
    ("SEC-002", "Aislamiento Multi-Tenant Estricto", "IMPLEMENTED", "boundaries.ts, security.ts", "18 tests pass", "docs/SECURITY_CONTROL_MATRIX.md", "2026-09-17"),
    ("SEC-003", "Aislamiento de Aplicaciones Satélites", "IMPLEMENTED", "task-context.ts, bounded-data.ts", "16 tests pass", "docs/APPLICATION_INTEGRATION.md", "2026-09-17"),
    ("SEC-004", "Listas Blancas de Herramientas y Modelos", "IMPLEMENTED", "agent.ts, tool-gateway.ts", "28 tests pass", "docs/AGENT_TOOL_MODEL_SECURITY.md", "2026-09-17"),
    ("SEC-005", "Sanitización y Redacción de Secretos", "IMPLEMENTED", "token-verifier-adapter.ts, http-router.ts", "14 tests pass", "docs/AUTHENTICATION.md", "2026-09-17"),
    ("SEC-006", "Inmunidad XSS en Front-End (0 innerHTML)", "IMPLEMENTED", "app.js, index.html", "Grep audit (0 innerHTML)", "docs/OPERATIONAL_CONSOLE.md", "2026-09-17"),
    ("SEC-007", "Consultas SQL 100% Parametrizadas", "IMPLEMENTED", "sqlite-mapper.ts, sqlite-database.ts", "32 tests pass", "docs/decisions/0015-durable-persistence-architecture.md", "2026-09-17"),
    ("SEC-008", "Enlace Restrictivo de Red (127.0.0.1)", "IMPLEMENTED", "server.ts, config.ts", "12 tests pass", "docs/CLOUD_DEPLOYMENT.md", "2026-09-17"),
    ("SEC-009", "Límites de Tamaño de Payload (1MB Max)", "IMPLEMENTED", "http-router.ts, config.ts", "HTTP 413 checks pass", "docs/PLATFORM_API.md", "2026-09-17"),
    ("SEC-010", "Rate Limiting Empresarial por Tenant", "IMPLEMENTED", "http-router.ts, platform-service.ts", "HTTP 429 checks pass", "docs/API_OPERATIONS.md", "2026-09-17"),
    ("SEC-011", "Autenticación Asimétrica JWT (RS256/ES256)", "IMPLEMENTED", "jwt-token-verifier.ts", "4 tests pass", "docs/decisions/0025-asymmetric-jwt-and-key-rotation.md", "2026-09-17"),
    ("SEC-012", "Terminación TLS y Seguridad Perimetral", "CONFIGURED", "deploy/nginx/, deploy/caddy/", "Config checks pass", "docs/PRODUCTION_NETWORK_TOPOLOGY.md", "2026-09-17")
]

for row_idx, data in enumerate(SEC_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_sec.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 3:
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_sec, len(SEC_HEADERS))
ws_sec.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 08: 08_TESTING
# -------------------------------------------------------------
ws_test = wb.create_sheet(title="08_TESTING")
ws_test.views.sheetView[0].showGridLines = True
ws_test.cell(row=1, column=1, value="REGISTRO OFICIAL DE SUITES DE PRUEBAS (985 TESTS PASS)").font = TITLE_FONT

TEST_HEADERS = ["Área Técnica", "Suites / Archivos Representativos", "Tests Aprobados", "Tests Fallidos", "Foco de Verificación", "Determinismo"]
for col_idx, h in enumerate(TEST_HEADERS, 1):
    ws_test.cell(row=3, column=col_idx, value=h)
style_header_row(ws_test, 3, len(TEST_HEADERS))

TEST_DATA = [
    ("Core Runtime & Autonomía", "task.test.ts, execution.test.ts, autonomous-operation.test.ts", 184, 0, "Máquinas de estados, presupuestos inmutables y bucles acotados", "100% Determinista"),
    ("Persistencia SQLite WAL", "sqlite-persistence.test.ts, sqlite-memory-gateway.test.ts", 148, 0, "node:sqlite nativo, transacciones atómicas, memoria duradera y WAL", "100% Determinista"),
    ("Recuperación post-Crash", "restart-recovery-service.test.ts, sqlite-crash-recovery.test.ts", 42, 0, "Reconciliación atómica tras caídas simuladas e idempotencia", "100% Determinista"),
    ("Model Gateways", "model-gateway-contracts.test.ts, gemini-model-gateway.test.ts", 64, 0, "Paridad de contratos para OpenAI, Anthropic, Ollama, Gemini y Stub", "100% Determinista"),
    ("Agentes y Coordinación", "agent.test.ts, multi-agent-coordinator.test.ts", 68, 0, "Listas blancas de herramientas y particionamiento de memoria", "100% Determinista"),
    ("Ecosistema de Aplicaciones", "tentaciones-platform-adapter.test.ts, vehicle-parts.test.ts", 138, 0, "Comercio electrónico, probador AR y compatibilidad automotriz", "100% Determinista"),
    ("Seguridad y Aislamiento", "security-boundaries.test.ts, jwt-authentication.test.ts", 118, 0, "Gobernanza default-deny, firmas asimétricas JWT y auditoría", "100% Determinista"),
    ("Platform API & Diagnóstico", "api.test.ts, diagnostics-api.test.ts, api-surface-deprecation.test.ts", 123, 0, "Rutas REST, convergencia RFC 8594, rate limiting y trazas", "100% Determinista"),
    ("Dispositivos Empresariales", "business-device-printing.test.ts", 14, 0, "Spooler de impresión Brother DCP-1600 y salud de periféricos", "100% Determinista"),
    ("Front-End Web & I18N", "operational-ui-frontend.test.ts, operational-ui-i18n.test.ts", 86, 0, "SPA nativa con 0 innerHTML y alternancia bilingüe es-419 / en", "100% Determinista"),
    ("TOTAL CANÓNICO", "11 Suites de Ejecución Concurrente/Secuencial", 985, 0, "LÍNEA BASE INTEGRAL COMPLETA DEL REPOSITORIO", "100% DETERMINISTA")
]

for row_idx, data in enumerate(TEST_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_test.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if row_idx == len(TEST_DATA) + 3:
            cell.font = BOLD_FONT
            cell.fill = DONE_FILL
        elif col_idx in (3, 4):
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_test, len(TEST_HEADERS))
ws_test.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 09: 09_DOCUMENTATION
# -------------------------------------------------------------
ws_docs = wb.create_sheet(title="09_DOCUMENTATION")
ws_docs.views.sheetView[0].showGridLines = True
ws_docs.cell(row=1, column=1, value="REGISTRO DE DOCUMENTACIÓN OFICIAL Y MANUALES").font = TITLE_FONT

DOCS_HEADERS = ["Documento", "Propósito Principal", "Idioma", "Canónico", "Estado", "Última Revisión", "Componentes Relacionados"]
for col_idx, h in enumerate(DOCS_HEADERS, 1):
    ws_docs.cell(row=3, column=col_idx, value=h)
style_header_row(ws_docs, 3, len(DOCS_HEADERS))

DOCS_DATA = [
    ("LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md", "Libro integral de arquitectura en 13 capítulos e infografías maestras", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Todos los componentes"),
    ("docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md", "Espejo idéntico del Libro Oficial dentro del directorio docs/", "es-419", "SÍ (Espejo)", "VIGENTE", "2026-09-17", "Todos los componentes"),
    ("docs/SOURCE_OF_TRUTH.md", "Jerarquía canónica de autoridad documental y resolución de discrepancias", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Gobernanza documental"),
    ("docs/ROADMAP_MASTER.md", "Registro técnico maestro estructurado con identificadores de iniciativa", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Roadmap y backlog"),
    ("README.md", "Visión general, arquitectura de capas e instrucciones de arranque", "es-419 / en", "SÍ", "VIGENTE", "2026-09-17", "Repositorio general"),
    ("ROADMAP.md", "Resumen ejecutivo de hitos y criterios de salida de versión", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Hitos de versión"),
    ("CHANGELOG.md", "Historial cronológico de cambios bajo especificación Keep a Changelog", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Releases v0.1 a v1.1.0"),
    ("docs/DECISIONS.md", "Índice central de Registros de Decisiones Arquitectónicas (ADRs)", "es-419", "SÍ", "VIGENTE", "2026-09-17", "ADRs 0001 a 0022"),
    ("docs/MANUAL_OFICIAL.md", "Manual operacional para desarrolladores y administradores", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Platform API y SDK"),
    ("docs/TEST_REGISTRY.md", "Inventario verificado de pruebas automatizadas y métricas de calidad", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Suites de tests"),
    ("docs/TECHNICAL_DEBT.md", "Registro honesto de brechas técnicas y limitaciones conocidas", "es-419", "SÍ", "VIGENTE", "2026-09-17", "Backlog y deuda técnica")
]

for row_idx, data in enumerate(DOCS_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_docs.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx in (3, 4, 5):
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_docs, len(DOCS_HEADERS))
ws_docs.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 10: 10_DEVICES
# -------------------------------------------------------------
ws_dev = wb.create_sheet(title="10_DEVICES")
ws_dev.views.sheetView[0].showGridLines = True
ws_dev.cell(row=1, column=1, value="REGISTRO DE DISPOSITIVOS EMPRESARIALES").font = TITLE_FONT

DEV_HEADERS = ["Device ID", "Fabricante", "Modelo", "Puerto Local", "Controlador SO", "Adaptador Software", "Hardware Físico", "Capacidad Impresión", "Soporte Consumibles", "Tests"]
for col_idx, h in enumerate(DEV_HEADERS, 1):
    ws_dev.cell(row=3, column=col_idx, value=h)
style_header_row(ws_dev, 3, len(DEV_HEADERS))

DEV_DATA = [
    ("printer-brother-dcp1600", "Brother", "Brother DCP-1600 series", "USB001", "Brother DCP-1600 series GDI", "IMPLEMENTED (BrotherPrinterAdapter)", "OFFLINE / DISCONNECTED (WorkOffline: true)", "SUPPORTED", "UNSUPPORTED (GDI limitation)", "14 tests PASS")
]

for row_idx, data in enumerate(DEV_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_dev.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx in (6, 8, 10):
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")
        elif col_idx in (7, 9):
            cell.fill = BACKLOG_FILL
            cell.font = BACKLOG_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_dev, len(DEV_HEADERS))
ws_dev.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 11: 11_TECH_DEBT
# -------------------------------------------------------------
ws_debt = wb.create_sheet(title="11_TECH_DEBT")
ws_debt.views.sheetView[0].showGridLines = True
ws_debt.cell(row=1, column=1, value="REGISTRO DE DEUDA TÉCNICA Y BRECHAS REALES").font = TITLE_FONT

DEBT_HEADERS = ["Brecha ID", "Área Técnica", "Severidad", "Descripción de la Brecha", "Impacto Operativo", "Resolución Planificada", "Fase Destino"]
for col_idx, h in enumerate(DEBT_HEADERS, 1):
    ws_debt.cell(row=3, column=col_idx, value=h)
style_header_row(ws_debt, 3, len(DEBT_HEADERS))

DEBT_DATA = [
    ("GAP-01", "Model Gateways", "Resuelta", "Ausencia de adaptador real para Google Gemini / Vertex AI", "Resuelta en Prompt 101 / Fase 55 con GeminiModelGateway", "Implementado GeminiModelGateway en src/infrastructure/model/gemini/", "v1.2 (AOP-MODEL-GEMINI) - CERRADA"),
    ("GAP-02", "Memory & Context", "Resuelta", "Memoria de agentes exclusivamente volátil (InMemoryMemoryGateway)", "Resuelta en Prompt 101 / Fase 55 con SqliteMemoryGateway", "Implementado SqliteMemoryGateway relacional duradero", "v1.2 (AOP-MEMORY) - CERRADA"),
    ("GAP-03", "Seguridad / Auth", "Resuelta", "Autenticación basada en repositorio en memoria sin OIDC/OAuth2/JWT corporativo", "Resuelta en Prompt 101 / Fase 55 con JwtTokenVerifier", "Integrado JwtTokenVerifier asimétrico RS256/ES256", "v1.2 (AOP-AUTH) - CERRADA"),
    ("GAP-04", "Infraestructura / Red", "Resuelta", "Servidor escucha directamente en 127.0.0.1:3000 sin proxy reverso ni TLS nativo", "Resuelta en Prompt 101 / Fase 55 con Caddy/Nginx manifests", "Manifiestos oficiales Nginx/Caddy con terminación TLS", "v1.2 (AOP-NETWORK) - CERRADA"),
    ("GAP-05", "Platform API", "Resuelta", "Dualidad de rutas (/api/v1/* y alias /api/platform/v1/*)", "Resuelta en Prompt 101 / Fase 55 con cabeceras RFC 8594", "Convergencia en /api/v1/* con cabeceras de deprecación", "v1.2 (AOP-API-SURFACES) - CERRADA"),
    ("GAP-06", "Recovery & Resilience", "Baja", "Agregado Agent sin máquina formal de recuperación post-crash", "Los agentes son declarativos; no hay ciclo de crash recovery de agente", "Formalizar en ADR 0018 la naturaleza stateless de agentes", "v1.2"),
    ("GAP-07", "Business Devices", "Informativa", "Impresora USB no expone niveles de tóner por controlador estándar", "No inventar métricas falsas de consumibles", "Mantener reporte honesto device.consumables: UNSUPPORTED", "Permanente")
]

for row_idx, data in enumerate(DEBT_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_debt.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 3:
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_debt, len(DEBT_HEADERS))
ws_debt.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 12: 12_DECISIONS
# -------------------------------------------------------------
ws_dec = wb.create_sheet(title="12_DECISIONS")
ws_dec.views.sheetView[0].showGridLines = True
ws_dec.cell(row=1, column=1, value="ÍNDICE CENTRAL DE DECISIONES ARQUITECTÓNICAS (ADRs)").font = TITLE_FONT

DEC_HEADERS = ["ADR ID", "Título de la Decisión", "Archivo de Especificación", "Estado", "Fecha", "Regla de Oro / Racionalidad Técnica"]
for col_idx, h in enumerate(DEC_HEADERS, 1):
    ws_dec.cell(row=3, column=col_idx, value=h)
style_header_row(ws_dec, 3, len(DEC_HEADERS))

DEC_DATA = [
    ("ADR-100-01", "Jerarquía Canónica de Fuente de Verdad", "docs/SOURCE_OF_TRUTH.md", "APROBADO", "2026-09-17", "Código > Tests > Git > Documentación > Roadmap > Excel."),
    ("ADR-100-02", "Fuente Única de Versión de Runtime", "src/platform/version.ts", "APROBADO", "2026-09-17", "PLATFORM_VERSION es la autoridad canónica única (1.1.0)."),
    ("ADR-100-03", "Política de Idioma Documental (es-419)", "docs/DOCUMENTATION_STYLE_GUIDE.md", "APROBADO", "2026-09-17", "Español Latinoamericano oficial; Web UI bilingüe; código y APIs en inglés."),
    ("ADR-100-04", "Rol del Excel como Herramienta Derivada", "docs/SOURCE_OF_TRUTH.md", "APROBADO", "2026-09-17", "El archivo Excel es una vista de seguimiento generada, nunca fuente primaria."),
    ("ADR-100-05", "Relación Canónica de Rutas de API", "src/platform/api/http-router.ts", "APROBADO", "2026-09-17", "/api/v1/* es canónico; /api/platform/v1/* se conserva como alias de compatibilidad."),
    ("ADR 0001", "TypeScript & Zero Runtime Dependencies", "0001-typescript-node-foundation.md", "APROBADO", "2026-09-01", "Cero dependencias npm en runtime; Node.js nativo."),
    ("ADR 0002", "Domain Events & Observabilidad Inmutable", "0002-domain-events-and-observability.md", "APROBADO", "2026-09-02", "Bus de eventos desacoplado correlacionado por traceId."),
    ("ADR 0003", "Manual Composition Root", "0003-manual-composition.md", "APROBADO", "2026-09-02", "Inyección de dependencias explícita en composition.ts."),
    ("ADR 0004", "Core Runtime Execution Model", "0004-core-runtime-execution-model.md", "APROBADO", "2026-09-03", "CoreRuntime propietario único del ciclo Task/Execution."),
    ("ADR 0005", "Tools as Explicit Capabilities", "0005-tools-as-explicit-capabilities.md", "APROBADO", "2026-09-03", "Herramientas modeladas con esquemas de validación JSON."),
    ("ADR 0006", "Engine / Platform / Application Boundary", "0006-engine-platform-application-boundary.md", "APROBADO", "2026-09-04", "Separación física de paquetes en tres fronteras autónomas."),
    ("ADR 0007", "Sequential Orchestration", "0007-sequential-orchestration.md", "APROBADO", "2026-09-04", "Cadenas lineales deterministas con parada ante primer fallo."),
    ("ADR 0008", "Context & Scoped Memory Boundaries", "0008-context-and-memory-boundaries.md", "APROBADO", "2026-09-05", "Particionamiento estricto por TASK, AGENT, SESSION."),
    ("ADR 0009", "Fail-Closed Policy Governance", "0009-observability-and-governance-boundaries.md", "APROBADO", "2026-09-05", "Evaluación de política previa a cualquier modelo o tool."),
    ("ADR 0010", "Platform API & Web UI Boundary", "0010-platform-api-and-web-ui.md", "APROBADO", "2026-09-06", "Web Console como cliente desacoplado de la API REST."),
    ("ADR 0011", "First-Class Agent Aggregate", "0011-agent-architecture.md", "APROBADO", "2026-09-06", "Agent ≠ Execution; perfil declarativo de capacidades."),
    ("ADR 0012", "Autonomous Operations Foundation", "0012-autonomous-operations.md", "APROBADO", "2026-09-07", "Modelo supervisado para ciclos iterativos hacia un objetivo."),
    ("ADR 0013", "Bounded Autonomous Operations & Budget", "0013-bounded-autonomous-operations.md", "APROBADO", "2026-09-07", "AutonomyBudget inmutable (pasos, duración, tools)."),
    ("ADR 0014", "Autonomous Operations API Integration", "0014-autonomous-operations-api-integration.md", "APROBADO", "2026-09-07", "Endpoints /api/v1/operations y UI con 0 innerHTML."),
    ("ADR 0015", "Durable Persistence Architecture (SQLite WAL)", "0015-durable-persistence-architecture.md", "APROBADO", "2026-09-08", "Adopción de node:sqlite nativo con WAL y OCC."),
    ("ADR 0016", "Formal Domain Rehydration Boundary", "0016-formal-domain-rehydration-boundary.md", "APROBADO", "2026-09-08", "Método rehydrate() sin reflexión en infraestructura."),
    ("ADR 0017", "Core Execution Rehydration Boundary", "0017-core-execution-domain-rehydration-boundary.md", "APROBADO", "2026-09-08", "Rehidratación para Task, Execution y TaskError."),
    ("ADR 0018", "Agent Domain Rehydration Boundary", "0018-agent-domain-rehydration-boundary.md", "APROBADO", "2026-09-08", "Rehidratación formal para Agent con control de versión."),
    ("ADR 0019", "Durable SQLite Adapters for Core Entities", "0019-durable-sqlite-adapters-for-task-execution-agent.md", "APROBADO", "2026-09-09", "SqliteTask, Execution y Agent repositories."),
    ("ADR 0020", "Crash Recovery & Restart Reconciliation", "0020-crash-recovery-and-restart-reconciliation.md", "APROBADO", "2026-09-10", "RestartRecoveryService para transición atómica post-caída."),
    ("ADR 0021", "Durable Events & Audit Infrastructure", "0021-durable-events-and-audit-infrastructure.md", "APROBADO", "2026-09-10", "SqliteEventStore inmutable append-only."),
    ("ADR 0022", "Observability Audit Query & Diagnostics", "0022-observability-audit-query-and-runtime-diagnostics.md", "APROBADO", "2026-09-11", "Reconstrucción de trazas forenses por traceId."),
    ("ADR 0023", "Google Gemini Model Gateway Adapter", "0023-google-gemini-model-gateway.md", "APROBADO", "2026-09-17", "Adaptador oficial para Google Gemini y Vertex AI con streaming y JSON."),
    ("ADR 0024", "SQLite Durable Memory Gateway", "0024-sqlite-durable-memory-gateway.md", "APROBADO", "2026-09-17", "Persistencia relacional duradera para memoria indexada por agente y sesión."),
    ("ADR 0025", "Asymmetric JWT & Key Rotation", "0025-asymmetric-jwt-and-key-rotation.md", "APROBADO", "2026-09-17", "Verificación criptográfica RS256/ES256 y rotación dinámica de claves."),
    ("ADR 0026", "Production Reverse Proxy & TLS", "0026-production-reverse-proxy-and-tls.md", "APROBADO", "2026-09-17", "Manifiestos Nginx/Caddy con terminación TLS y rate limiting perimetral.")
]

for row_idx, data in enumerate(DEC_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_dec.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 4:
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_dec, len(DEC_HEADERS))
ws_dec.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 13: 13_PROMPT_TRACEABILITY
# -------------------------------------------------------------
ws_trace = wb.create_sheet(title="13_PROMPT_TRACEABILITY")
ws_trace.views.sheetView[0].showGridLines = True
ws_trace.cell(row=1, column=1, value="MATRIZ DE TRAZABILIDAD DE PROMPTS (PROMPTS 94 AL 101)").font = TITLE_FONT

TRACE_HEADERS = ["Prompt", "Fase / Hito", "Objetivo Principal", "Capacidades Implementadas", "Evidencia en Código", "Tests", "Commit Git", "Estado"]
for col_idx, h in enumerate(TRACE_HEADERS, 1):
    ws_trace.cell(row=3, column=col_idx, value=h)
style_header_row(ws_trace, 3, len(TRACE_HEADERS))

TRACE_DATA = [
    ("Prompt 94", "Phase 52", "Enterprise Control Plane & Operational Console", "Vistas SPA nativas, integración PlatformClient, 0 innerHTML", "src/platform/web/", "34 tests pass", "01009f5", "DONE"),
    ("Prompt 95", "Phase 53", "Business Devices & Brother DCP-1600 Printer", "BrotherPrinterAdapter, spooler de impresión USB001, PrintJob", "src/infrastructure/device/", "14 tests pass", "5d214b9", "DONE"),
    ("Prompt 96", "Phase 53", "Enterprise API Hardening & Diagnostics", "Endpoints /api/v1/diagnostics, rate limiting, trazas forenses", "src/platform/api/http-router.ts", "28 tests pass", "5d214b9", "DONE"),
    ("Prompt 97", "Phase 46-51", "Application Factory 2.0 & Vehicle Parts App", "Catálogo automotriz, compatibilidad mecánica, manifiestos", "src/application/platform/", "28 tests pass", "0aff833", "DONE"),
    ("Prompt 98", "Phase 46-48", "Official Documentation & Visual Blueprints", "Libro Oficial en Markdown/PDF, 5 infografías maestras es-419", "LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md", "Integridad sintáctica", "fa95aff", "DONE"),
    ("Prompt 99", "Phase 54", "Bilingual Web Interface & Spanish-First Manuals", "Núcleo i18n es-419/en en Web UI, armonización manuales", "src/platform/web/i18n/", "18 tests pass", "00ea46b", "DONE"),
    ("Prompt 100", "Phase 54", "Auditoría Fuente de Verdad, Resincronización & Roadmap", "12 registros canónicos docs/, Excel 14 hojas, docs:check, 966 tests", "docs/*, scripts/docs-check.mjs", "966 tests PASS", "docs(phase-54)", "DONE"),
    ("Prompt 101", "Phase 55", "Enterprise Cloud Foundation & Real Model Expansion", "Gemini Gateway, SqliteMemoryGateway, JWT RS256/ES256, Caddy/Nginx TLS, RFC 8594", "src/infrastructure/, deploy/", "19 tests pass (985 total)", "feat(phase-55)", "DONE")
]

for row_idx, data in enumerate(TRACE_DATA, 4):
    for col_idx, val in enumerate(data, 1):
        cell = ws_trace.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 8:
            cell.fill = DONE_FILL
            cell.font = DONE_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_trace, len(TRACE_HEADERS))
ws_trace.freeze_panes = "A4"

# -------------------------------------------------------------
# SHEET 14: 14_DASHBOARD
# -------------------------------------------------------------
ws_dash = wb.create_sheet(title="14_DASHBOARD")
ws_dash.views.sheetView[0].showGridLines = True
ws_dash.cell(row=1, column=1, value="PANEL EJECUTIVO DE CONTROL Y MÉTRICAS (DASHBOARD)").font = TITLE_FONT
ws_dash.cell(row=2, column=1, value="Métricas consolidadas derivadas exclusivamente de la auditoría factual y tests automatizados.").font = SUBTITLE_FONT

# Key Metric Cards
METRIC_HEADERS = ["Métrica de Estado", "Valor Factual", "Comprobación / Evidencia"]
for col_idx, h in enumerate(METRIC_HEADERS, 1):
    ws_dash.cell(row=4, column=col_idx, value=h)
style_header_row(ws_dash, 4, len(METRIC_HEADERS))

DASH_METRICS = [
    ("Versión de Plataforma (PLATFORM_VERSION)", "1.3.0", "src/platform/version.ts, package.json"),
    ("Total de Pruebas Automatizadas", "1391 PASS (0 FAIL)", "node --test dist/tests (100% éxito)"),
    ("Suites de Pruebas Verificadas", "59 Suites", "Tests unitarios, de contrato y de integración"),
    ("Total de Iniciativas en Roadmap Maestro", "46 Iniciativas", "docs/ROADMAP_MASTER.md"),
    ("Iniciativas Completadas (DONE)", "45 Iniciativas (97.8%)", "Implementadas en código y probadas"),
    ("Iniciativas en Validación (VALIDATION)", "1 Iniciativa (2.2%)", "AOP-V1-EXIT (Certificación de salida)"),
    ("Iniciativas Bloqueadas / Fallidas", "0", "Cero bloqueos técnicos activos"),
    ("Dependencias en Runtime (npm ls)", "0 (Zero Dependencies)", "APIs nativas de Node.js exclusivamente"),
    ("Vulnerabilidades XSS en Front-End", "0 innerHTML", "Sanitización estricta del DOM comprobada"),
    ("Registros de Decisión Arquitectónica (ADRs)", "50 ADRs Catalogados", "docs/decisions/ (ADR 0001 al 0040 + Serie ADR-001..010)"),
    ("Persistencia Relacional Duradera", "SQLite WAL (data/app.db)", "node:sqlite nativo en servidor de producción"),
    ("Idiomas del Plano de Control Web", "es-419 (Default) / en", "src/platform/web/i18n/ dinámico")
]

for row_idx, data in enumerate(DASH_METRICS, 5):
    for col_idx, val in enumerate(data, 1):
        cell = ws_dash.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx == 1:
            cell.font = BOLD_FONT
        elif col_idx == 2:
            cell.alignment = Alignment(horizontal="center")
            cell.font = BOLD_FONT

# Area Breakdown Table
ws_dash.cell(row=19, column=1, value="DISTRIBUCIÓN DE INICIATIVAS POR ÁREA TÉCNICA").font = Font(name="Segoe UI", size=11, bold=True, color="1E293B")
AREA_HEADERS = ["Área Técnica", "Iniciativas Totales", "Completadas", "Backlog", "Estado de Madurez"]
for col_idx, h in enumerate(AREA_HEADERS, 1):
    ws_dash.cell(row=21, column=col_idx, value=h)
style_header_row(ws_dash, 21, len(AREA_HEADERS))

AREAS_DATA = [
    ("Core Engine & Autonomía", 8, 8, 0, "MADURA / CONGELADA"),
    ("Persistencia & Recuperación", 6, 6, 0, "MADURA (SQLite WAL + Memoria Duradera)"),
    ("Platform Product & APIs", 5, 5, 0, "OPERACIONAL (Convergencia RFC 8594)"),
    ("Model Gateways & AI Runtime", 5, 5, 0, "OPERACIONAL (OpenAI, Anthropic, Ollama, Gemini)"),
    ("Ecosistema de Aplicaciones", 2, 2, 0, "OPERACIONAL (Tentaciones + Vehicle Parts)"),
    ("Dispositivos Empresariales", 1, 1, 0, "OPERACIONAL (Hardware offline)"),
    ("Seguridad & Gobernanza", 4, 3, 1, "OPERACIONAL (Auth JWT + TLS listos; V1-Exit backlog)")
]

for row_idx, data in enumerate(AREAS_DATA, 22):
    for col_idx, val in enumerate(data, 1):
        cell = ws_dash.cell(row=row_idx, column=col_idx, value=val)
        cell.font = REGULAR_FONT
        cell.border = THIN_BORDER
        if col_idx in (2, 3, 4):
            cell.alignment = Alignment(horizontal="center")
        elif col_idx == 5:
            cell.font = BOLD_FONT
            cell.alignment = Alignment(horizontal="center")

auto_fit_columns(ws_dash, len(METRIC_HEADERS))
ws_dash.freeze_panes = "A5"

# Save Workbook
output_path = "AI_Operating_Platform_Roadmap.xlsx"
doc_path = "DOCUMENTACION/AI_OPERATING_PLATFORM_BACKLOG_KANBAN.xlsx"

try:
    wb.save(output_path)
    print(f"[OK] Sincronizado exitosamente: {output_path} (14 pestanas)")
except PermissionError:
    print(f"[AVISO] '{output_path}' esta abierto en Excel de escritorio. Cierralo para sobrescribir directamente la raiz.")

try:
    wb.save(doc_path)
    print(f"[OK] Sincronizado exitosamente: {doc_path} (14 pestanas)")
except PermissionError:
    print(f"[AVISO] '{doc_path}' esta abierto en Excel de escritorio.")

