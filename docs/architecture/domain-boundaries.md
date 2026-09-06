# Domain boundaries

`src/domain` contains the stable language of the platform: Task transitions, agent definitions, model/tool/memory/workflow ports, events and policy ports. It may only use platform language features.

`src/application` coordinates ports and domain objects in use cases. v0.1 implements `ExecuteTask`; it is not yet a separate Agent Runtime component. `src/infrastructure` supplies in-memory, stub and logging adapters. `src/interfaces` is the composition root now and will host API/CLI adapters later. This separation permits an HTTP interface, durable event bus, database or real model provider to be introduced without changing the Task domain.
