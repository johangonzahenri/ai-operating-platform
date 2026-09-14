import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelCapability,
  ModelDefinition,
  ModelRequest,
  ModelResponse,
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelUnavailableError,
  ModelValidationError,
  ModelStructuredOutputError,
} from "../../src/domain/model/model-gateway.js";
import { ModelProviderAdapter } from "../../src/application/ports/model-provider-port.js";
import { DefaultModelRouter } from "../../src/application/model/default-model-router.js";
import { DefaultModelGateway } from "../../src/application/model/default-model-gateway.js";
import { ProviderFactory } from "../../src/infrastructure/model/provider-factory.js";
import { OpenAIModelGateway } from "../../src/infrastructure/model/openai/openai-model-gateway.js";
import { AnthropicModelGateway } from "../../src/infrastructure/model/anthropic/anthropic-model-gateway.js";
import { OllamaModelGateway } from "../../src/infrastructure/model/ollama/ollama-model-gateway.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { Role } from "../../src/domain/security/authorization.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";

// Mock Provider Adapter for testing transient failures and retries
class MockFlakyAdapter implements ModelProviderAdapter {
  readonly providerId = "flaky";
  attempts = 0;

  constructor(private readonly succeedAfterAttempts: number = 2) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.attempts++;
    if (this.attempts <= this.succeedAfterAttempts) {
      throw new ModelRateLimitError(this.providerId, "Simulated rate limit exceeded");
    }
    return {
      provider: this.providerId,
      model: request.model,
      content: "success after retry",
      output: { ok: true, attempts: this.attempts },
      metadata: { attempts: this.attempts },
    };
  }

  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    return [
      {
        id: "flaky-model",
        provider: this.providerId,
        name: "Flaky Model",
        capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
      },
    ];
  }

  async supports(_modelId: string, capability: ModelCapability): Promise<boolean> {
    return capability === "TEXT_GENERATION" || capability === "STRUCTURED_OUTPUT";
  }
}

// Mock failing adapter
class MockFailingAdapter implements ModelProviderAdapter {
  constructor(readonly providerId: string, private readonly error: Error) {}

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    throw this.error;
  }

  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    return [];
  }

  async supports(_modelId: string, _capability: ModelCapability): Promise<boolean> {
    return false;
  }
}

test("Model Domain Contract: validates model requests strictly", async () => {
  const router = new DefaultModelRouter();
  const factory = new ProviderFactory([new StubModelGateway()]);
  const gateway = new DefaultModelGateway({ router, providerFactory: factory });

  // Missing traceId
  await assert.rejects(
    async () => gateway.generate({ traceId: "", model: "stub-model", input: { a: 1 } }),
    ModelValidationError
  );

  // Missing model
  await assert.rejects(
    async () => gateway.generate({ traceId: "t1", model: " ", input: { a: 1 } }),
    ModelValidationError
  );

  // Empty input
  await assert.rejects(
    async () => gateway.generate({ traceId: "t1", model: "stub-model", input: {} }),
    ModelValidationError
  );
});

test("Model Capabilities: inspects and asserts model capabilities deterministically", async () => {
  const stub = new StubModelGateway();
  const router = new DefaultModelRouter();
  const factory = new ProviderFactory([stub]);
  const gateway = new DefaultModelGateway({ router, providerFactory: factory });

  assert.equal(await gateway.supports("stub-model", "TEXT_GENERATION"), true);
  assert.equal(await gateway.supports("stub-model", "STRUCTURED_OUTPUT"), true);
  assert.equal(await gateway.supports("stub-model", "VISION"), false);

  const models = await gateway.listModels();
  assert.ok(models.length >= 2);
  const found = await gateway.getModel("stub-model");
  assert.equal(found?.id, "stub-model");
  assert.equal(found?.provider, "stub");
});

test("Model Gateway: bounded retries succeed on transient rate limit", async () => {
  const flaky = new MockFlakyAdapter(2);
  const router = new DefaultModelRouter({ defaultProvider: "flaky" });
  const factory = new ProviderFactory([flaky, new StubModelGateway()]);
  const gateway = new DefaultModelGateway({
    router,
    providerFactory: factory,
    maxRetries: 3,
    retryBackoffMs: 5,
  });

  const response = await gateway.generate({
    traceId: "trace-flaky",
    model: "flaky-model",
    input: { query: "test retry" },
    metadata: { fallbackAllowed: false },
  });

  assert.equal(response.provider, "flaky");
  assert.equal(flaky.attempts, 3);
  assert.equal(response.output.ok, true);
});

test("Model Gateway: fails without retrying on non-transient authentication error", async () => {
  const authErr = new ModelAuthenticationError("mock-provider", "Bad credentials");
  const failing = new MockFailingAdapter("mock-auth", authErr);
  const router = new DefaultModelRouter({ defaultProvider: "mock-auth" });
  const factory = new ProviderFactory([failing]);
  const gateway = new DefaultModelGateway({
    router,
    providerFactory: factory,
    maxRetries: 3,
  });

  await assert.rejects(
    async () => gateway.generate({
      traceId: "t-auth",
      model: "any",
      input: { a: 1 },
      metadata: { fallbackAllowed: false },
    }),
    ModelAuthenticationError
  );
});

