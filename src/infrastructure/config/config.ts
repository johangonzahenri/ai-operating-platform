export interface PlatformConfig { readonly logLevel: string; readonly modelProvider: string; readonly modelName: string; }
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): PlatformConfig => ({
  logLevel: env.LOG_LEVEL ?? "info", modelProvider: env.MODEL_PROVIDER ?? "stub", modelName: env.MODEL_NAME ?? "deterministic-stub",
});
