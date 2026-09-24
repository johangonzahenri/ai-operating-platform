export interface ReferenceConsumerConfig {
  readonly baseUrl: string;
  readonly apiKey?: string | undefined;
  readonly bearerToken?: string | undefined;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly timeoutMs: number;
  readonly autoReconnect: boolean;
  readonly maxBufferEvents: number;
}

export function loadReferenceConsumerConfig(
  overrides?: Partial<ReferenceConsumerConfig>
): ReferenceConsumerConfig {
  const env = typeof process !== "undefined" ? process.env : {};

  return {
    baseUrl: overrides?.baseUrl ?? env.PLATFORM_API_BASE_URL ?? "http://127.0.0.1:3000",
    apiKey: overrides?.apiKey ?? env.PLATFORM_API_KEY,
    bearerToken: overrides?.bearerToken ?? env.PLATFORM_BEARER_TOKEN,
    tenantId: overrides?.tenantId ?? env.PLATFORM_TENANT_ID ?? "tenant-reference-corp",
    applicationId: overrides?.applicationId ?? env.PLATFORM_APPLICATION_ID ?? "reference-consumer",
    timeoutMs: overrides?.timeoutMs ?? (env.PLATFORM_TIMEOUT_MS ? parseInt(env.PLATFORM_TIMEOUT_MS, 10) : 10000),
    autoReconnect: overrides?.autoReconnect ?? true,
    maxBufferEvents: overrides?.maxBufferEvents ?? 100,
  };
}
