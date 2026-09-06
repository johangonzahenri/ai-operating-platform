# Domain boundaries

`src/domain` contains the stable language of the platform: Task and Execution transitions, execution context, agent definitions, model/tool/memory/workflow ports, events and policy ports. It may only use platform language features.

`src/application` coordinates ports and domain objects in use cases. v0.2 implements `CoreRuntime`, which owns execution lifecycle, while `ModelExecutionStrategy` applies the Model Gateway capability. v0.3 adds `RegistryToolGateway`, which validates and invokes a registry-resolved Tool adapter without adding tool internals to the runtime. `ExecuteTask` remains a thin compatibility use case. `src/infrastructure` supplies in-memory, stub and logging adapters. `src/interfaces` is the composition root now and will host API/CLI adapters later. This separation permits an HTTP interface, durable event bus, database or real model provider to be introduced without changing the domain.
