import { watch } from 'node:fs';
import { spawn } from 'node:child_process';

let debounceTimer = null;

function triggerSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log('[WATCHER] Cambio detectado. Sincronizando Excel Online...');
    const child = spawn('python', ['scripts/generate_roadmap_excel.py'], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        console.log('[WATCHER] Excel Online sincronizado correctamente.');
      }
    });
  }, 2000);
}

console.log('[WATCHER] Observador de cambios activo para Excel Online. Presiona Ctrl+C para salir.');
watch('DOCUMENTACION', { recursive: true }, triggerSync);
watch('docs', { recursive: true }, triggerSync);