test("Model Gateway: executes allowed fallback when primary provider is unavailable", async () => {
  const unavailErr = new ModelUnavailableError("primary-failing", "Server is down");
  const failing = new MockFailingAdapter("primary-failing", unavailErr);
  const stub = new StubModelGateway();

  const router = new DefaultModelRouter({ defaultProvider: "primary-failing" });
  const factory = new ProviderFactory([failing, stub]);
  const gateway = new DefaultModelGateway({
    router,
    providerFactory: factory,
    maxRetries: 1,
    retryBackoffMs: 5,
  });

  const response = await gateway.generate({
    traceId: "t-fallback",
    model: "test-model",
    input: { action: "hello" },
    metadata: {
      fallbackAllowed: true,
      fallbackChain: ["stub"],
    },
  });

  assert.equal(response.provider, "stub");
  assert.equal(response.metadata?.fallbackApplied, true);
  assert.equal(response.metadata?.originalProvider, "primary-failing");
});

test("Model Gateway: generateStructured parses and validates schema safely", async () => {
  const router = new DefaultModelRouter();
  const factory = new ProviderFactory([new StubModelGateway()]);
  const gateway = new DefaultModelGateway({ router, providerFactory: factory });

  interface PlanOutput {
    readonly capability: string;
    readonly query: string;
  }

  const schema = {
    type: "object",
    required: ["capability", "query"],
  };

  const result = await gateway.generateStructured<PlanOutput>(
    {
      traceId: "trace-struct",
      model: "stub-model",
      input: {
        capability: "product.discovery",
        userMessage: "zapatos de fiesta",
      },
    },
    schema
  );

  assert.equal(result.output.capability, "product.discovery");
  assert.equal(result.output.query, "zapatos de fiesta");
  assert.ok(result.raw);
});

test("Model Gateway: generateStructured rejects output missing required schema properties", async () => {
  const router = new DefaultModelRouter();
  const factory = new ProviderFactory([new StubModelGateway()]);
  const gateway = new DefaultModelGateway({ router, providerFactory: factory });

  const invalidSchema = {
    type: "object",
    required: ["nonExistentField"],
  };

  await assert.rejects(
    async () => gateway.generateStructured(
      {
        traceId: "trace-struct-fail",
        model: "stub-model",
        input: { a: 1 },
      },
      invalidSchema
    ),
    ModelStructuredOutputError
  );
});

test("Model Gateway Security: enforcer blocks unauthorized model invocation", async () => {
  const roleRepo = new InMemoryRoleRepository();
  await roleRepo.saveRole(
    Role.create({
      id: "restricted-agent",
      name: "Restricted Agent Role",
      permissions: ["agent.read"], // Missing "model.invoke"
    })
  );
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);
  const enforcer = new SecurityBoundaryEnforcer(evaluator);

  const router = new DefaultModelRouter({ enforcer });
  const factory = new ProviderFactory([new StubModelGateway()]);
  const gateway = new DefaultModelGateway({ router, providerFactory: factory, enforcer });

  const principal = Principal.create({
    id: "agent-unauth",
    type: "AGENT",
    roles: ["restricted-agent"],
    permissions: ["agent.read"],
  });

  const unauthorizedContext = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "trace-sec",
    tenantId: "tenant-1",
  });

  await assert.rejects(
    async () => gateway.generate({
      traceId: "trace-sec",
      model: "stub-model",
      input: { prompt: "run task" },
      metadata: { securityContext: unauthorizedContext },
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("Security boundary rejected"));
      return true;
    }
  );
});

test("OpenAI Model Gateway: maps requests and responses without real network calls", async () => {
  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: "assistant", content: JSON.stringify({ sentiment: "positive" }) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const openAiGateway = new OpenAIModelGateway(
    {
      provider: "openai",
      defaultModel: "gpt-4o-mini",
      apiKey: "sk-mock-key-for-test",
    },
    mockFetch as unknown as typeof fetch
  );

  const response = await openAiGateway.generate({
    traceId: "trace-openai-test",
    model: "gpt-4o-mini",
    input: { text: "great platform" },
    requestedFormat: "json_object",
  });

  assert.equal(response.provider, "openai");
  assert.equal(response.model, "gpt-4o-mini");
  assert.equal(response.usage?.inputTokens, 12);
  assert.equal(response.usage?.outputTokens, 8);
  assert.equal(response.usage?.totalTokens, 20);
  assert.deepEqual(response.output, { sentiment: "positive" });
});

test("Anthropic Model Gateway: maps messages format cleanly", async () => {
  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "Hello from Claude" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 25, output_tokens: 10 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const anthropicGateway = new AnthropicModelGateway(
    {
      provider: "anthropic",
      defaultModel: "claude-3-5-haiku-latest",
      apiKey: "ant-mock-key-for-test",
    },
    mockFetch as unknown as typeof fetch
  );

  const response = await anthropicGateway.generate({
    traceId: "trace-anthropic-test",
    model: "claude-3-5-haiku-latest",
    input: { message: "hi" },
  });

  assert.equal(response.provider, "anthropic");
  assert.equal(response.content, "Hello from Claude");
  assert.equal(response.usage?.totalTokens, 35);
});

test("Ollama Model Gateway: handles local endpoint connection error gracefully", async () => {
  const mockFailingFetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  };

  const ollamaGateway = new OllamaModelGateway(
    {
      provider: "ollama",
      defaultModel: "llama3",
      baseUrl: "http://127.0.0.1:11434",
    },
    mockFailingFetch as unknown as typeof fetch
  );

  await assert.rejects(
    async () => ollamaGateway.generate({
      traceId: "trace-ollama-down",
      model: "llama3",
      input: { prompt: "test" },
    }),
    ModelUnavailableError
  );
});
