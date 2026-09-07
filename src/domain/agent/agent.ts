export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentValidationError";
  }
}

export class AgentNotFoundError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent not found: '${agentId}'`);
    this.name = "AgentNotFoundError";
  }
}

export class AgentInactiveError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent is inactive: '${agentId}'`);
    this.name = "AgentInactiveError";
  }
}

export class AgentAlreadyExistsError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent already exists: '${agentId}'`);
    this.name = "AgentAlreadyExistsError";
  }
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function validateAgentId(id: unknown): string {
  if (typeof id !== "string") {
    throw new AgentValidationError("Agent id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new AgentValidationError("Agent id must be alphanumeric, dashes or underscores (1-128 chars)");
  }
  return trimmed;
}

export type AgentStatus = "ACTIVE" | "INACTIVE";

export interface AgentProps {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
  readonly status?: AgentStatus | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface UpdateAgentProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export class Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly instructions: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly status: AgentStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    id: string;
    name: string;
    description: string;
    model: string;
    instructions: string;
    tools: readonly string[];
    memoryScope?: string | undefined;
    status: AgentStatus;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.model = props.model;
    this.instructions = props.instructions;
    this.tools = props.tools;
    this.memoryScope = props.memoryScope;
    this.status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: AgentProps, now: Date = new Date()): Agent {
    const id = validateAgentId(props.id);
    const name = props.name?.trim();
    if (!name) {
      throw new AgentValidationError("Agent name cannot be empty");
    }
    const model = props.model?.trim();
    if (!model) {
      throw new AgentValidationError("Agent model cannot be empty");
    }
    const description = (props.description ?? "").trim();
    const instructions = (props.instructions ?? "").trim();
    const tools = Array.isArray(props.tools)
      ? Object.freeze([...new Set(props.tools.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean))])
      : Object.freeze([]);
    const memoryScope = props.memoryScope?.trim() || `agent-${id}`;
    const status: AgentStatus = props.status ?? "ACTIVE";
    const version = typeof props.version === "number" && props.version >= 1 ? props.version : 1;
    const createdAt = props.createdAt ?? now;
    const updatedAt = props.updatedAt ?? now;

    return new Agent({
      id,
      name,
      description,
      model,
      instructions,
      tools,
      memoryScope,
      status,
      version,
      createdAt,
      updatedAt,
    });
  }

  update(patch: UpdateAgentProps, now: Date = new Date()): Agent {
    const name = patch.name !== undefined ? patch.name.trim() : this.name;
    if (!name) {
      throw new AgentValidationError("Agent name cannot be empty");
    }
    const model = patch.model !== undefined ? patch.model.trim() : this.model;
    if (!model) {
      throw new AgentValidationError("Agent model cannot be empty");
    }
    const description = patch.description !== undefined ? patch.description.trim() : this.description;
    const instructions = patch.instructions !== undefined ? patch.instructions.trim() : this.instructions;
    const tools = patch.tools !== undefined
      ? Object.freeze([...new Set(patch.tools.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean))])
      : this.tools;
    const memoryScope = patch.memoryScope !== undefined
      ? (patch.memoryScope.trim() || `agent-${this.id}`)
      : this.memoryScope;

    return new Agent({
      id: this.id,
      name,
      description,
      model,
      instructions,
      tools,
      memoryScope,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  activate(now: Date = new Date()): Agent {
    if (this.status === "ACTIVE") return this;
    return new Agent({
      id: this.id,
      name: this.name,
      description: this.description,
      model: this.model,
      instructions: this.instructions,
      tools: this.tools,
      memoryScope: this.memoryScope,
      status: "ACTIVE",
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  deactivate(now: Date = new Date()): Agent {
    if (this.status === "INACTIVE") return this;
    return new Agent({
      id: this.id,
      name: this.name,
      description: this.description,
      model: this.model,
      instructions: this.instructions,
      tools: this.tools,
      memoryScope: this.memoryScope,
      status: "INACTIVE",
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  toDefinition(): AgentDefinition {
    return Object.freeze({
      id: this.id,
      name: this.name,
      capabilities: Object.freeze(["reasoning", ...this.tools]),
      model: this.model,
      instructions: this.instructions,
      tools: this.tools,
      memoryScope: this.memoryScope,
    });
  }
}
