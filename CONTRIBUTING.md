# Contributing to AI Operating Platform

Thank you for your interest in contributing to the **AI Operating Platform**.

## Code of Conduct & Architectural Invariants
All contributions must strictly uphold the system's core invariants:
1. **Separation of Concerns:** `CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS`.
2. **Hexagonal Purity:** Domain entities and ports must have zero imports from infrastructure, HTTP, express, or external application packages.
3. **Default-Deny Security:** Any new tool, capability, or endpoint must be secured by default.
4. **DOM Security:** Web Console frontend code must never use `innerHTML`, `outerHTML`, `eval()`, or `document.write()`.
5. **Truth First:** No false claims in documentation or console badges.

## Development Workflow
1. Fork and clone the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Ensure TypeScript builds cleanly: `npm run build`.
4. Run all unit and integration tests: `npm test`.
5. Commit using conventional commit format (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
6. Submit a Pull Request with a clear description and verification evidence.
