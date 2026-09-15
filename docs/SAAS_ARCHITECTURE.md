# SAAS PRODUCTIZATION ARCHITECTURE

## 1. Visión General del Modelo SaaS

La AI Operating Platform v1.1.0-rc.2 introduce el modelo de plataforma como servicio (SaaS) multi-inquilino con aislamiento estricto de datos, planes, cuotas de consumo y feature flags por tenant.

$$\text{Tenant (Plan \& Quota)} \longrightarrow \text{Applications (Tentaciones, etc.)} \longrightarrow \text{Platform Capabilities} \longrightarrow \text{Governed Runtime}$$

---

## 2. Jerarquía de Identidad y Entidades

1. **Tenant**: Entidad organizacional propietaria de recursos, planes (`FREE`, `PRO`, `BUSINESS`, `ENTERPRISE`), cuotas y facturación.
2. **User**: Cuenta individual dentro de un tenant con credenciales y roles RBAC (`ADMIN`, `OPERATOR`, `AUDITOR`, `VIEWER`).
3. **Application**: Aplicación consumidora registrada (e.g. *Tentaciones AI Commerce*) asociada a un Tenant.
4. **Service Identity**: Identidades no humanas para llamadas API M2M con claves API firmadas.
5. **Agent**: Agente autónomo gobernado que opera dentro del límite de seguridad del tenant.

---

## 3. Planes y Capacidades

| Plan | Tareas / Mes | Ejecuciones / Mes | Tokens / Mes | Apps | Webhooks | AR 3D Fitting | n8n Connector |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | 500 | 1,000 | 100,000 | 2 | 100 | Básico | No |
| **PRO** | 5,000 | 10,000 | 2,000,000 | 10 | 5,000 | Completo | No |
| **BUSINESS**| 50,000 | 100,000 | 20,000,000 | 50 | 100,000 | Completo | Sí |
| **ENTERPRISE** | Ilimitado / Custom | Ilimitado | Custom | 500+ | Ilimitado | Custom SLA | Sí |
