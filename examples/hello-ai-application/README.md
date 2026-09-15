# Hello AI Application Example

Minimal, clean reference implementation demonstrating how an external application integrates with the **AI Operating Platform** using the official `PlatformClient` SDK.

## Key Architectural Principles
- **No Core Internals Modified**: Operates exclusively via the platform HTTP contract and SDK.
- **Strict Domain Isolation**: Business data and engine reside within `src/engine.ts`.
- **Governed Capabilities**: Requests explicitly declared capabilities (`product.discovery`, `report.generate`).

## Structure
```text
hello-ai-application/
├── application.json
├── src/
│   ├── adapter.ts
│   ├── engine.ts
│   └── index.ts
├── tests/
│   └── hello-application.test.ts
└── README.md
```
