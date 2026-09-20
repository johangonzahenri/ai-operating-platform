import { ApiCredential } from "../../../domain/security/api-credential.js";
import {
  ApiCredentialRepositoryPort,
  ApiCredentialFilter,
} from "../../../application/ports/api-credential-repository-port.js";

export class InMemoryApiCredentialRepository implements ApiCredentialRepositoryPort {
  private readonly credentials = new Map<string, ApiCredential>();

  async save(credential: ApiCredential): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  async findById(id: string): Promise<ApiCredential | null> {
    return this.credentials.get(id) ?? null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiCredential | null> {
    const targetHash = keyHash.toLowerCase();
    for (const cred of this.credentials.values()) {
      if (cred.keyHash === targetHash) {
        return cred;
      }
    }
    return null;
  }

  async findByKeyPrefix(keyPrefix: string): Promise<readonly ApiCredential[]> {
    const results: ApiCredential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.keyPrefix === keyPrefix) {
        results.push(cred);
      }
    }
    return Object.freeze(results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }

  async findByTenantId(
    tenantId: string,
    filter?: ApiCredentialFilter
  ): Promise<readonly ApiCredential[]> {
    let results: ApiCredential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.tenantId !== tenantId) continue;
      if (filter?.status && cred.status !== filter.status) continue;
      if (filter?.principalId && cred.principalId !== filter.principalId) continue;
      if (filter?.applicationId && cred.applicationId !== filter.applicationId) continue;
      results.push(cred);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (typeof filter?.offset === "number" && filter.offset > 0) {
      results = results.slice(filter.offset);
    }
    if (typeof filter?.limit === "number" && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return Object.freeze(results);
  }

  async findByPrincipalId(
    principalId: string,
    tenantId: string
  ): Promise<readonly ApiCredential[]> {
    const results: ApiCredential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.principalId === principalId && cred.tenantId === tenantId) {
        results.push(cred);
      }
    }
    return Object.freeze(results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const cred = this.credentials.get(id);
    if (cred && cred.tenantId === tenantId) {
      return this.credentials.delete(id);
    }
    return false;
  }

  clear(): void {
    this.credentials.clear();
  }
}
