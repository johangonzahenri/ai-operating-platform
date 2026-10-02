# Operaciones y Confiabilidad — AI Operating Platform

## 1. Despliegue
### Desarrollo Local
```bash
npm install
npm run build
npm start
```
### Producción (Detrás de Reverse Proxy)
- Configurar `deploy/nginx/nginx.conf` o `deploy/caddy/Caddyfile`
- Establecer variables de entorno: `NODE_ENV=production`, `AOP_DATA_DIR`, `JWT_JWKS_URI`
- Iniciar con: `node dist/src/platform/server.js`

## 2. Ejecución
- Enlace por defecto: `127.0.0.1:3000`
- Chequeo de salud: `GET /api/v1/health/ready`
- Preparación (Readiness): retorna 200 cuando todos los subsistemas están inicializados

## 3. Monitoreo
- Métricas Prometheus: `GET /api/v1/metrics` (Formato de exposición Prometheus)
- Flujo de eventos: `GET /api/v1/events/stream` (SSE)
- Diagnósticos: `GET /api/v1/diagnostics`
- Reconstrucción de trazas: `GET /api/v1/diagnostics/traces/:traceId`

## 4. Respaldo
- SQLite WAL: copiar archivos `.db`, `.db-wal`, `.db-shm` atómicamente
- Recomendado: `sqlite3 platform.db '.backup backup.db'`
- Frecuencia: cada 15 minutos o antes del despliegue

## 5. Restauración
- Detener la plataforma
- Reemplazar el archivo `.db` con el respaldo
- Eliminar `.db-wal` y `.db-shm`
- Iniciar la plataforma (RestartRecoveryService reconcilia automáticamente)

## 6. Escalabilidad
- Actual: nodo único con SQLite WAL
- Adaptador PostgreSQL preparado para futura escalabilidad horizontal
- NO es un sistema distribuido - no desplegar múltiples instancias contra el mismo SQLite

## 7. Recuperación
- En caso de caída: RestartRecoveryService se ejecuta en el arranque
- Reconcilia las tareas RUNNING a FAILED
- Reconcilia las tareas QUEUED/CREATED a CANCELLED
- Transacción SQLite única - todo o nada

## 8. Rollback
- Desplegar el binario de la versión anterior
- Restaurar respaldo de la base de datos si el esquema cambió
- Verificar: `npm run check`

## 9. Respuesta a Incidentes

### Runbook 1: El Servidor No Inicia
1. Verificar versión de Node.js: `node --version` (≥ 18 requerido)
2. Verificar disponibilidad del puerto: `lsof -i :3000`
3. Verificar permisos de archivo SQLite
4. Verificar registros (logs) por errores de migración de esquema
5. Si SQLite está corrupto: restaurar desde respaldo

### Runbook 2: Corrupción de SQLite
1. Detener la plataforma inmediatamente
2. Ejecutar `sqlite3 platform.db 'PRAGMA integrity_check'`
3. Si está corrupto: restaurar desde el último respaldo
4. Si no hay respaldo: usar recuperación `.db-wal`
5. Después de restaurar: verificar con `npm test`

### Runbook 3: Proveedor LLM Caído
1. La plataforma hace auto-fallback a StubModelGateway
2. Verificar páginas de estado del proveedor
3. Monitorear `/api/v1/metrics` para tasas de error
4. El circuit breaker evita la cascada
5. Se reanuda automáticamente cuando el proveedor se recupera

### Runbook 4: Presupuesto Agotado
1. Verificar presupuesto del equipo: `GET /api/v1/teams/:id/budget`
2. Si es legítimo: aumentar límites vía `PUT /api/v1/teams/:id/budget`
3. Si es ataque: suspender el presupuesto del equipo
4. Revisar registro de auditoría: `GET /api/v1/audit?teamId=...`

### Runbook 5: Violación de Aislamiento de Inquilinos
1. CRÍTICO: Detener la plataforma inmediatamente
2. Capturar el registro de auditoría completo
3. Identificar inquilinos afectados por traceId
4. Revisar los registros de PolicyGateway
5. Análisis de causa raíz antes de reiniciar
