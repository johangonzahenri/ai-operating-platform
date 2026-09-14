import {
  Tool,
  ToolDefinition,
  ToolDefinitionError,
  ToolNotFoundError,
  ToolVersionNotFoundError,
  ToolRegistry,
  ToolValidationError,
  ToolInputValidationError,
  ToolDiscoveryOptions,
  ToolRiskLevel,
  ToolExecutionMode,
  MAX_TOOL_TIMEOUT_MS,
} from "../../domain/tools/tool-registry.js";

const DEFAULT_TOOL_VERSION = "1.0.0";
const VALID_RISKS: readonly ToolRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_EXECUTION_MODES: readonly ToolExecutionMode[] = [
  "READ_ONLY",
  "IDEMPOTENT",
  "SIDE_EFFECTING",
  "DESTRUCTIVE",
];

export class InMemoryToolRegistry implements ToolRegistry {
  // Key format: `${toolId}@${version}`
  private readonly versionedTools = new Map<string, Tool>();
  // Index of latest registered tool per ID for unversioned fallback
  private readonly defaultTools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.validateDefinition(tool.definition);

    const id = tool.definition.id.trim();
    const version = tool.definition.version?.trim() || DEFAULT_TOOL_VERSION;
    const key = `${id}@${version}`;

    if (this.versionedTools.has(key)) {
      throw new ToolDefinitionError(`Duplicate tool registration for '${key}'`);
    }

    // Freeze tool definition to prevent runtime mutation
    const frozenDefinition = Object.freeze({
      ...tool.definition,
      id,
      version,
      name: tool.definition.name.trim(),
      description: tool.definition.description.trim(),
      permissions: Object.freeze([...(tool.definition.permissions ?? [])]),
      riskLevel: tool.definition.riskLevel ?? "LOW",
      executionMode: tool.definition.executionMode ?? "READ_ONLY",
      timeoutMs: tool.definition.timeoutMs ?? 30000,
      requiresApproval: Boolean(tool.definition.requiresApproval),
      metadata: tool.definition.metadata ? Object.freeze({ ...tool.definition.metadata }) : undefined,
    });

    const registeredTool: Tool = {
      definition: frozenDefinition,
      execute: tool.execute.bind(tool),
    };

