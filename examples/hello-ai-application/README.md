# Hello AI Application Example

Minimal, clean reference implementation demonstrating how an external application integrates with the **AI Operating Platform** using the official `PlatformClient` SDK and governed API credentials.

## Key Architectural Principles
- **No Core Internals Modified**: Operates exclusively via the platform HTTP contract and SDK.
- **Strict Domain Isolation**: Business data and engine reside within `src/engine.ts`.
- **Enterprise Authentication & Scopes**: External consumers authenticate via `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`, strictly bound to verified `Principal`, `tenantId`, `applicationId`, and capability scopes (`tasks.read`, `tasks.create`, `executions.read`).
- **Governed Capabilities**: Requests explicitly declared capabilities (`product.discovery`, `report.generate`).

## Configuration
Copy `.env.example` to `.env` and set your credentials:
```bash
cp .env.example .env
```

```env
AOP_BASE_URL=http://localhost:3000
AOP_API_KEY=aop_live_cred_sample01_...
AOP_TENANT_ID=tenant-demo
AOP_APPLICATION_ID=hello-ai-app
```

## Structure
```text
hello-ai-application/
├── .env.example
├── application.json
├── src/
│   ├── adapter.ts
│   ├── engine.ts
│   └── index.ts
├── tests/
│   └── hello-application.test.ts
└── README.md
```
