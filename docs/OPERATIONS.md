# Operations & Reliability — AI Operating Platform

## 1. Deploy
### Local Development
```bash
npm install
npm run build
npm start
```
### Production (Behind Reverse Proxy)
- Configure `deploy/nginx/nginx.conf` or `deploy/caddy/Caddyfile`
- Set environment variables: `NODE_ENV=production`, `AOP_DATA_DIR`, `JWT_JWKS_URI`
- Start with: `node dist/src/platform/server.js`

## 2. Run
- Default bind: `127.0.0.1:3000`
- Health check: `GET /api/v1/health/ready`
- Readiness: returns 200 when all subsystems initialized

## 3. Monitor
- Prometheus metrics: `GET /api/v1/metrics` (Prometheus exposition format)
- Event stream: `GET /api/v1/events/stream` (SSE)
- Diagnostics: `GET /api/v1/diagnostics`
- Trace reconstruction: `GET /api/v1/diagnostics/traces/:traceId`

## 4. Backup
- SQLite WAL: copy `.db`, `.db-wal`, `.db-shm` files atomically
- Recommended: `sqlite3 platform.db '.backup backup.db'`
- Frequency: every 15 minutes or before deployment

## 5. Restore
- Stop the platform
- Replace `.db` file with backup
- Delete `.db-wal` and `.db-shm`
- Start the platform (RestartRecoveryService reconciles automatically)

## 6. Scale
- Current: single-node with SQLite WAL
- PostgreSQL adapter prepared for future horizontal scaling
- NOT a distributed system - do not deploy multiple instances against same SQLite

## 7. Recover
- On crash: RestartRecoveryService runs at boot
- Reconciles RUNNING tasks to FAILED
- Reconciles QUEUED/CREATED tasks to CANCELLED
- Single SQLite transaction - all or nothing

## 8. Rollback
- Deploy previous version binary
- Restore database backup if schema changed
- Verify: `npm run check`

## 9. Incident Response

### Runbook 1: Server Won't Start
1. Check Node.js version: `node --version` (≥ 18 required)
2. Check port availability: `lsof -i :3000`
3. Check SQLite file permissions
4. Check logs for schema migration errors
5. If SQLite corrupted: restore from backup

### Runbook 2: SQLite Corruption
1. Stop platform immediately
2. Run `sqlite3 platform.db 'PRAGMA integrity_check'`
3. If corrupt: restore from latest backup
4. If no backup: use `.db-wal` recovery
5. After restore: verify with `npm test`

### Runbook 3: LLM Provider Down
1. Platform auto-falls back to StubModelGateway
2. Check provider status pages
3. Monitor `/api/v1/metrics` for error rates
4. Circuit breaker prevents cascade
5. Resume automatically when provider recovers

### Runbook 4: Budget Exhausted
1. Check team budget: `GET /api/v1/teams/:id/budget`
2. If legitimate: increase limits via `PUT /api/v1/teams/:id/budget`
3. If attack: suspend team budget
4. Review audit log: `GET /api/v1/audit?teamId=...`

### Runbook 5: Tenant Isolation Breach
1. CRITICAL: Stop platform immediately
2. Capture full audit log
3. Identify affected tenants from traceId
4. Review PolicyGateway logs
5. Root cause analysis before restart
