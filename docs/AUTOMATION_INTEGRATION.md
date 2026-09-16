# Automation & n8n Integration (Integración con Automatizaciones)
## Orquestación de Flujos Externos, Webhooks y Eventos de Negocio (v1.1.0)

La plataforma provee conectores certificados para plataformas de flujos de trabajo como **n8n**, permitiendo sincronizar la inteligencia de agentes con procesos empresariales existentes.

---

## 1. Topología de Integración

```text
[Proceso n8n] ──(HTTP Webhook)──► [Platform API (/api/v1/tasks)] ──► [Agente de IA]
     ▲                                                                       │
     └─────────────(Notificación SSE / Evento Durable)───────────────────────┘
```

---

## 2. Casos de Uso Comunes

1. **Soporte al Cliente Omnicanal:** Ingesta de mensajes de WhatsApp/Telegram hacia el agente resolutor de la plataforma.
2. **Alertas de Inventario Crítico:** Notificación automática hacia Slack/Email cuando un agente detecta quiebre de stock en Tentaciones.
3. **Facturación Asistida:** Disparo de órdenes de impresión física en impresoras Brother tras confirmarse un checkout exitoso.
