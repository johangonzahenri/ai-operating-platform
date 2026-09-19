# Regla de Comunicación: Método MAPA-HUMANO (Human-First Architecture Mapping)

## Objetivo
Estandarizar la forma en que los agentes de IA explican arquitecturas complejas, portafolios y flujos de software a usuarios, clientes y reclutadores, asegurando máxima claridad, impacto visual y comprensión inmediata sin perder rigor técnico.

---

## Principios del Método MAPA-HUMANO

### 1. Nomenclatura Intuitiva (Zero Jargon Innecesario)
* **Prohibido:** Nombres excesivamente crípticos o sobrecargados de siglas técnicas en resúmenes ejecutivos (ej. `edge-device-printer-daemon-spooler-v1`).
* **Obligatorio:** Nombres descriptivos y directos en lenguaje natural (ej. `conector-impresora-ia` / `tienda-inteligente-ia`).

### 2. Estructura de Explicación Canónica
Toda explicación de arquitectura o portafolio debe seguir siempre este orden:

1. **La Frase de Impacto (Analogía Simple):** Explicar qué es en 1 sola oración usando una analogía del mundo real (ej. *"Es el Sistema Operativo para Inteligencia Artificial"*).
2. **Diagrama Mermaid Visual:**
   - Usar bloques simples, íconos y jerarquías claras (`flowchart TD` o `sequenceDiagram`).
   - Diferenciar claramente el **Cerebro / Motor Central** de las **Aplicaciones / Demos**.
3. **Tabla de Traducción (Técnico ↔ Humano):**
   - Columna 1: Icono + Nombre en Repositorio (`tienda-inteligente-ia`).
   - Columna 2: Nombre Comercial / Amigable (*Tienda Online con Asistente y Probador Virtual*).
   - Columna 3: ¿Qué problema resuelve en palabras simples?
4. **Guía de Demostración Rápida (Demo Pitch en 2 minutos):**
   - Explicar cómo presentar cada módulo a diferentes tipos de clientes (tiendas, industrias, perfiles técnicos).

---

## Nombres Estándar del Ecosistema de Portafolio

| Componente | Nombre de Repositorio Estándar | Nombre Humano |
| :--- | :--- | :--- |
| **Núcleo** | `plataforma-motor-ia` | **Cerebro Central de IA (Core Engine)** |
| **Demo 1** | `tienda-inteligente-ia` | **Tienda Online & Probador Virtual (Tentaciones AI)** |
| **Demo 2** | `buscador-repuestos-ia` | **Buscador Inteligente de Repuestos (Vehicle Parts)** |
| **Demo 3** | `conector-impresora-ia` | **Impresora Inteligente & Hardware Bridge** |
| **Demo 4** | `automatizador-reportes-ia` | **Robot de Reportes y Automatizaciones (n8n/Webhooks)** |

---

## Aplicación para Agentes
Cuando se solicite *"explicar la arquitectura"*, *"crear un mapa del proyecto"* o *"estructurar el portafolio"*, el agente DEBE adoptar automáticamente el **Método MAPA-HUMANO**.
