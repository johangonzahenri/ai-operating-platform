import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function findTests(dir) {
  let results = [];
  try {
    for (const item of readdirSync(dir)) {
      const full = join(dir, item);
      if (statSync(full).isDirectory()) {
        results = results.concat(findTests(full));
      } else if (item.endsWith('.test.js')) {
        results.push(full);
      }
    }
  } catch (err) {
    console.error('Error reading ' + dir + ':', err.message);
  }
  return results;
}

const testFiles = findTests('dist/tests');
if (testFiles.length === 0) {
  console.error('No test files found in dist/tests. Run npm run build first.');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
  stdio: 'inherit',
});

if (res.error) {
  console.error('Test runner execution failed:', res.error);
  process.exit(1);
}

if (typeof res.status === 'number' && res.status !== 0) {
  process.exit(res.status);
}

if (res.signal) {
  console.error(`Test runner terminated by signal: ${res.signal}`);
  process.exit(1);
}

process.exit(0);
