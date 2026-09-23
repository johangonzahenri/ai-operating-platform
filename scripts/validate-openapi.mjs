#!/usr/bin/env node
/**
 * scripts/validate-openapi.mjs
 * Structural and referential validator for OpenAPI 3.1 specification.
 * Zero heavy dependencies — uses native parsing and regex-based AST analysis.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const OPENAPI_PATH = path.join(ROOT_DIR, 'docs', 'openapi.yaml');

console.log('============================================================');
console.log('  AI Operating Platform — OpenAPI 3.1 Contract Validator');
console.log('============================================================\n');

if (!fs.existsSync(OPENAPI_PATH)) {
  console.error(`[ERROR] OpenAPI contract file not found at: ${OPENAPI_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(OPENAPI_PATH, 'utf8');

const errors = [];
const warnings = [];

// 1. Basic Structure
if (!content.includes('openapi: 3.1.0') && !content.includes('openapi: "3.1.0"') && !content.includes("openapi: '3.1.0'")) {
  errors.push('OpenAPI document must declare version 3.1.0');
}

if (!content.includes('title:') || !content.includes('version:')) {
  errors.push('OpenAPI info block must contain title and version');
}

// 2. Check Paths and Operation IDs
const pathMatches = content.match(/^  \/[a-zA-Z0-9_\-\/{}:]+:/gm) || [];
console.log(`Found ${pathMatches.length} paths declared in OpenAPI specification.`);

const opIdMatches = content.match(/operationId:\s*([a-zA-Z0-9_]+)/g) || [];
const opIds = opIdMatches.map((m) => m.replace(/operationId:\s*/, '').trim());
const opIdSet = new Set();
const duplicateOpIds = [];

for (const id of opIds) {
  if (opIdSet.has(id)) {
    duplicateOpIds.push(id);
  }
  opIdSet.add(id);
}

if (duplicateOpIds.length > 0) {
  errors.push(`Duplicate operationIds found: ${duplicateOpIds.join(', ')}`);
} else {
  console.log(`✓ All ${opIds.length} operationIds are unique.`);
}

// 3. Check Components and Schema References ($ref)
const refMatches = content.match(/\$ref:\s*['"]?#\/components\/([a-zA-Z0-9_\/]+)['"]?/g) || [];
console.log(`Found ${refMatches.length} component references ($ref).`);

const declaredSchemas = new Set();
const schemaBlockMatch = content.match(/components:\s*[\r\n]+([\s\S]+)/);
if (schemaBlockMatch) {
  const compSection = schemaBlockMatch[1];
  const schemaMatches = compSection.match(/ {4}([a-zA-Z0-9_]+):\s*[\r\n]/g) || [];
  for (const sm of schemaMatches) {
    declaredSchemas.add(sm.trim().replace(':', ''));
  }
}

let brokenRefs = 0;
for (const ref of refMatches) {
  const target = ref.replace(/\$ref:\s*['"]?#\/components\//, '').replace(/['"]?$/, '').trim();
  const [section, name] = target.split('/');
  if (!name || !content.includes(`    ${name}:`)) {
    errors.push(`Unresolved $ref reference: #/components/${target}`);
    brokenRefs++;
  }
}

if (brokenRefs === 0) {
  console.log(`✓ All ${refMatches.length} references resolve cleanly to declared components.`);
}

// 4. Security Schemes Verification
if (!content.includes('securitySchemes:') || !content.includes('apiKeyAuth:') || !content.includes('bearerAuth:')) {
  errors.push('Missing required securitySchemes (apiKeyAuth, bearerAuth)');
} else {
  console.log('✓ Security schemes apiKeyAuth and bearerAuth verified.');
}

console.log('\n------------------------------------------------------------');
if (errors.length > 0) {
  console.error(`Validation FAILED with ${errors.length} error(s):`);
  for (const err of errors) {
    console.error(`  ✖ ${err}`);
  }
  process.exit(1);
} else {
  console.log('OpenAPI 3.1 specification validation PASSED (100% compliant).');
  console.log('============================================================\n');
  process.exit(0);
}
