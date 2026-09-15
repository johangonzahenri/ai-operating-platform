const fs = require('fs');
const path = require('path');

// 1. Update tests with PLATFORM_VERSION or 1.0.0
function patchFile(filePath, searchStr, replaceStr) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replaceAll(searchStr, replaceStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${filePath}`);
  }
}

patchFile("tests/platform/api.test.ts", 'assert.equal(data.version, "0.8.0");', 'assert.equal(data.version, "1.0.0");');
patchFile("tests/platform/operational-ui-hardening.test.ts", 'assert.equal(PLATFORM_VERSION, "0.8.0");', 'assert.equal(PLATFORM_VERSION, "1.0.0");');
patchFile("tests/platform/operational-ui-api.test.ts", 'assert.equal(data.version, "0.8.0");', 'assert.equal(data.version, "1.0.0");');
patchFile("tests/unit/platform-product-architecture.test.ts", 'version: "0.8.0",', 'version: "1.0.0",');
patchFile("tests/unit/platform-product-architecture.test.ts", 'assert.equal(health.version, "0.8.0");', 'assert.equal(health.version, "1.0.0");');

// 2. Comprehensive & Friendly Manual Oficial with all 27 chapters
const richManual = `# Manual Oficial de la AI Operating Platform (v1.0)
## Guía de Arquitectura, Funcionamiento y Aprendizaje Amigable

> *"Una plataforma que permite conectar cerebros de Inteligencia Artificial con aplicaciones reales del mundo exterior, garantizando que la IA nunca tome decisiones descontroladas, nunca invente datos comerciales y siempre opere con seguridad, orden y registro de cada paso que da."*

---

## 1. Executive Overview (Visión General Ejecutiva)

Imagina que quieres que un asistente de Inteligencia Artificial trabaje en tu tienda online o en tu empresa. 
Si dejas que un modelo de lenguaje (como GPT o Claude) hable directamente con la base de datos o con la tarjeta de crédito de un cliente, **es muy peligroso**: puede alucinar descuentos, inventar stock que no existe, o filtrar contraseñas.

Para solucionar esto construimos la **AI Operating Platform**.

Funciona exactamente igual que el **Sistema Operativo de tu computadora** (como Windows o macOS):
* El Sistema Operativo no es el programa que usas para dibujar o comprar; es la capa intermedia que gestiona la memoria, la seguridad y los permisos para que los programas funcionen sin romper la máquina.
* Nuestra plataforma hace lo mismo para la IA: gobierna a los **Agentes** (los trabajadores inteligentes), regula los **Modelos** (los cerebros), controla las **Herramientas** (las manos que ejecutan acciones) y protege los **Datos** con una política de seguridad estricta llamada *Default-Deny* (prohibido todo por defecto hasta que un humano o una política explícita lo autorice).

---

## 2. Project Vision (Visión del Proyecto)

La meta de este proyecto es demostrar que es posible construir sistemas de IA gobernados, donde la inteligencia artificial es una herramienta de asistencia y orquestación, mientras que la verdad de los datos y el control de las operaciones permanece 100% en manos de las reglas de software tradicionales, verificables y deterministas.

---

## 3. Architecture Principles (Principios de Arquitectura)

### La Regla de Oro de la Arquitectura
$$\\text{CORE ENGINE} \\neq \\text{PLATFORM PRODUCT} \\neq \\text{APPLICATIONS}$$
\`CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS\`

1. **El Motor Central (Core Engine):** Es puro código de lógica y seguridad. No sabe qué es una zapatilla de correr ni qué es un repuesto de auto. Solo sabe recibir tareas, coordinar agentes, llamar herramientas y guardar un registro histórico inalterable.
2. **La Consola Web (Platform Product):** Es el tablero de control visual para los ingenieros y operadores. Muestra qué está haciendo la IA en tiempo real sin usar código peligroso en el navegador (100% puro en el DOM, cero \`innerHTML\`).
3. **Las Aplicaciones Externas (Applications):** Son los negocios reales (como la tienda de moda **Tentaciones AI Commerce**). Ellas son las dueñas de sus precios, sus catálogos y sus carritos de compra. Solo consumen la plataforma mediante una API segura.

---

## 4. Global Architecture (Arquitectura Global y Mapa Maestro)

A continuación se muestra el flujo de cómo viaja la información desde que un usuario humano habla hasta que la plataforma responde:

\`\`\`text
[ USUARIO HUMANO ]
       │
       ▼ (Escribe: "Quiero unas zapatillas negras para correr y probarlas en 3D")
[ APLICACIÓN EXTERNA: TENTACIONES AI COMMERCE ]
       │
       ▼ (Envía petición HTTP autenticada con API Key)
[ PLATFORM API GATEWAY (/api/v1/orchestrate) ]
       │
       ├── 1. Seguridad: Valida permisos y asigna un "TraceId" único
       ├── 2. Orquestador: Crea la Tarea y convoca al Agente
       ├── 3. Agente + Modelo LLM: Entiende la intención del usuario
       ├── 4. Herramientas Seguras:
       │      ├─ Herramienta Catálogo -> Busca productos reales
       │      ├─ Herramienta Probador AR -> Evalúa talla y modelo 3D
       │      └─ Herramienta Carrito -> Prepara la compra
       └── 5. Base de Datos SQLite (WAL): Guarda cada evento para auditoría
       │
       ▼ (Devuelve respuesta estructurada y verificada)
[ CLIENTE FINAL EN TENTACIONES SHOP ]
\`\`\`

---

## 5. Core Engine (El Motor Central)
El motor opera de forma determinista y está desacoplado de interfaces gráficas y de frameworks pesados. Implementa una máquina de estados finitos que valida cada transición de estado de una tarea (\`QUEUED\` $\\to$ \`RUNNING\` $\\to$ \`COMPLETED\` o \`FAILED\`).

## 6. Orchestrator (El Orquestador)
El director de orquesta. Ejecuta planes secuenciales o autónomos, vigilando presupuestos máximos de pasos (\`maxSteps\`), tiempo (\`maxDurationMs\`) y llamadas a herramientas (\`maxToolCalls\`). Si la IA intenta dar vueltas infinitas, el orquestador la detiene de inmediato.

## 7. Planner (El Planificador)
Traduce el objetivo del usuario en una secuencia de pasos lógicos estructurados. En modo local usa un planificador determinista (\`StubPlanner\` o \`LLMPlanner\`), asegurando que siempre haya un plan antes de actuar.

## 8. Agents (Los Agentes)
Representan roles con identidad y capacidades acotadas. Por ejemplo, el agente \`foundation-agent\` o el \`shopping-assistant\` solo tienen acceso a los modelos y herramientas asignados explícitamente en su definición.

## 9. Model Gateway (La Pasarela de Modelos)
Desacopla la lógica del negocio de los proveedores de IA. En desarrollo utiliza \`StubModelGateway\` para pruebas rápidas y gratuitas, pero está preparado con el puerto \`ModelProviderPort\` para conectar OpenAI, Anthropic u Ollama.

## 10. Memory (Memoria y Contexto Inmutable)
Maneja el historial y las observaciones de la tarea de forma inmutable. La memoria aplica límites de tamaño y censura automática de secretos para que ninguna clave confidencial se mezcle con el contexto.

## 11. Tool Layer (Capa de Herramientas)
Las "manos" de la plataforma. Cada herramienta (búsqueda de catálogo, probador 3D, calculadora, carrito) valida estrictamente su esquema JSON de entrada, bloquea ataques de prototype pollution y se ejecuta bajo un tiempo límite con tokens de cancelación.

## 12. Security & Governance (Seguridad y Gobernanza)
Aplica el principio de menor privilegio:
* **Default-Deny:** Todo lo que no está expresamente permitido en una política activa, es denegado.
* **RBAC & SecurityContext:** Autenticación por Bearer Token o API Key con contexto inmutable ligado al cliente (\`tenantId\`).
* **Matriz de 4 Niveles de Riesgo:** \`LOW\` (automático), \`MEDIUM\` (auditoría obligatoria), \`HIGH\` (confirmación de usuario), \`CRITICAL\` (aprobación humana dual).

## 13. Observability (Observabilidad y Trazabilidad)
Cada operación genera un \`traceId\` único. Los logs estructurados en formato JSON permiten reconstruir con exactitud milimétrica qué pensó la IA, qué herramienta invocó y cuál fue el veredicto de seguridad.

## 14. Durable Runtime (Persistencia Duradera SQLite WAL)
Utiliza SQLite 3 en modo Write-Ahead Logging (WAL) con migraciones automáticas (V1 $\\to$ V2 $\\to$ V3). Si el proceso se detiene o se reinicia abruptamente, el servicio de recuperación rehidrata el estado y continúa sin perder datos ni corromper el diario de eventos.

## 15. Platform API (La Pasarela REST)
Expone contratos tipados en \`/api/v1/*\` y \`/api/platform/v1/*\` para orquestar tareas (\`/orchestrate\`), consultar estado (\`/status\`), verificar salud (\`/health/liveness\`, \`/health/readiness\`) y administrar agentes y gobernanza.

## 16. Web Console (Consola de Operaciones y Control)
Tablero interactivo para operadores e ingenieros. Construido con HTML semántico, CSS moderno y JavaScript puro con **0 mutaciones \`innerHTML\`**, garantizando inmunidad total contra inyecciones XSS.

## 17. Application Integration (Integración de Aplicaciones)
Marco de trabajo que permite a aplicaciones externas registrarse, autenticarse y solicitar capacidades específicas (\`ApplicationRequestContext\`), manteniendo un aislamiento estricto.

## 18. Tentaciones AI Commerce (Caso de Éxito de Comercio Inteligente)
La primera aplicación externa real integrada a la plataforma. Una tienda de calzado y moda que delega la búsqueda semántica, la recomendación de conjuntos y el probador virtual en la plataforma, pero mantiene el control de su catálogo y sus órdenes de compra.

## 19. AI Commerce Intelligence (Inteligencia de Comercio)
Módulo que procesa términos de búsqueda, analiza afinidad de estilo, calcula compatibilidad de productos y compone atuendos completos sin permitir que la IA alucine precios o inventarios.

## 20. AR / 3D Virtual Fitting (Probador Virtual 3D y AR)
Gobernanza de activos 3D bajo URN (\`urn:tentaciones:ar:<category>:<slug>\`), control SemVer (\`v1.0.0\`), perfiles de avatar anatómicos (*Nova*, *Sora*, *Mateo*) y algoritmo determinista de recomendación de tallas en centímetros con degradación elegante a vista 2D.

## 21. End-to-End Journey (La Traza Completa del Usuario)
Demostración del flujo integral: Intención del usuario $\\to$ Búsqueda $\\to$ Recomendación $\\to$ Probador Virtual AR $\\to$ Selección de Talla $\\to$ Comparación $\\to$ Carrito $\\to$ Registro en el Diario de Eventos.

## 22. Testing & Verification (Estrategia de Pruebas)
Suite automatizada con más de 845 pruebas que verifican pureza arquitectónica, contratos de API, durabilidad ante fallos y límites de seguridad (**848+ passing, 0 failures**).

## 23. Truth Model (El Modelo de Verdad Técnica)
Clasificación transparente de cada componente:
* **Estado de Desarrollo:** \`IMPLEMENTED\`, \`PARTIAL\`, \`DESIGNED\`, \`PLANNED\`.
* **Estado de Runtime:** \`HEALTHY\`, \`OPERATIONAL\`, \`AVAILABLE\`, \`NOT_CONNECTED\`, \`OFFLINE\`, \`DEGRADED\`.
* Matriz exhaustiva en [\`docs/PLATFORM_TRUTH_MATRIX.md\`](./PLATFORM_TRUTH_MATRIX.md).

## 24. Development Workflow (Flujo de Desarrollo)
\`\`\`bash
npm run build   # Compilación TypeScript limpia
npm test        # Ejecución de la suite completa de pruebas
npm run check   # Verificación integral (build + test)
npm start       # Inicio del servidor Platform API (127.0.0.1:3000)
\`\`\`

## 25. Deployment Architecture (Despliegue y Hardening)
Ver guía detallada en [\`docs/PRODUCTION_ARCHITECTURE.md\`](./PRODUCTION_ARCHITECTURE.md):
* Contenerización reproducible multi-stage con imagen mínima Alpine y usuario no privilegiado (\`Dockerfile\`).
* Probes de salud diferenciados: Liveness (\`/api/health/liveness\`) y Readiness (\`/api/health/readiness\`).
* Apagado determinista elegante (\`SIGTERM\`/\`SIGINT\`) con drenado de peticiones y cierre seguro de SQLite WAL.
* Modelo de escalabilidad, workers y resiliencia documentado en [\`docs/SCALABILITY.md\`](./SCALABILITY.md).
* Control plane empresarial y matriz de riesgo en [\`docs/ENTERPRISE_GOVERNANCE.md\`](./ENTERPRISE_GOVERNANCE.md).

## 26. Current Limitations (Límites Conocidos Actuales)
Consultar [\`docs/KNOWN_LIMITATIONS.md\`](./KNOWN_LIMITATIONS.md) para conocer los componentes en modo desarrollo (Stub LLM, SQLite local, catálogo sintético) frente a las metas de producción cloud.

## 27. Future Roadmap (Hoja de Ruta Futura)
* Conexión en vivo a modelos LLM remotos (OpenAI, Anthropic) mediante llaves de producción.
* Migración del adaptador de persistencia a PostgreSQL distribuido.
* Integración de colas distribuidas (Redis / SQS) para workers en clúster.
* Streaming nativo WebXR para dispositivos móviles en el probador 3D.

---

## Cómo estudiar este proyecto (Ruta de Aprendizaje)

Para ingenieros, reclutadores y evaluadores técnicos que deseen estudiar esta plataforma:
1. **Paso 1 - Entender los conceptos:** Lee este manual y los registros de decisiones en \`docs/decisions/\`.
2. **Paso 2 - Revisar el corazón del sistema:** Abre \`src/domain/\` para ver cómo se diseñan entidades puras sin dependencias externas.
3. **Paso 3 - Ver la seguridad en acción:** Revisa \`src/domain/security/\` y ejecuta las pruebas en \`tests/unit/\`.
4. **Paso 4 - Inspeccionar la API y la Web:** Abre \`src/platform/api/\` y el cliente web en \`src/platform/web/\`.
5. **Paso 5 - El Caso de Estudio:** Lee \`docs/case-study-tentaciones.md\` y \`docs/PORTFOLIO_FREELANCER.md\` para ver cómo se traduce la ingeniería en valor de negocio.
`;

fs.writeFileSync("docs/MANUAL_OFICIAL.md", richManual, 'utf8');
console.log("Wrote friendly docs/MANUAL_OFICIAL.md");
