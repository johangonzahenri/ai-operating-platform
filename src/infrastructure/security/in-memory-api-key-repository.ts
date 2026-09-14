import { ApiKeyRecord } from "../../domain/security/authentication.js";

export interface ApiKeyRepository {
  findById(id: string): Promise<ApiKeyRecord | undefined>;
  save(record: ApiKeyRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private readonly storage = new Map<string, ApiKeyRecord>();

  constructor(initialKeys: readonly ApiKeyRecord[] = []) {
    this.bootstrapStandardKeys();
    for (const key of initialKeys) {
      this.storage.set(key.id, key);
    }
  }

  private bootstrapStandardKeys(): void {
    const standardKeys: ApiKeyRecord[] = [
      ApiKeyRecord.create({
        id: "key-tentaciones",
        principalId: "service-tentaciones",
        principalType: "SERVICE",
        keyHash: ApiKeyRecord.hashSecret("secret-tentaciones-live"),
        roles: ["service", "application"],
        tenantId: "tenant-tentaciones",
        metadata: {
          applicationId: "tentaciones-commerce",
          applicationName: "Tentaciones AI Commerce",
        },
      }),
      ApiKeyRecord.create({
        id: "key-operator",
        principalId: "operator-01",
        principalType: "HUMAN",
        keyHash: ApiKeyRecord.hashSecret("secret-operator-live"),
        roles: ["operator"],
        tenantId: "system",
        metadata: {
          name: "Default Platform Operator",
        },
      }),
    ];

    for (const key of standardKeys) {
      this.storage.set(key.id, key);
    }
  }

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
