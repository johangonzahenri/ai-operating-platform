# EXTERNAL INTEGRATIONS MATRIX & VERIFICATION GUIDE

## 1. Matriz de Capacidades y Estado de Integración

| Integración | Adapter | Credenciales | Conexión | Runtime | Estado de Verdad | Dependencia Externa |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `OpenAIModelGateway` | `OPENAI_API_KEY` | HTTPS REST (`api.openai.com/v1`) | Servidor (Node.js) | `IMPLEMENTED` / `NOT_CONFIGURED` | Nube OpenAI |
| **Anthropic** | `AnthropicModelGateway` | `ANTHROPIC_API_KEY` | HTTPS REST (`api.anthropic.com/v1`) | Servidor (Node.js) | `IMPLEMENTED` / `NOT_CONFIGURED` | Nube Anthropic |
| **Ollama** | `OllamaModelGateway` | No requerida | HTTP Local (`localhost:11434`) | Localhost | `IMPLEMENTED` / `NOT_CONFIGURED` | Daemon Local Ollama |
| **AR Media / 3D** | `VirtualTryonEngine` | No requerida | Local / WebGL / WebXR | Browser / Servidor | `IMPLEMENTED` / `OPERATIONAL` | Ninguna |
| **n8n Automation** | `N8nPlatformAdapter` | Webhook Secret | HTTP Webhooks (HMAC-SHA256) | Servidor | `IMPLEMENTED` / `DESIGNED` | Servidor n8n externo |
| **Webhooks Salientes**| `WebhookDispatcher` | Shared HMAC Secret | HTTPS POST | Servidor | `IMPLEMENTED` / `OPERATIONAL` | Servidor destino |
| **OpenTelemetry** | OTel Collector Config | Token opcional | gRPC 4317 / HTTP 4318 | Red interna | `DESIGNED` | Collector OTel |
| **Stub Determinista**| `StubModelGateway` | No requerida | Memoria en proceso | Core Engine | `IMPLEMENTED` / `OPERATIONAL` | Ninguna |

---

## 2. Invariante de Verdad y Modos de Prueba

1. **Sin credenciales**: La plataforma reporta explícitamente `NOT_CONFIGURED` o `DESIGNED`. Nunca afirma falsamente que un servicio está `OPERATIONAL`.
2. **Modo Opt-In de Integración Real (`INTEGRATION_TEST=true`)**: Las pruebas que realizan peticiones HTTP a servidores externos solo se ejecutan cuando esta variable está activa y las credenciales existen.
3. **Aislamiento de Secretos**: Ninguna credencial es devuelta a la Web Console ni registrada en logs.
