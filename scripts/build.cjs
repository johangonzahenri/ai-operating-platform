const fs = require('fs');
const path = require('path');
const ts = require('C:/Users/Johan/AppData/Local/Programs/Microsoft VS Code/7debcd0e2a/resources/app/extensions/node_modules/typescript/lib/typescript.js');

console.log(`Building AI Operating Platform (ESM) with TypeScript ${ts.version}...`);

function walk(dir) {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) res = res.concat(walk(full));
    else if (f.endsWith('.ts') && !f.endsWith('.d.ts')) res.push(full);
  }
  return res;
}

const rootDir = path.resolve(__dirname, '..');
const srcFiles = walk(path.join(rootDir, 'src'));
const testFiles = walk(path.join(rootDir, 'tests'));
const exampleFiles = walk(path.join(rootDir, 'examples'));
const allFiles = [...srcFiles, ...testFiles, ...exampleFiles];

console.log(`Found ${srcFiles.length} source files, ${testFiles.length} test files, and ${exampleFiles.length} example files to compile.`);

let success = 0;
let errors = 0;

for (const file of allFiles) {
  try {
    const sourceCode = fs.readFileSync(file, 'utf8');
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
      fileName: file
    });

    const relPath = path.relative(rootDir, file);
    const outPath = path.join(rootDir, 'dist', relPath.replace(/\.ts$/, '.js'));
    const outDir = path.dirname(outPath);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outPath, result.outputText, 'utf8');
    success++;
  } catch (err) {
    console.error(`Error compiling ${file}:`, err);
    errors++;
  }
}

console.log(`Build complete: ${success} files compiled successfully, ${errors} errors.`);
if (errors > 0) process.exit(1);
