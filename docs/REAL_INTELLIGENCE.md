# Real Intelligence

The platform can run the same Core lifecycle with a real model without
changing the Planner, Coordinator, Agent Runtime, or application adapters.
The default remains the deterministic stub so existing unit, integration, and
cross-project tests do not require Internet access or API keys.

When `MODEL_PROVIDER` is not `stub`, the composition root wires
`LLMPlanner -> ModelGateway -> ProviderFactory -> selected provider`. Plans
remain structured and fail closed: the existing validator and policy gateway
run after model generation and before execution.

Tentaciones continues to call only the Platform API. It receives structured
discovery results and never receives model credentials or provider-specific
configuration. Product ownership remains local to Tentaciones.
