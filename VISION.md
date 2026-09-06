# Vision

AI Operating Platform is infrastructure for operating AI systems, rather than a chatbot or a provider wrapper. In v0.3 its implemented flow is **Task → Core Runtime → Execution Strategy → Model Gateway or Tool Gateway → Result**, with events and observability spanning every execution. Models and tools are explicit capabilities; orchestration remains a future architectural boundary.

The architecture is designed so that model providers, tools, storage and interfaces are replaceable adapters. Correlated audit/metrics make execution observable, while policy decisions govern declared operations without coupling to providers. The Core Engine will be exposed through a future Platform API to a Web Platform and independent applications such as AI Commerce; neither becomes part of the engine. Future support for multi-agent delegation must extend contracts instead of rewriting existing domains.
