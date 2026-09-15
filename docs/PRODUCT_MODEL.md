# PRODUCT MODEL & APPLICATION ENTITLEMENT

## 1. Relación Plataforma vs Aplicaciones SaaS

```text
               AI OPERATING PLATFORM (SaaS Core)
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
 Tenant "Acme Corp"      Tenant "Fashion Co"     Tenant "Global Retail"
       │                       │                       │
  Plan: BUSINESS          Plan: PRO               Plan: ENTERPRISE
       │                       │                       │
 Applications:           Applications:           Applications:
  - Custom Agent Bot      - Tentaciones Commerce  - Supply Chain Diagnostics
```

---

## 2. Entitlement de Tentaciones AI Commerce

- **Tenant**: `tenant-tentaciones-commerce`
- **Plan Asignado**: `PRO`
- **Capacidades Habilitadas**:
  - `commerce.catalog`
  - `commerce.recommendation`
  - `ar.fitting`
  - `automation.webhooks`
- **Estado en Runtime**: `HEALTHY` (verificado vía Platform API).
