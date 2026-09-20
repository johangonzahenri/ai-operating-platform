import { ApiCredential } from "../../domain/security/api-credential.js";

export interface ApiCredentialFilter {
  readonly tenantId?: string | undefined;
  readonly principalId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly status?: "ACTIVE" | "EXPIRED" | "REVOKED" | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface ApiCredentialRepositoryPort {
  save(credential: ApiCredential): Promise<void>;
  findById(id: string): Promise<ApiCredential | null>;
  findByKeyHash(keyHash: string): Promise<ApiCredential | null>;
  findByKeyPrefix(keyPrefix: string): Promise<readonly ApiCredential[]>;
  findByTenantId(tenantId: string, filter?: ApiCredentialFilter): Promise<readonly ApiCredential[]>;
  findByPrincipalId(principalId: string, tenantId: string): Promise<readonly ApiCredential[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
