# 🚀 Guía Oficial: Suite de Mantenimiento y Optimización Autónoma de Windows

> **Propósito:** Sistema de mantenimiento, higiene digital y recuperación de espacio en disco 100% nativo en PowerShell y Batch, diseñado sin depender de utilidades de terceros ni programas de pago (CCleaner, CleanMyPC, etc.).
> **Uso dual:** Mantiene optimizado el equipo de trabajo y sirve como **módulo / tip de valor agregado** para los usuarios de la **AI Operating Platform**.

---

## 📌 1. ¿Por qué una solución nativa propia?

Muchas herramientas comerciales de limpieza:
1. Cobran suscripciones mensuales innecesarias para funciones que Windows ya puede realizar de forma nativa.
2. Mantienen procesos en segundo plano consumiendo memoria RAM y telemetría.
3. Ocasionalmente eliminan llaves críticas del registro de Windows, causando inestabilidades.

Esta suite:
* **Es transparente y segura:** Código abierto, auditable y con tolerancia a archivos en uso (ignora con seguridad archivos bloqueados por aplicaciones abiertas).
* **Mide resultados reales:** Calcula el espacio en disco **Antes vs. Después**, generando reportes en `.md` y `.json`.
* **Automatizable:** Se integra de forma limpia con el Programador de Tareas de Windows (*Task Scheduler*).

---

## 📂 2. Estructura de Archivos

La suite se encuentra en el directorio [`scripts/pc-maintenance/`](file:///c:/Users/Johan/OneDrive/Documentos/IA_Work/scripts/pc-maintenance):

```text
scripts/pc-maintenance/
├── Clean-PC.ps1                  # Script motor principal en PowerShell
├── Register-ScheduledTask.ps1    # Gestor para registrar/desregistrar tareas programadas
├── Ejecutar-Limpieza.bat         # Menú interactivo 1-click con elevación a Administrador
└── logs/                         # Reportes generados (Markdown y JSON con timestamp)
```

---

## 🧹 3. Áreas que Limpia y Optimiza

| Nivel | Categoría | Ruta o Recurso | Beneficio |
|---|---|---|---|
| **Estándar** | Temporales de Usuario | `%TEMP%`, `AppData\Local\Temp` | Libera espacio acumulado por instaladores y apps cerradas. |
| **Estándar** | Reportes de Error | `AppData\Local\CrashDumps` | Elimina volcados de memoria de aplicaciones que fallaron en el pasado. |
| **Estándar** | Caché de Miniaturas | `AppData\Local\Microsoft\Windows\Explorer` | Limpia caché corrupta de iconos y miniaturas de fotos/videos. |
| **Estándar** | Cachés de Navegadores | Chrome, Edge (`User Data\...\Cache`) | Agiliza el navegador y libera cientos de megabytes. |
| **Estándar** | Papelera de Reciclaje | Todas las unidades locales | Vaciado silencioso sin alertas emergentes. |
| **Estándar** | Red (Flush DNS) | Caché DNS del sistema | Resuelve problemas de resolución de dominios y nombres web. |
| **Profunda** | Temporales del Sistema | `C:\Windows\Temp` (Requiere Admin) | Limpia logs y temporales dejados por servicios de Windows. |
| **Profunda** | Error Reporting Sistema | `C:\ProgramData\Microsoft\Windows\WER` | Elimina informes antiguos enviados a Microsoft. |
| **Profunda** | Windows Update Cache | `C:\Windows\SoftwareDistribution\Download` | Libera gigabytes de actualizaciones ya instaladas. |
| **Profunda** | Archivos Prefetch | `C:\Windows\Prefetch` (> 14 días) | Limpia rastros de programas que ya no se utilizan con frecuencia. |
| **Profunda** | Entorno de Desarrollo | `npm-cache`, `.cache`, `pip cache`, `VS Code` | Fundamental para programadores: elimina paquetes temporales antiguos. |

---

## 🎮 4. Modos de Uso

### Opción A: Menú Interactivo de 1 Clic (Recomendado)
Haz doble clic sobre [`Ejecutar-Limpieza.bat`](file:///c:/Users/Johan/OneDrive/Documentos/IA_Work/scripts/pc-maintenance/Ejecutar-Limpieza.bat).  
El script solicitará elevación de Administrador automáticamente si es necesario y desplegará un menú con las siguientes opciones:
1. **Limpieza Estándar:** Rápida, no toca configuraciones profundas.
2. **Limpieza Profunda:** Recomendada una vez al mes o cuando el disco esté saturado.
3. **Modo Simulación (Dry-Run):** Te muestra exactamente cuánto espacio se liberaría **sin borrar un solo archivo**.
4. **Programar Tarea Semanal:** Deja el mantenimiento funcionando automáticamente.
5. **Ver Estado de Tarea:** Consulta si la tarea automática está activa.
6. **Ver Último Reporte:** Muestra el Markdown con el detalle de la última ejecución.

### Opción B: Ejecución por Terminal (PowerShell)
```powershell
# 1. Simulación para ver cuánto espacio se liberará
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Clean-PC.ps1 -DryRun -DeepClean

# 2. Limpieza estándar directa
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Clean-PC.ps1

# 3. Limpieza profunda
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Clean-PC.ps1 -DeepClean

# 4. Modo silencioso para automatizaciones o scripts
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Clean-PC.ps1 -Silent -DeepClean
```

---

## ⏰ 5. Programación Automática en Windows

Para que el mantenimiento se ejecute todos los **Domingos a las 18:00 hrs** de forma desatendida:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Register-ScheduledTask.ps1 -Action Register -Frequency Weekly -DaysOfWeek SUN -Time "18:00"
```

Para verificar su estado:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Register-ScheduledTask.ps1 -Action Status
```

Para desinstalar la tarea programada:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pc-maintenance\Register-ScheduledTask.ps1 -Action Unregister
```

---

## 💡 6. Cómo Aprovechar Esto en la Plataforma de IA de tu Pyme

1. **Sección de "Herramientas Gratuitas & Tips de Rendimiento":**
   * Publicar esta guía en el blog/portal de la plataforma de IA como material educativo para captar clientes pyme.
2. **Descarga Gratuita del Script (`.bat` / `.ps1`):**
   * Ofrecer un botón *"Descargar Suite de Limpieza Gratuita para Pymes"* como imán de prospectos (Lead Magnet).
3. **Módulo de Diagnóstico Remoto:**
   * La estructura genera archivos `.json` que pueden ser leídos por una interfaz web de la plataforma para mostrar métricas de salud del equipo a tus clientes.
