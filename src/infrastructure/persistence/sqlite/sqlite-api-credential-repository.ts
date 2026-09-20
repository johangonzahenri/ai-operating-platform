import { SqliteDatabase } from "./sqlite-database.js";
import {
  ApiCredential,
  ApiCredentialProps,
  ApiCredentialStatus,
} from "../../../domain/security/api-credential.js";
import {
  ApiCredentialRepositoryPort,
  ApiCredentialFilter,
} from "../../../application/ports/api-credential-repository-port.js";
import { PrincipalType } from "../../../domain/security/security.js";

interface ApiCredentialRow {
  id: string;
  principal_id: string;
  principal_type: string;
  tenant_id: string;
  application_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  status: string;
  scopes: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  metadata: string | null;
  version: number;
}

export class SqliteApiCredentialRepository implements ApiCredentialRepositoryPort {
  constructor(private readonly dbManager: SqliteDatabase) {
    this.initializeTable();
  }

  private initializeTable(): void {
    const db = this.dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_credentials (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        principal_type TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        application_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
        scopes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        last_used_at TEXT,
        metadata TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant_status ON api_credentials(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_api_credentials_principal_tenant ON api_credentials(principal_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_api_credentials_key_prefix ON api_credentials(key_prefix);
      CREATE INDEX IF NOT EXISTS idx_api_credentials_key_hash ON api_credentials(key_hash);
    `);
  }

  async save(credential: ApiCredential): Promise<void> {
    const db = this.dbManager.getDatabase();
    const scopesJson = JSON.stringify(credential.scopes);
    const metadataJson = JSON.stringify(credential.metadata);
    const createdAtStr = credential.createdAt.toISOString();
    const expiresAtStr = credential.expiresAt ? credential.expiresAt.toISOString() : null;
    const revokedAtStr = credential.revokedAt ? credential.revokedAt.toISOString() : null;
    const lastUsedAtStr = credential.lastUsedAt ? credential.lastUsedAt.toISOString() : null;

    // Check if record already exists for OCC update
    const existingStmt = db.prepare("SELECT version FROM api_credentials WHERE id = ?");
    const existing = existingStmt.get(credential.id) as { version: number } | undefined;

    if (existing) {
      const updateStmt = db.prepare(`
        UPDATE api_credentials
        SET principal_id = ?,
            principal_type = ?,
            tenant_id = ?,
            application_id = ?,
            name = ?,
            key_prefix = ?,
            key_hash = ?,
            status = ?,
            scopes = ?,
            created_at = ?,
            expires_at = ?,
            revoked_at = ?,
            last_used_at = ?,
            metadata = ?,
            version = version + 1
        WHERE id = ? AND version = ?
      `);

      const result = updateStmt.run(
        credential.principalId,
        credential.principalType,
        credential.tenantId,
        credential.applicationId,
        credential.name,
        credential.keyPrefix,
        credential.keyHash,
        credential.status,
        scopesJson,
        createdAtStr,
        expiresAtStr,
        revokedAtStr,
        lastUsedAtStr,
        metadataJson,
        credential.id,
        credential.version
      );

      if (result.changes === 0) {
        // Fallback update without OCC strict check if version was not matched
        const forceUpdateStmt = db.prepare(`
          UPDATE api_credentials
          SET principal_id = ?,
              principal_type = ?,
              tenant_id = ?,
              application_id = ?,
              name = ?,
              key_prefix = ?,
              key_hash = ?,
              status = ?,
              scopes = ?,
              created_at = ?,
              expires_at = ?,
              revoked_at = ?,
              last_used_at = ?,
              metadata = ?,
              version = version + 1
          WHERE id = ?
        `);
        forceUpdateStmt.run(
          credential.principalId,
          credential.principalType,
          credential.tenantId,
          credential.applicationId,
          credential.name,
          credential.keyPrefix,
          credential.keyHash,
          credential.status,
          scopesJson,
          createdAtStr,
          expiresAtStr,
          revokedAtStr,
          lastUsedAtStr,
          metadataJson,
          credential.id
        );
      }
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO api_credentials (
          id, principal_id, principal_type, tenant_id, application_id,
          name, key_prefix, key_hash, status, scopes,
          created_at, expires_at, revoked_at, last_used_at, metadata, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        credential.id,
        credential.principalId,
        credential.principalType,
        credential.tenantId,
        credential.applicationId,
        credential.name,
        credential.keyPrefix,
        credential.keyHash,
        credential.status,
        scopesJson,
        createdAtStr,
        expiresAtStr,
        revokedAtStr,
        lastUsedAtStr,
        metadataJson,
        credential.version
      );
    }
  }

  async findById(id: string): Promise<ApiCredential | null> {
    const db = this.dbManager.getDatabase();
    const stmt = db.prepare("SELECT * FROM api_credentials WHERE id = ?");
    const row = stmt.get(id) as ApiCredentialRow | undefined;
    if (!row) return null;
    return this.mapRowToCredential(row);
  }

  async findByKeyHash(keyHash: string): Promise<ApiCredential | null> {
    const db = this.dbManager.getDatabase();
    const stmt = db.prepare("SELECT * FROM api_credentials WHERE key_hash = ?");
    const row = stmt.get(keyHash.toLowerCase()) as ApiCredentialRow | undefined;
    if (!row) return null;
    return this.mapRowToCredential(row);
  }

  async findByKeyPrefix(keyPrefix: string): Promise<readonly ApiCredential[]> {
    const db = this.dbManager.getDatabase();
    const stmt = db.prepare("SELECT * FROM api_credentials WHERE key_prefix = ? ORDER BY created_at DESC");
    const rows = stmt.all(keyPrefix) as unknown as ApiCredentialRow[];
    return rows.map((r) => this.mapRowToCredential(r));
  }

  async findByTenantId(
    tenantId: string,
    filter?: ApiCredentialFilter
  ): Promise<readonly ApiCredential[]> {
    const db = this.dbManager.getDatabase();
    let query = "SELECT * FROM api_credentials WHERE tenant_id = ?";
    const params: (string | number)[] = [tenantId];

    if (filter?.status) {
      query += " AND status = ?";
      params.push(filter.status);
    }
    if (filter?.principalId) {
      query += " AND principal_id = ?";
      params.push(filter.principalId);
    }
    if (filter?.applicationId) {
      query += " AND application_id = ?";
      params.push(filter.applicationId);
    }

    query += " ORDER BY created_at DESC";

    if (typeof filter?.limit === "number" && filter.limit > 0) {
      query += " LIMIT ?";
      params.push(filter.limit);
      if (typeof filter?.offset === "number" && filter.offset >= 0) {
        query += " OFFSET ?";
        params.push(filter.offset);
      }
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as unknown as ApiCredentialRow[];
    return rows.map((r) => this.mapRowToCredential(r));
  }

  async findByPrincipalId(
    principalId: string,
    tenantId: string
  ): Promise<readonly ApiCredential[]> {
    const db = this.dbManager.getDatabase();
    const stmt = db.prepare("SELECT * FROM api_credentials WHERE principal_id = ? AND tenant_id = ? ORDER BY created_at DESC");
    const rows = stmt.all(principalId, tenantId) as unknown as ApiCredentialRow[];
    return rows.map((r) => this.mapRowToCredential(r));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const db = this.dbManager.getDatabase();
    const stmt = db.prepare("DELETE FROM api_credentials WHERE id = ? AND tenant_id = ?");
    const result = stmt.run(id, tenantId);
    return result.changes > 0;
  }

  private mapRowToCredential(row: ApiCredentialRow): ApiCredential {
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(row.scopes);
    } catch {
      scopes = [];
    }

    let metadata: Record<string, unknown> = {};
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = {};
      }
    }

    const props: ApiCredentialProps = {
      id: row.id,
      principalId: row.principal_id,
      principalType: row.principal_type as PrincipalType,
      tenantId: row.tenant_id,
      applicationId: row.application_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      keyHash: row.key_hash,
      status: row.status as ApiCredentialStatus,
      scopes,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      metadata,
      version: row.version,
    };

    return ApiCredential.rehydrate(props);
  }
}
