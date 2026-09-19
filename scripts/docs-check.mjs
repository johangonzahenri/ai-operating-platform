#!/usr/bin/env node
/**
 * scripts/docs-check.mjs
 * Automated verification of documentation integrity, source-of-truth consistency,
 * version alignment, ADR references, test counts, and roadmap invariants.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = process.cwd();

let errors = [];
let warnings = [];

function error(msg) {
  errors.push(`[ERROR] ${msg}`);
}

function warn(msg) {
  warnings.push(`[WARN]  ${msg}`);
}

console.log('============================================================');
console.log('  AI Operating Platform — Documentation & Truth Check');
console.log('============================================================\n');

// -------------------------------------------------------------
// 1. Version Consistency Check
// -------------------------------------------------------------
console.log('1. Checking version single source of truth...');

let platformVersion = null;
try {
  const versionTs = fs.readFileSync(path.join(ROOT_DIR, 'src/platform/version.ts'), 'utf8');
  const match = versionTs.match(/PLATFORM_VERSION\s*=\s*["']([^"']+)["']/);
  if (match) {
    platformVersion = match[1];
    console.log(`   ✓ PLATFORM_VERSION found: ${platformVersion}`);
  } else {
    error('Could not parse PLATFORM_VERSION from src/platform/version.ts');
  }
} catch (err) {
  error(`Failed to read src/platform/version.ts: ${err.message}`);
}

try {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  if (pkgJson.version !== platformVersion) {
    error(`package.json version (${pkgJson.version}) does not match PLATFORM_VERSION (${platformVersion})`);
  } else {
    console.log(`   ✓ package.json version matches: ${pkgJson.version}`);
  }
} catch (err) {
  error(`Failed to read package.json: ${err.message}`);
}

try {
  const readme = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');
  if (!readme.includes(platformVersion)) {
    error(`README.md does not reference platform version ${platformVersion}`);
  } else {
    console.log(`   ✓ README.md references version: ${platformVersion}`);
  }
} catch (err) {
  error(`Failed to read README.md: ${err.message}`);
}

try {
  const roadmap = fs.readFileSync(path.join(ROOT_DIR, 'ROADMAP.md'), 'utf8');
  if (!roadmap.includes(platformVersion)) {
    error(`ROADMAP.md does not reference platform version ${platformVersion}`);
  } else {
    console.log(`   ✓ ROADMAP.md references version: ${platformVersion}`);
  }
} catch (err) {
  error(`Failed to read ROADMAP.md: ${err.message}`);
}

// -------------------------------------------------------------
// 2. Canonical Document Presence and Hash Invariance
// -------------------------------------------------------------
console.log('\n2. Checking required canonical documents...');

const REQUIRED_DOCS = [
  'LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md',
  'docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md',
  'docs/SOURCE_OF_TRUTH.md',
  'docs/ROADMAP_MASTER.md',
  'docs/PROMPT_TRACEABILITY.md',
  'docs/DOCUMENTATION_REGISTRY.md',
  'docs/ARCHITECTURE_REGISTRY.md',
  'docs/APPLICATION_REGISTRY.md',
  'docs/DEVICE_REGISTRY.md',
  'docs/SECURITY_REGISTRY.md',
  'docs/TEST_REGISTRY.md',
  'docs/TECHNICAL_DEBT.md',
  'docs/DECISIONS.md',
  'docs/V1_EXIT_CRITERIA.md',
  'README.md',
  'ROADMAP.md',
  'CHANGELOG.md',
];

for (const doc of REQUIRED_DOCS) {
  const fullPath = path.join(ROOT_DIR, doc);
  if (!fs.existsSync(fullPath)) {
    error(`Missing required canonical document: ${doc}`);
  } else {
    const stats = fs.statSync(fullPath);
    if (stats.size === 0) {
      error(`Document is empty (0 bytes): ${doc}`);
    }
  }
}
console.log(`   ✓ All ${REQUIRED_DOCS.length} canonical documents exist.`);

// Check Libro Oficial mirror hash identity
try {
  const rootLibro = fs.readFileSync(path.join(ROOT_DIR, 'LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md'), 'utf8');
  const docsLibro = fs.readFileSync(path.join(ROOT_DIR, 'docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md'), 'utf8');
  const hashRoot = crypto.createHash('sha256').update(rootLibro).digest('hex');
  const hashDocs = crypto.createHash('sha256').update(docsLibro).digest('hex');
  if (hashRoot !== hashDocs) {
    error(`LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md and docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md are not identical (hash mismatch)`);
  } else {
    console.log(`   ✓ Root and docs Libro Oficial copies are 100% identical (SHA-256: ${hashRoot.slice(0, 12)}...)`);
  }
} catch (err) {
  error(`Failed comparing Libro Oficial copies: ${err.message}`);
}

// -------------------------------------------------------------
// 3. Test Count Verification
// -------------------------------------------------------------
console.log('\n3. Checking documented test count consistency...');

const CANONICAL_TEST_COUNT = '1354';

try {
  const readme = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');
  if (!readme.includes(`${CANONICAL_TEST_COUNT}%20passing`) && !readme.includes(`${CANONICAL_TEST_COUNT} pruebas`)) {
    error(`README.md does not document the canonical test count of ${CANONICAL_TEST_COUNT}`);
  } else {
    console.log(`   ✓ README.md documents ${CANONICAL_TEST_COUNT} tests`);
  }

  const libro = fs.readFileSync(path.join(ROOT_DIR, 'LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md'), 'utf8');
  if (!libro.includes(`${CANONICAL_TEST_COUNT} tests PASS`) && !libro.includes(`${CANONICAL_TEST_COUNT} PASS`)) {
    error(`LIBRO_OFICIAL does not document the canonical test count of ${CANONICAL_TEST_COUNT}`);
  } else {
    console.log(`   ✓ LIBRO_OFICIAL documents ${CANONICAL_TEST_COUNT} tests PASS`);
  }

  const testReg = fs.readFileSync(path.join(ROOT_DIR, 'docs/TEST_REGISTRY.md'), 'utf8');
  if (!testReg.includes(CANONICAL_TEST_COUNT)) {
    error(`docs/TEST_REGISTRY.md does not document the canonical test count of ${CANONICAL_TEST_COUNT}`);
  } else {
    console.log(`   ✓ docs/TEST_REGISTRY.md documents ${CANONICAL_TEST_COUNT} tests`);
  }
} catch (err) {
  error(`Failed reading files for test count check: ${err.message}`);
}

// -------------------------------------------------------------
// 4. Architectural Decision Records (ADR) Integrity
// -------------------------------------------------------------
console.log('\n4. Checking ADR traceability...');

const decisionsDir = path.join(ROOT_DIR, 'docs/decisions');
if (fs.existsSync(decisionsDir)) {
  const adrFiles = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
  console.log(`   Found ${adrFiles.length} ADR files in docs/decisions/`);

  const decisionsDoc = fs.readFileSync(path.join(ROOT_DIR, 'docs/DECISIONS.md'), 'utf8');
  const libroDoc = fs.readFileSync(path.join(ROOT_DIR, 'LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md'), 'utf8');

  let missingInDecisions = 0;
  for (const file of adrFiles) {
    if (!decisionsDoc.includes(file)) {
      warn(`ADR file ${file} not explicitly referenced in docs/DECISIONS.md`);
      missingInDecisions++;
    }
  }
  if (missingInDecisions === 0) {
    console.log(`   ✓ All ${adrFiles.length} ADR files are referenced in docs/DECISIONS.md`);
  }

  // Verify critical ADRs 0015-0027 in Libro Oficial
  const criticalAdrs = ['ADR 0015', 'ADR 0016', 'ADR 0017', 'ADR 0018', 'ADR 0019', 'ADR 0020', 'ADR 0021', 'ADR 0022', 'ADR 0023', 'ADR 0024', 'ADR 0025', 'ADR 0026', 'ADR 0027'];
  for (const adr of criticalAdrs) {
    if (!libroDoc.includes(adr)) {
      error(`Critical decision ${adr} is missing from LIBRO_OFICIAL traceability matrix`);
    }
  }
  console.log(`   ✓ Critical ADRs 0015-0027 verified in LIBRO_OFICIAL traceability matrix`);
} else {
  error(`docs/decisions directory does not exist!`);
}

// -------------------------------------------------------------
// 5. Roadmap Master Structure & Invariant Validation
// -------------------------------------------------------------
console.log('\n5. Checking ROADMAP_MASTER structure and integrity...');

const VALID_STATUSES = new Set([
  'DONE',
  'VALIDATION',
  'IN_PROGRESS',
  'PLANNED',
  'ANALYSIS',
  'BACKLOG',
  'BLOCKED',
  'DEFERRED',
  'CANCELLED',
]);

try {
  const roadmapMaster = fs.readFileSync(path.join(ROOT_DIR, 'docs/ROADMAP_MASTER.md'), 'utf8');
  const lines = roadmapMaster.split('\n');

  const seenIds = new Set();
  let initiativeCount = 0;

  for (const line of lines) {
    // Match table rows: | **AOP-XXX-YYY** | Title | Area | ... | Status | ...
    const match = line.match(/^\|\s*\*\*([A-Z0-9_-]+)\*\*\s*\|([^|]+)\|([^|]+)\|([^|]+)\|\s*`?([A-Z_]+)`?\s*\|/);
    if (match) {
      const id = match[1].trim();
      const status = match[5].trim();
      initiativeCount++;

      if (seenIds.has(id)) {
        error(`Duplicate initiative ID in ROADMAP_MASTER.md: ${id}`);
      }
      seenIds.add(id);

      if (!VALID_STATUSES.has(status)) {
        error(`Invalid status '${status}' for initiative ${id} in ROADMAP_MASTER.md`);
      }
    }
  }

  if (initiativeCount < 10) {
    error(`Found suspiciously few initiatives (${initiativeCount}) in ROADMAP_MASTER.md`);
  } else {
    console.log(`   ✓ Verified ${initiativeCount} structured initiatives with valid statuses and unique IDs`);
  }
} catch (err) {
  error(`Failed checking ROADMAP_MASTER.md: ${err.message}`);
}

// -------------------------------------------------------------
// 6. Security Sanitization Audit (0 innerHTML in frontend)
// -------------------------------------------------------------
console.log('\n6. Checking DOM security sanitization (0 innerHTML)...');

try {
  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'src/platform/web/app.js'), 'utf8');
  const innerHtmlMatches = appJs.match(/\.innerHTML\s*=/g);
  if (innerHtmlMatches && innerHtmlMatches.length > 0) {
    error(`Forbidden .innerHTML assignment found in src/platform/web/app.js (${innerHtmlMatches.length} occurrences)`);
  } else {
    console.log('   ✓ 0 .innerHTML assignments detected in src/platform/web/app.js');
  }
} catch (err) {
  error(`Failed checking src/platform/web/app.js: ${err.message}`);
}

// -------------------------------------------------------------
// Summary & Exit Code
// -------------------------------------------------------------
console.log('\n============================================================');
if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`  ${w}`));
}

if (errors.length > 0) {
  console.log(`\n❌ Validation FAILED with ${errors.length} error(s):`);
  errors.forEach(e => console.log(`  ${e}`));
  console.log('============================================================\n');
  process.exit(1);
} else {
  console.log('  All checks PASSED! Documentation is 100% consistent.');
  console.log('============================================================\n');
  process.exit(0);
}
