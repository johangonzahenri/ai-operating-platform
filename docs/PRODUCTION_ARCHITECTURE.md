# Arquitectura de Producción — AI Operating Platform

## 1. Resumen Ejecutivo e Invariante Arquitectónico
La **AI Operating Platform** está diseñada siguiendo estrictos límites de arquitectura hexagonal:
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

Este documento contrasta el **Runtime Local Validado Actual** con la **Arquitectura de Producción Objetivo**, asegurando cero afirmaciones de marketing falsas mientras se delinea un camino fortalecido para la escala empresarial.

---

## 2. Modelo de Entorno y Límites de Configuración
Se reconocen cuatro entornos formales de ciclo de vida:
* `development`: Entorno de desarrollador local con modelos stub deterministas y almacenamiento SQLite local.
* `test`: Ejecutor de automatización CI/CD, aislamiento en memoria, aserciones de límites estrictas.
* `staging`: Entorno de pre-producción integrado con adaptadores de consumidores externos reales.
* `production`: Runtime multi-inquilino fortalecido con validación de configuración fail-closed.

### Validación de Configuración
La configuración se analiza al inicio mediante `validateEnvironment()` en `src/infrastructure/config/config.ts`. Si faltan variables requeridas o los valores están fuera de los límites, el inicio se aborta inmediatamente (**fail-closed**). El dominio y las capas de aplicación nunca acceden a `process.env` directamente.

---

## 3. Modelo de Salud del Runtime
La salud de la plataforma se clasifica en cuatro dimensiones distintas:
1. **Liveness (`/api/health/liveness`)**: Confirma la capacidad de respuesta del proceso, la seguridad de la memoria y la capacidad de respuesta de los hilos.
2. **Readiness (`/api/health/readiness`)**: Confirma la conectividad de la base de datos, el nivel de migración del esquema (V3) y la inicialización del runtime.
3. **Salud de Dependencias (`/api/health/dependencies`)**: Estado granular de la persistencia (SQLite WAL), registro de herramientas y gateways de modelos.
4. **Salud de Aplicaciones (`/api/health/applications`)**: Conectividad en tiempo real y concesiones de capacidades para consumidores externos registrados.

---

## 4. Protocolo de Apagado Elegante (Graceful Shutdown)
Al recibir `SIGTERM` o `SIGINT`:
1. **Detener Ingreso**: El servidor HTTP deja de aceptar nuevas conexiones (`server.close()`).
2. **Drenar Trabajo en Vuelo (In-Flight)**: A las tareas en vuelo se les da un período de gracia limitado (`SHUTDOWN_TIMEOUT_MS`, por defecto 10s).
3. **Vaciar Observabilidad**: Los registros de auditoría estructurados pendientes y los eventos duraderos se sincronizan con SQLite.
4. **Cerrar Persistencia**: Las conexiones de la base de datos SQLite se cierran limpiamente con checkpointing de WAL.
5. **Salida Determinista**: Código de salida 0 en un apagado limpio; código de salida 1 si el período de gracia expira.

---

## 5. Registro Estructurado y Sanitización de Errores
* **Cero Fuga de Secretos**: Todas las entradas de registro pasan por `sanitizeLogMetadata()`, eliminando claves de API, tokens Bearer, contraseñas y secretos.
* **Sanitizador de Errores Público**: Las respuestas de API externas nunca exponen consultas SQL, stack traces o rutas de archivos internos. Los errores públicos devuelven payloads JSON compatibles con RFC 7807 sanitizados con `code`, `status`, `error` y `traceId`.

---

## 6. Persistencia: Actual vs Objetivo de Producción
* **Runtime Actual**: SQLite 3 embebido con Write-Ahead Logging (WAL), transaction runner, migraciones de esquema V1 $\to$ V2 $\to$ V3, y durabilidad a través de reinicios de procesos.
* **Objetivo de Producción**: Puerto de persistencia hexagonal mapeado a un almacenamiento relacional distribuido (PostgreSQL / Aurora / CockroachDB) con pool de conexiones y replicación multi-AZ.

---

## 7. Plan de Contenerización
Se proporciona un `Dockerfile` multi-stage para compilaciones de contenedores reproducibles compatibles con OCI:
* **Stage 1 (Builder)**: Node 22 Alpine, instala dependencias, ejecuta compilación y pruebas unitarias.
* **Stage 2 (Runner)**: Usuario mínimo sin privilegios (`aiplatform`), sistema de archivos raíz de solo lectura compatible, puertos estrictamente limitados.
