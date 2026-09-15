# Developer Guide — AI Operating Platform

## Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

## Repository Structure
```text
├── src/
│   ├── domain/               # Pure domain entities, value objects, ports
│   ├── application/          # Use cases, runtime, orchestrators, adapters
│   ├── infrastructure/       # SQLite persistence, model gateways, tool registry
│   ├── platform/             # Platform API v1, HTTP router, Web Console
│   ├── platform-client/      # Typed TypeScript SDK client
│   └── interfaces/           # Composition root and wiring
├── docs/                     # Official manual, ADRs, portfolio, case studies
├── tests/                    # Unit, contract, durability, and E2E test suites
└── scripts/                  # Build and documentation helper scripts
```

## Verification Commands
```bash
npm run build   # TypeScript compilation
npm test        # Full test suite execution
npm run check   # Build + test verification
npm start       # Start HTTP server on 127.0.0.1:3000
```
