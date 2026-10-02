# Limitaciones Conocidas y Auditoría de Transparencia — AI Operating Platform (v1.4)

## 1. Declaración Ejecutiva
Para asegurar una estricta credibilidad técnica y evitar afirmaciones de marketing no verificadas, este documento detalla explícitamente los límites, componentes simulados (mocks), conjuntos de datos sintéticos y objetivos de evolución futuros de la **AI Operating Platform**.

---

## 2. Clasificación Componente por Componente

### 1. Proveedores de Modelos e Inferencia
* **Estado Local Actual (`IMPLEMENTED / AVAILABLE`):** La plataforma utiliza un `StubModelGateway` interno que produce respuestas JSON deterministas para habilitar la ejecución sin conexión, pruebas rápidas de CI y reproducibilidad local sin costo.
* **Extensión Diseñada (`DESIGNED / PLANNED`):** Adaptadores de API directos para OpenAI (`gpt-4o`), Anthropic (`claude-3-5-sonnet`) y Ollama local están arquitectados a través del `ModelProviderPort`, pero deshabilitados por defecto en las ejecuciones de pruebas locales para evitar requerir claves de facturación externas.

### 2. Persistencia Relacional y Durabilidad
* **Estado Local Actual (`IMPLEMENTED / OPERATIONAL`):** Base de datos SQLite 3 embebida operando con Write-Ahead Logging (WAL), transaction runner, migraciones de esquema (V1 $\to$ V2 $\to$ V3) y durabilidad comprobada tras reinicios.
* **Objetivo de Producción (`DESIGNED / PLANNED`):** Almacenamiento relacional distribuido a escala (PostgreSQL / Aurora) a través de la abstracción hexagonal existente `PersistencePort`.

### 3. Ejecución Asíncrona de Workers
* **Estado Local Actual (`IMPLEMENTED / AVAILABLE`):** `WorkerQueuePort` respaldado por `InMemoryWorkerQueue` con latidos (heartbeats) de renovación de arrendamiento (lease), reintentos exponenciales y contención en cola de mensajes muertos (dead-letter queue).
* **Objetivo de Producción (`DESIGNED / PLANNED`):** Adaptadores de bróker de mensajes distribuidos (Redis Streams / RabbitMQ / SQS).

### 4. Realidad Aumentada e Integración de Hardware 3D
* **Estado Local Actual (`IMPLEMENTED / OPERATIONAL`):** Motor de tallaje de AR local determinista, transformaciones de coordenadas anatómicas, gobernanza de activos SemVer (`urn:tentaciones:ar:*`) y perfiles de avatar (*Nova*, *Sora*, *Mateo*).
* **Objetivo de Producción (`DESIGNED / PLANNED`):** Transmisión directa de cámara de dispositivo nativo WebXR / Apple QuickLook.

### 5. Catálogo de Comercio y Datos de Precios
* **Estado Local Actual (`IMPLEMENTED / AVAILABLE`):** Catálogo sintético determinista de calzado y ropa en Tentaciones AI Commerce para pruebas de integración de extremo a extremo confiables.
* **Objetivo de Producción (`DESIGNED / PLANNED`):** Sincronización de webhook en tiempo real con plataformas comerciales (Shopify, Magento, VTEX).
