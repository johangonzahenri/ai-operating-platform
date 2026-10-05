# Configuración de Proveedores de Modelos y Referencia de Adaptadores

## 1. Configuración de Entorno

Todos los proveedores de modelos se configuran mediante variables de entorno o a través de objetos de configuración explícitamente proporcionados. No se harcodean claves de API ni tokens.

| Variable | Proveedor | Por Defecto | Descripción |
|---|---|---|---|
| `MODEL_PROVIDER` | Todos | `stub` | Proveedor por defecto (`stub`, `openai`, `anthropic`, `ollama`) |
| `MODEL_NAME` | Todos | Por defecto del proveedor | Identificador del modelo por defecto |
| `MODEL_REQUEST_TIMEOUT_MS` | Todos | `30000` | Tiempo de espera de petición del cliente en milisegundos |
| `MODEL_MAX_RETRIES` | Todos | `2` | Máximo de intentos de reintento en fallos transitorios |
| `OPENAI_API_KEY` | OpenAI | `undefined` | Clave API bearer de OpenAI |
| `OPENAI_MODEL` | OpenAI | `gpt-4o-mini` | Modelo OpenAI por defecto |
| `OPENAI_BASE_URL` | OpenAI | `https://api.openai.com/v1` | Endpoint base de la API |
| `ANTHROPIC_API_KEY` | Anthropic | `undefined` | `x-api-key` de Anthropic |
| `ANTHROPIC_MODEL` | Anthropic | `claude-3-5-haiku-latest` | Modelo Anthropic por defecto |
| `ANTHROPIC_BASE_URL` | Anthropic | `https://api.anthropic.com` | Endpoint base de la API |
| `OLLAMA_BASE_URL` | Ollama | `http://127.0.0.1:11434` | Endpoint del demonio HTTP local de Ollama |
| `OLLAMA_MODEL` | Ollama | `llama3` | Modelo Ollama por defecto |

---

## 2. Implementaciones de Adaptadores

### Adaptador de OpenAI (`OpenAIModelGateway`)
- **Protocolo**: REST `POST /v1/chat/completions`
- **Capacidades Soportadas**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`, `VISION`, `STREAMING`
- **Autenticación**: `Authorization: Bearer <OPENAI_API_KEY>`
- **Fail-Closed**: Si `OPENAI_API_KEY` está ausente en producción, arroja `ModelAuthenticationError` antes del contacto de red.

### Adaptador de Anthropic (`AnthropicModelGateway`)
- **Protocolo**: REST `POST /v1/messages`
- **Capacidades Soportadas**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`, `STREAMING`
- **Autenticación**: `x-api-key: <ANTHROPIC_API_KEY>`
- **Instrucciones del Sistema**: Mapeadas automáticamente a la propiedad `system` de nivel superior de los mensajes de Anthropic.

### Adaptador de Ollama (`OllamaModelGateway`)
- **Protocolo**: REST `POST /api/chat`
- **Capacidades Soportadas**: `TEXT_GENERATION`, `STRUCTURED_OUTPUT`, `TOOL_CALLING`
- **Resiliencia Local**: Mapea con gracia los errores de conexión (`ECONNREFUSED`) a `ModelUnavailableError` para activar el fallback sin crashear el proceso.

### Adaptador Stub Determinístico (`StubModelGateway`)
- **Rol**: Adaptador primario para suites de pruebas unitarias, de integración y CI.
- **Características**: Cero sobrecarga de red, cero costo, payloads de respuesta determinísticos, simula intenciones de descubrimiento de producto para Tentaciones.

---

## 3. Registro de Nuevos Adaptadores

Cualquier nuevo proveedor puede ser añadido implementando `ModelProviderAdapter` sin modificar el dominio o la lógica de la aplicación:

```typescript
import { ModelProviderAdapter } from "./application/ports/model-provider-port.js";

export class CustomProviderAdapter implements ModelProviderAdapter {
  readonly providerId = "custom";
  
  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Traducción de protocolo personalizada
  }
  
  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    // Retornar modelos disponibles
  }
  
  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    // Retornar soporte de capacidad
  }
}
```

Registrar en `ProviderFactory`:
```typescript
providerFactory.registerAdapter(new CustomProviderAdapter());
```
