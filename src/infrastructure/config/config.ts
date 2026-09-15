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
  });
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): PlatformConfig => {
  return validateEnvironment(env);
};