    this.versionedTools.set(key, registeredTool);
    // Keep the most recently registered tool as default for unversioned lookups
    this.defaultTools.set(id, registeredTool);
  }

  unregister(id: string, version?: string): boolean {
    const trimmedId = id.trim();
    if (version) {
      const key = `${trimmedId}@${version.trim()}`;
      const deleted = this.versionedTools.delete(key);
      // Recompute default tool if deleted was default
      if (this.defaultTools.get(trimmedId)?.definition.version === version.trim()) {
        const remaining = [...this.versionedTools.values()].filter((t) => t.definition.id === trimmedId);
        if (remaining.length > 0 && remaining[remaining.length - 1]) {
          this.defaultTools.set(trimmedId, remaining[remaining.length - 1]!);
        } else {
          this.defaultTools.delete(trimmedId);
        }
      }
      return deleted;
    }

    // Unregister all versions of this tool ID
    let deletedAny = false;
    for (const [key, tool] of this.versionedTools.entries()) {
      if (tool.definition.id === trimmedId) {
        this.versionedTools.delete(key);
        deletedAny = true;
      }
    }
    this.defaultTools.delete(trimmedId);
    return deletedAny;
  }

  find(id: string, version?: string): Tool | undefined {
    const trimmedId = id.trim();
    if (version) {
      return this.versionedTools.get(`${trimmedId}@${version.trim()}`);
    }
    return this.defaultTools.get(trimmedId);
  }

  get(id: string, version?: string): Tool {
    const trimmedId = id.trim();
    if (version) {
      const tool = this.versionedTools.get(`${trimmedId}@${version.trim()}`);
      if (!tool) {
        throw new ToolVersionNotFoundError(trimmedId, version.trim());
      }
      return tool;
    }
    const tool = this.defaultTools.get(trimmedId);
    if (!tool) {
      throw new ToolNotFoundError(trimmedId);
    }
    return tool;
  }

  findById(id: string, version?: string): ToolDefinition | undefined {
    return this.find(id, version)?.definition;
  }

  list(): readonly ToolDefinition[] {
    return Object.freeze([...this.versionedTools.values()].map((tool) => tool.definition));
  }

  listVersions(id: string): readonly string[] {
    const trimmedId = id.trim();
    const versions: string[] = [];
    for (const tool of this.versionedTools.values()) {
      if (tool.definition.id === trimmedId && tool.definition.version) {
        versions.push(tool.definition.version);
      }
    }
    return Object.freeze(versions);
  }

  validate(id: string, input: Readonly<Record<string, unknown>>, version?: string): boolean {
    const tool = this.get(id, version);
    if (input === null || typeof input !== "object") {
      throw new ToolInputValidationError(id, "Tool input must be a non-null object");
    }

    const { required, properties, additionalProperties } = tool.definition.inputSchema;
    
    // Check required properties
    for (const key of required) {
      if (!(key in input) || input[key] === undefined) {
        throw new ToolInputValidationError(id, `Missing required input property: ${key}`);
      }
    }

    // Check types
    for (const [key, propType] of Object.entries(properties)) {
      if (key in input && input[key] !== undefined) {
        const val = input[key];
        if (typeof propType === "string") {
          if (propType === "array") {
            if (!Array.isArray(val)) {
              throw new ToolInputValidationError(id, `Input property '${key}' must be of type 'array'`);
            }
          } else if (propType === "object") {
            if (val === null || typeof val !== "object" || Array.isArray(val)) {
              throw new ToolInputValidationError(id, `Input property '${key}' must be of type 'object'`);
            }
          } else if (typeof val !== propType) {
            throw new ToolInputValidationError(id, `Input property '${key}' must be of type '${propType}'`);
          }
        }
      }
    }

    // Check additional properties if disallowed (default: disallowed)
    if (additionalProperties === false || additionalProperties === undefined) {
      for (const key of Object.keys(input)) {
        if (!(key in properties)) {
          throw new ToolInputValidationError(id, `Additional input property '${key}' is not permitted`);
        }
      }
    }

    return true;
  }

  authorize(toolId: string, permissions: readonly string[]): boolean {
    const tool = this.find(toolId);
    if (!tool) {
      return false;
    }
    const toolPermissions = tool.definition.permissions ?? [];
    if (toolPermissions.length === 0) {
      return true; // No special permissions required
    }
    const granted = new Set(permissions);
    if (granted.has("*")) {
      return true;
    }
    return toolPermissions.every((p) => granted.has(p));
  }

  /**
   * Safe discovery: returns public schema metadata filtered from internal properties and secrets.
   */
  discoverSafeDefinitions(options?: ToolDiscoveryOptions): readonly ToolDefinition[] {
    const tools = this.list();
    const result: ToolDefinition[] = [];

    for (const tool of tools) {
      // Filter if securityContext provided and tool requires permissions
      if (options?.securityContext) {
        const grantedPerms = options.securityContext.principal.permissions ?? [];
        if (!this.authorize(tool.id, grantedPerms)) {
          continue;
        }
      }

      // Safe projected definition with zero credentials/executors
      result.push(
        Object.freeze({
          id: tool.id,
          name: tool.name,
          version: tool.version,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          permissions: tool.permissions,
          riskLevel: tool.riskLevel,
          executionMode: tool.executionMode,
          timeoutMs: tool.timeoutMs,
          requiresApproval: tool.requiresApproval,
          metadata: tool.metadata,
        })
      );
    }

    return Object.freeze(result);
  }

  private validateDefinition(definition: ToolDefinition): void {
    if (typeof definition?.id !== "string" || definition.id.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires an id");
    }
    if (typeof definition.name !== "string" || definition.name.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires a name");
    }
    if (typeof definition.description !== "string" || definition.description.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires a description");
    }
    if (
      !definition.inputSchema ||
      !Array.isArray(definition.inputSchema.required) ||
      typeof definition.inputSchema.properties !== "object"
    ) {
      throw new ToolDefinitionError("Tool definition requires an input schema");
    }
    if (definition.riskLevel !== undefined) {
      if (!VALID_RISKS.includes(definition.riskLevel)) {
        throw new ToolDefinitionError(`Invalid riskLevel: ${definition.riskLevel}`);
      }
    }
    if (definition.executionMode !== undefined) {
      if (!VALID_EXECUTION_MODES.includes(definition.executionMode)) {
        throw new ToolDefinitionError(`Invalid executionMode: ${definition.executionMode}`);
      }
    }
    if (definition.timeoutMs !== undefined) {
      if (
        typeof definition.timeoutMs !== "number" ||
        !Number.isInteger(definition.timeoutMs) ||
        definition.timeoutMs <= 0 ||
        definition.timeoutMs > MAX_TOOL_TIMEOUT_MS
      ) {
        throw new ToolDefinitionError(
          `timeoutMs must be a positive integer <= ${MAX_TOOL_TIMEOUT_MS}ms when provided`
        );
      }
    }
  }
}
