#!/usr/bin/env node
/**
 * scripts/master-work-plan-check.mjs
 * 
 * Verificador automatizado de integridad del Plan Maestro Operativo Oficial
 * (docs/MASTER_WORK_PLAN.md) para la AI Operating Platform.
 *
 * Verificaciones realizadas:
 * 1. Existencia y legibilidad del archivo canónico.
 * 2. Estructura de secciones maestras obligatorias.
 * 3. Sintaxis y jerarquía estricta de numeración X / X.Y / X.Y.Z (máximo 3 niveles).
 * 4. Unicidad de identificadores de fases, tareas y cambios (sin duplicados).
 * 5. Pertenencia de cada tarea X.Y a su fase X declarada.
 * 6. Pertenencia de cada cambio X.Y.Z a su tarea X.Y correspondiente.
 * 7. Validez de los estados técnicos y operativos según la taxonomía oficial.
 * 8. Resolución determinista de enlaces a archivos locales referenciados.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mwpPath = path.join(rootDir, 'docs', 'MASTER_WORK_PLAN.md');

const TECHNICAL_STATES = new Set([
  'DONE', 'VALIDATION', 'IN_PROGRESS', 'PLANNED', 'ANALYSIS', 'BACKLOG', 'BLOCKED', 'DEFERRED', 'CANCELLED'
]);

const OPERATIONAL_STATES = new Set([
  'NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'WAITING_EXTERNAL', 'DONE', 'DEFERRED', 'CANCELLED'
]);

console.log('============================================================');
console.log('  AI Operating Platform — Master Work Plan Integrity Check  ');
console.log('============================================================\n');

let errorCount = 0;
function reportError(msg) {
  console.error(`  ✖ ERROR: ${msg}`);
  errorCount++;
}

// 1. Existencia del archivo
if (!fs.existsSync(mwpPath)) {
  console.error(`  ✖ FATAL: docs/MASTER_WORK_PLAN.md does not exist.`);
  process.exit(1);
}

const content = fs.readFileSync(mwpPath, 'utf8');
console.log(`✓ Loaded docs/MASTER_WORK_PLAN.md (${content.length} bytes)`);

// 2. Secciones obligatorias
const REQUIRED_SECTIONS = [
  'Misión y Propósito',
  'Separación Conceptual de Documentos',
  'Jerarquía Canónica de Autoridad',
  'Sistema Oficial de Indexación',
  'Taxonomía de Registros y Estados',
  'Protocolo de Operación',
  'Historial Canónico de Fases',
  'FASE 139',
  'Checklist Global Obligatorio',
  'Plantillas Oficiales de Registro',
  'Planificación Futura y Candidatos Post-v1.4'
];

for (const sec of REQUIRED_SECTIONS) {
  if (!content.includes(sec)) {
    reportError(`Missing mandatory section: "${sec}"`);
  }
}
if (errorCount === 0) {
  console.log(`✓ All ${REQUIRED_SECTIONS.length} mandatory sections present.`);
}

// 3. Extraer Fases, Tareas y Cambios
const phaseRegex = /^##\s+(?:8\.\s+)?FASE\s+(\d+)\s+[—-]\s+(.+)$/gm;
const taskRegex = /^####\s+(\d+)\.(\d+)\s+[—-]\s+(.+)$/gm;
const changeRegex = /^[-*]\s+\*\*(\d+)\.(\d+)\.(\d+)\s+[—-]\s+([^*]+)\*\*:/gm;

const phases = new Map();
const tasks = new Map();
const changes = new Map();

let match;
while ((match = phaseRegex.exec(content)) !== null) {
  const phaseId = parseInt(match[1], 10);
  const title = match[2].trim();
  if (phases.has(phaseId)) {
    reportError(`Duplicate Phase ID: FASE ${phaseId}`);
  } else {
    phases.set(phaseId, { phaseId, title });
  }
}

while ((match = taskRegex.exec(content)) !== null) {
  const phaseId = parseInt(match[1], 10);
  const taskIndex = parseInt(match[2], 10);
  const taskId = `${phaseId}.${taskIndex}`;
  const title = match[3].trim();
  if (tasks.has(taskId)) {
    reportError(`Duplicate Task ID: ${taskId}`);
  } else {
    tasks.set(taskId, { phaseId, taskIndex, taskId, title });
  }
}

while ((match = changeRegex.exec(content)) !== null) {
  const phaseId = parseInt(match[1], 10);
  const taskIndex = parseInt(match[2], 10);
  const changeIndex = parseInt(match[3], 10);
  const changeId = `${phaseId}.${taskIndex}.${changeIndex}`;
  const title = match[4].trim();
  if (changes.has(changeId)) {
    reportError(`Duplicate Change ID: ${changeId}`);
  } else {
    changes.set(changeId, { phaseId, taskIndex, changeIndex, changeId, title });
  }
}

console.log(`✓ Identified ${phases.size} Phase(s), ${tasks.size} Task(s), and ${changes.size} Change record(s).`);

// 4. Validar pertenencia de tareas a fases existentes
for (const [taskId, task] of tasks.entries()) {
  if (!phases.has(task.phaseId)) {
    reportError(`Task ${taskId} references non-existent Phase ${task.phaseId}`);
  }
}

// 5. Validar pertenencia de cambios a tareas existentes
for (const [changeId, change] of changes.entries()) {
  const parentTaskId = `${change.phaseId}.${change.taskIndex}`;
  if (!tasks.has(parentTaskId)) {
    reportError(`Change ${changeId} references non-existent Task ${parentTaskId}`);
  }
}

// 6. Validar que no existan identificadores de 4to nivel (X.Y.Z.W) como encabezados o registros
const invalidDepthRegex = /^(?:#{1,6}\s+|[-*]\s+\*\*)\d+\.\d+\.\d+\.\d+/gm;
const invalidMatches = content.match(invalidDepthRegex);
if (invalidMatches) {
  for (const m of invalidMatches) {
    reportError(`Forbidden 4th-level identifier detected: "${m}". Maximum depth is X.Y.Z.`);
  }
} else {
  console.log(`✓ Hierarchy depth verified: strictly capped at max 3 levels (X.Y.Z).`);
}

// 7. Validar estados declarados en el archivo
const stateRegex = /-\s+\*\*Estado(?:\s+Técnico|\s+Operativo)?\*\*:\s+`?([A-Z_]+)`?/g;
let stateMatch;
let totalStatesChecked = 0;
while ((stateMatch = stateRegex.exec(content)) !== null) {
  const state = stateMatch[1].trim();
  totalStatesChecked++;
  if (!TECHNICAL_STATES.has(state) && !OPERATIONAL_STATES.has(state)) {
    reportError(`Invalid state declared: "${state}". Must be one of technical or operational taxonomy.`);
  }
}
console.log(`✓ Validated ${totalStatesChecked} state declarations against official taxonomies.`);

// 8. Validar enlaces internos a archivos
const docLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
let linkMatch;
let internalLinksChecked = 0;
while ((linkMatch = docLinkRegex.exec(content)) !== null) {
  const linkTarget = linkMatch[2].trim();
  if (linkTarget.startsWith('#') || linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) {
    continue;
  }
  const cleanTarget = linkTarget.split('#')[0];
  if (!cleanTarget) continue;
  
  const targetPath = cleanTarget.startsWith('./')
    ? path.join(rootDir, 'docs', cleanTarget.slice(2))
    : path.resolve(rootDir, 'docs', cleanTarget);

  internalLinksChecked++;
  if (!fs.existsSync(targetPath)) {
    reportError(`Broken internal link in MASTER_WORK_PLAN.md: "${linkTarget}" -> "${targetPath}"`);
  }
}
console.log(`✓ Validated ${internalLinksChecked} internal document links.`);

console.log('\n------------------------------------------------------------');
if (errorCount === 0) {
  console.log('Master Work Plan validation PASSED (100% structurally compliant).');
  console.log('============================================================\n');
  process.exit(0);
} else {
  console.error(`Master Work Plan validation FAILED with ${errorCount} error(s).`);
  console.log('============================================================\n');
  process.exit(1);
}
