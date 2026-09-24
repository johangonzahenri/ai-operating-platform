# CLI de Application Factory — `create-aop-app`

**AI Operating Platform — Guía Oficial de Herramientas de Desarrollo**

---

## 1. Introducción y Propósito

El comando `create-aop-app` es la herramienta de línea de comandos oficial orientada a desarrolladores de la **AI Operating Platform**. Su propósito es convertir las capacidades de gobernanza, empaquetado, verificación y arneses de `ApplicationFactoryEngine` en una experiencia de desarrollo interactiva y automatizada.

Con `create-aop-app`, los equipos de ingeniería pueden inicializar de forma determinista y segura aplicaciones satélite (como *01 Tentaciones AI Commerce*) cumpliendo con:
- Contratos formales de manifiesto (`application.json`).
- Validación estricta de derechos y capacidades por plan de tenant (`checkEntitlements`).
- Generación de adaptadores tipados contra el SDK oficial `@ai-platform/client`.
- Endpoints canónicos de salud (`/health`) y telemetría/observabilidad (`/metrics`).
- Harness automatizado de 7 pruebas para certificación instantánea (`doctor`).

---

## 2. Instalación y Ejecución

### Ejecución Directa con npm
```bash
# Inicializar una aplicación interactiva o con parámetros
npm run create-aop-app -- init <app-id> [opciones]

# Ver plantillas disponibles
npm run create-aop-app -- templates

# Listar catálogo oficial de capacidades y dependencias
npm run create-aop-app -- capabilities

# Validar un manifiesto existente
npm run create-aop-app -- validate ./application.json

# Ejecutar diagnóstico y arnés de certificación
npm run create-aop-app -- doctor ./mi-app
```

---

## 3. Comandos y Sintaxis

### 3.1 `init <app-id>`
Genera el andamiaje completo de una nueva aplicación satélite gobernada.

| Parámetro / Flag | Tipo | Descripción | Valor por Defecto |
| :--- | :--- | :--- | :--- |
| `<app-id>` | Posicional | Identificador canónico en minúsculas (kebab-case) | Obligatorio |
| `--name <nombre>` | String | Nombre legible de la aplicación | `<app-id>` formateado |
| `--description <desc>` | String | Descripción del propósito operativo | Autogenerado |
| `--category <cat>` | String | Categoría funcional (`Commerce`, `Support`, `Operations`, `AI`) | `AI` |
| `--tenant <tenant-id>` | String | ID del tenant propietario | `tenant-default` |
| `--plan <plan>` | Enum | Nivel de suscripción (`FREE`, `PRO`, `BUSINESS`, `ENTERPRISE`) | `ENTERPRISE` |
| `--template <id>` | Enum | Plantilla base (`generic-ai-app`, `commerce-ai-app`, `support-ai-app`, `automation-ai-app`) | `generic-ai-app` |
| `--capabilities <list>` | CSV | Lista de capacidades requeridas separadas por comas | Heredadas del template |
| `--runtime <runtime>` | String | Entorno de ejecución (`node`, `python`, `deno`) | `node` |
| `--environment <env>` | Enum | Entorno objetivo (`development`, `staging`, `production`) | `development` |
| `--min-platform-version <v>` | String | Versión mínima requerida de la plataforma | `1.4.0` |
| `--output <dir>` | Path | Directorio destino para la generación de archivos | `./<app-id>` |
| `--dry-run` | Flag | Simula la generación mostrando archivos sin escribir en disco | `false` |
| `--force` | Flag | Sobrescribe archivos existentes en caso de conflicto | `false` |
| `--json` | Flag | Emite la salida en formato JSON estructurado | `false` |

#### Ejemplo de Creación de Aplicación de Comercio:
```bash
npm run create-aop-app -- init tentaciones-boutique \
  --name "Tentaciones Boutique AR" \
  --template commerce-ai-app \
  --tenant tenant-retail-01 \
  --plan ENTERPRISE \
  --output ./apps/tentaciones-boutique
```

### 3.2 `templates`
Muestra el catálogo de plantillas oficiales de fábrica con sus capacidades recomendadas y categorías.

```bash
npm run create-aop-app -- templates
```

### 3.3 `capabilities`
Inspecciona el catálogo integral de capacidades de la AI Operating Platform (`PLATFORM_CAPABILITY_CATALOG`), incluyendo:
- Requisitos mínimos de plan (`FREE`, `PRO`, `BUSINESS`, `ENTERPRISE`).
- Componentes de plataforma requeridos (Gateway, Pipeline AR, Event Store, etc.).
- Grafo de dependencias técnicas.

```bash
npm run create-aop-app -- capabilities
```

### 3.4 `validate [ruta]`
Valida un manifiesto `application.json` contra las reglas estructurales de `ApplicationValidator`.

```bash
npm run create-aop-app -- validate ./apps/tentaciones-boutique/application.json
```

### 3.5 `doctor [ruta]`
Ejecuta el arnés oficial de 7 pruebas de `ApplicationFactoryEngine.runHarness()`:
1. `manifest-exists`: Comprueba existencia del manifiesto.
2. `manifest-schema`: Valida campos requeridos y tipos.
3. `adapter-exists`: Verifica adaptador cliente.
4. `health-endpoint`: Verifica interfaz de salud.
5. `observability-setup`: Valida emisión de métricas.
6. `client-sdk-version`: Valida compatibilidad con `@ai-platform/client`.
7. `test-suite-present`: Comprueba presencia del suite de integración.

```bash
npm run create-aop-app -- doctor ./apps/tentaciones-boutique
```

---

## 4. Estructura de Archivos Generada

Al ejecutar `init`, `create-aop-app` crea un paquete de aplicación autocontenido y listo para integrarse:

```text
mi-app/
├── application.json             # Manifiesto de gobernanza y capacidades
├── README.md                    # Guía operativa y de arranque
├── src/
│   ├── adapter.ts               # Adaptador cliente tipado (@ai-platform/client)
│   ├── health.ts                # Endpoint de diagnóstico y salud Liveness/Readiness
│   └── observability.ts         # Métricas de ejecución y observabilidad
└── tests/
    └── integration.test.ts      # Suite de integración determinista
```

---

## 5. Garantías de Seguridad y Gobernanza

1. **Principio Fail-Closed en Derechos**: Si un tenant en plan `FREE` solicita capacidades exclusivas de `ENTERPRISE` (p. ej. `ar.fitting_room`), la CLI rechaza la creación de forma inmediata con código de salida `1` sin mutar el disco.
2. **Dependencias Canónicas**: Todos los adaptadores generados importan el paquete canónico `@ai-platform/client`, erradicando discrepancias de nomenclatura de versiones previas.
3. **Determinismo y Trazabilidad**: Todo manifiesto incluye metadatos de versión de plataforma, tenant ID y capacidades declaradas para su auditoría en el `DurableEventStore`.

---

## 6. Aplicación de Referencia Canónica

Para examinar una aplicación satélite completamente implementada y certificada generada con `create-aop-app`, consulte:
* `examples/reference-consumer/`
* [Documentación de la Aplicación de Referencia](./REFERENCE_APPLICATION.md)

