export type EnvironmentMode = "development" | "test" | "staging" | "production";

export interface PlatformConfig {
  readonly nodeEnv: EnvironmentMode;
  readonly port: number;
  readonly host: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly modelProvider: string;
  readonly modelName: string;
  readonly persistenceDriver: "sqlite" | "memory";
  readonly sqliteDbPath: string;
  readonly shutdownTimeoutMs: number;
  readonly maxPayloadSizeBytes: number;
  readonly rateLimitMaxRequests: number;
  readonly rateLimitWindowMs: number;
  readonly trustProxy: boolean;
  readonly trustedProxyIps: readonly string[];
  readonly corsOrigins: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly publicBaseUrl?: string | undefined;
  readonly requestTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly keepAliveTimeoutMs: number;

  // Production Identity & OIDC / JWKS Configuration
  readonly oidcEnabled: boolean;
  readonly oidcIssuer?: string | undefined;
  readonly oidcAudience?: string | undefined;
  readonly oidcJwksUri?: string | undefined;
  readonly oidcAllowedAlgorithms: readonly ("RS256" | "ES256" | "HS256")[];
  readonly oidcClockToleranceSec: number;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`[ConfigurationError] ${message}`);
    this.name = "ConfigurationError";
  }
}

export const validateEnvironment = (env: NodeJS.ProcessEnv = process.env): PlatformConfig => {
  const rawEnv = (env.NODE_ENV ?? "development").toLowerCase();
  const validEnvs: EnvironmentMode[] = ["development", "test", "staging", "production"];
  
  if (!validEnvs.includes(rawEnv as EnvironmentMode)) {
    throw new ConfigurationError(`Invalid NODE_ENV "${rawEnv}". Must be one of: ${validEnvs.join(", ")}`);
  }
  const nodeEnv = rawEnv as EnvironmentMode;

  const rawPort = env.PORT ?? "3000";
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ConfigurationError(`Invalid PORT "${rawPort}". Must be a valid TCP port (1-65535).`);
  }

  const host = env.HOST ?? "127.0.0.1";
  if (nodeEnv === "production" && host === "0.0.0.0" && !env.ALLOW_PUBLIC_BINDING) {
    // In production, enforce explicit binding declaration
    throw new ConfigurationError("Binding to 0.0.0.0 in production requires explicit ALLOW_PUBLIC_BINDING=true");
  }

  const rawLogLevel = (env.LOG_LEVEL ?? "info").toLowerCase();
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(rawLogLevel)) {
    throw new ConfigurationError(`Invalid LOG_LEVEL "${rawLogLevel}". Must be one of: ${validLogLevels.join(", ")}`);
  }
  const logLevel = rawLogLevel as "debug" | "info" | "warn" | "error";

  const rawPersistence = (env.PERSISTENCE_DRIVER ?? "sqlite").toLowerCase();
  if (rawPersistence !== "sqlite" && rawPersistence !== "memory") {
    throw new ConfigurationError(`Invalid PERSISTENCE_DRIVER "${rawPersistence}". Must be "sqlite" or "memory".`);
  }
  const persistenceDriver = rawPersistence as "sqlite" | "memory";

  const sqliteDbPath = env.SQLITE_DB_PATH ?? "data/app.db";
  const shutdownTimeoutMs = parseInt(env.SHUTDOWN_TIMEOUT_MS ?? "10000", 10);
  const maxPayloadSizeBytes = parseInt(env.MAX_PAYLOAD_SIZE_BYTES ?? "1048576", 10); // 1MB default
  const rateLimitMaxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS ?? "100", 10);
  const rateLimitWindowMs = parseInt(env.RATE_LIMIT_WINDOW_MS ?? "60000", 10); // 1 minute default

  // Network & Reverse Proxy Configuration
  const trustProxy = env.TRUST_PROXY === "true" || env.TRUST_PROXY === "1";
  const trustedProxyIps = Object.freeze(
    (env.TRUSTED_PROXY_IPS ?? "127.0.0.1,::1")
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)
  );

  const corsOrigins = Object.freeze(
    (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  );

  const allowedHosts = Object.freeze(
    (env.ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
  );

  const publicBaseUrl = env.PUBLIC_BASE_URL?.trim() || undefined;
  const requestTimeoutMs = parseInt(env.TIMEOUT_REQUEST_MS ?? "30000", 10);
  const headersTimeoutMs = parseInt(env.TIMEOUT_HEADERS_MS ?? "15000", 10);
  const keepAliveTimeoutMs = parseInt(env.TIMEOUT_KEEP_ALIVE_MS ?? "5000", 10);

  // OIDC / Identity Provider Configuration
  const oidcEnabled = env.OIDC_ENABLED === "true" || env.OIDC_ENABLED === "1";
  const oidcIssuer = env.OIDC_ISSUER?.trim() || undefined;
  const oidcAudience = env.OIDC_AUDIENCE?.trim() || undefined;
  const oidcJwksUri = env.OIDC_JWKS_URI?.trim() || undefined;
  const oidcClockToleranceSec = parseInt(env.OIDC_CLOCK_TOLERANCE_SEC ?? "60", 10);

  const rawAlgorithms = (env.OIDC_ALLOWED_ALGORITHMS ?? "RS256,ES256")
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a.length > 0);
  
  for (const alg of rawAlgorithms) {
    if (!["RS256", "ES256", "HS256"].includes(alg)) {
      throw new ConfigurationError(`Invalid OIDC algorithm "${alg}". Allowed: RS256, ES256, HS256`);
    }
  }
  const oidcAllowedAlgorithms = Object.freeze(
    rawAlgorithms as ("RS256" | "ES256" | "HS256")[]
  );

  // Production Deterministic Security Validation (Fail-Closed)
  if (oidcEnabled) {
    if (!oidcIssuer) {
      throw new ConfigurationError("OIDC is enabled (OIDC_ENABLED=true) but OIDC_ISSUER is missing or empty.");
    }
    if (!oidcJwksUri) {
      throw new ConfigurationError("OIDC is enabled (OIDC_ENABLED=true) but OIDC_JWKS_URI is missing or empty.");
    }
    try {
      const parsedIssuer = new URL(oidcIssuer);
      if (nodeEnv === "production" && parsedIssuer.protocol !== "https:") {
        throw new ConfigurationError(`OIDC_ISSUER in production must use https:// protocol, got: ${oidcIssuer}`);
      }
    } catch (e: any) {
      if (e instanceof ConfigurationError) throw e;
      throw new ConfigurationError(`OIDC_ISSUER must be a valid URL: ${oidcIssuer}`);
    }

    try {
      const parsedJwks = new URL(oidcJwksUri);
      if (nodeEnv === "production" && parsedJwks.protocol !== "https:") {
        throw new ConfigurationError(`OIDC_JWKS_URI in production must use https:// protocol, got: ${oidcJwksUri}`);
      }
    } catch (e: any) {
      if (e instanceof ConfigurationError) throw e;
      throw new ConfigurationError(`OIDC_JWKS_URI must be a valid URL: ${oidcJwksUri}`);
    }
  }

  return Object.freeze({
    nodeEnv,
    port,
    host,
    logLevel,
    modelProvider: env.MODEL_PROVIDER ?? "stub",
    modelName: env.MODEL_NAME ?? "deterministic-stub",
    persistenceDriver,
    sqliteDbPath,
    shutdownTimeoutMs,
    maxPayloadSizeBytes,
    rateLimitMaxRequests,
    rateLimitWindowMs,
    trustProxy,
    trustedProxyIps,
    corsOrigins,
    allowedHosts,
    publicBaseUrl,
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs,
    oidcEnabled,
    oidcIssuer,
    oidcAudience,
    oidcJwksUri,
    oidcAllowedAlgorithms,
    oidcClockToleranceSec,
  });
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): PlatformConfig => {
  return validateEnvironment(env);
};
