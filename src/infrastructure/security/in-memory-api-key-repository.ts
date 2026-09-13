import { ApiKeyRecord } from "../../domain/security/authentication.js";

export interface ApiKeyRepository {
  findById(id: string): Promise<ApiKeyRecord | undefined>;
  save(record: ApiKeyRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private readonly storage = new Map<string, ApiKeyRecord>();

  async findById(id: string): Promise<ApiKeyRecord | undefined> {
    return this.storage.get(id);
  }

  async save(record: ApiKeyRecord): Promise<void> {
    this.storage.set(record.id, record);
  }

  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  clear(): void {
    this.storage.clear();
  }
}
