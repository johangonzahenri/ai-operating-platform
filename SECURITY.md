# Security Policy — AI Operating Platform

## Security Model
The AI Operating Platform implements a multi-layered defense-in-depth architecture:
- **Principal & Tenant Isolation:** Every request is authenticated and bound to an immutable `SecurityContext` with verified `Principal` and `tenantId`.
- **Default-Deny Access Control:** Unregistered capabilities or operations fail-closed with 401 Unauthorized or 403 Forbidden.
- **Tool Execution Governance:** Tools require explicit permissions, schema validation, prototype pollution protection, and approval tokens for critical operations.
- **DOM Purity:** Web Console surfaces employ pure DOM manipulation with zero usage of `innerHTML`, `outerHTML`, or `eval()`.

## Reporting Security Vulnerabilities
If you discover a potential security vulnerability, please report it privately to the maintainers rather than opening a public issue.
