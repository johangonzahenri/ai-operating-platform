@echo off
chcp 65001 >nul
title AI Operating Platform - Mantenimiento y Optimización de PC

:: Verificar permisos de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] Solicitando permisos de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: Rutas base
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "PROJECT_ROOT=%%~fI"
set "DAEMON_DIR=%PROJECT_ROOT%\win-memory-daemon"
set "DAEMON_SRC=%DAEMON_DIR%\src\ram_daemon.pyw"

:MENU
cls
echo ===============================================================================
echo                AI OPERATING PLATFORM - OPTIMIZADOR INTEGRAL
echo ===============================================================================
echo   Aceleración de Memoria RAM y Limpieza 100%% Nativa (Sin apps de pago)
echo ===============================================================================
echo.
echo   --- OPTIMIZACIÓN DE MEMORIA RAM ---
echo   [1] LIBERAR MEMORIA RAM AHORA (Purga Inmediata de Working Sets inactivos)
echo   [2] ACTIVAR CENTINELA AUTOMÁTICO DE RAM (Segundo plano 24/7 al iniciar Windows)
echo   [3] Desactivar Centinela Automático de RAM
echo.
echo   --- LIMPIEZA DE DISCO Y ALMACENAMIENTO ---
echo   [4] Limpieza Estándar de Disco (Temporales, Logs, Papelera, DNS)
echo   [5] Limpieza Profunda de Disco (Windows Update, Prefetch, Dev Cache)
echo   [6] Modo Simulación de Disco (Dry-Run: ver cuánto espacio se liberaría)
echo   [7] Programar Mantenimiento de Disco Semanal (Domingos 18:00)
echo.
echo   --- DIAGNÓSTICO Y REPORTES ---
echo   [8] Ver Estado de Tareas Automáticas (RAM y Disco)
echo   [9] Ver Último Reporte de Mantenimiento
echo   [0] Salir
echo.
echo ===============================================================================
set /p OPCION=" Selecciona una opción (0-9): "

if "%OPCION%"=="1" goto LIBERAR_RAM
if "%OPCION%"=="2" goto ACTIVAR_RAM_SENTINEL
if "%OPCION%"=="3" goto DESACTIVAR_RAM_SENTINEL
if "%OPCION%"=="4" goto ESTANDAR
if "%OPCION%"=="5" goto PROFUNDA
if "%OPCION%"=="6" goto SIMULACION
if "%OPCION%"=="7" goto PROGRAMAR_DISCO
if "%OPCION%"=="8" goto ESTADO_TAREAS
if "%OPCION%"=="9" goto VER_REPORTE
if "%OPCION%"=="0" goto SALIR

echo [X] Opción inválida. Intenta nuevamente.
timeout /t 2 >nul
goto MENU

:LIBERAR_RAM
cls
echo ===============================================================================
echo                    LIBERACIÓN INMEDIATA DE MEMORIA RAM
echo ===============================================================================
echo [i] Purgando páginas físicas inactivas sin cerrar tus aplicaciones...
echo.
python "%DAEMON_SRC%" --once
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:ACTIVAR_RAM_SENTINEL
cls
echo ===============================================================================
echo             ACTIVAR CENTINELA AUTOMÁTICO DE MEMORIA RAM 24/7
echo ===============================================================================
echo [i] Configurando tarea programada para que el Centinela inicie con Windows...
call "%DAEMON_DIR%\scripts\install.bat"
goto MENU

:DESACTIVAR_RAM_SENTINEL
cls
echo ===============================================================================
echo             DESACTIVAR CENTINELA AUTOMÁTICO DE MEMORIA RAM
echo ===============================================================================
call "%DAEMON_DIR%\scripts\uninstall.bat"
goto MENU

:ESTANDAR
cls
echo [i] Iniciando Limpieza Estándar de Disco...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Clean-PC.ps1"
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:PROFUNDA
cls
echo [i] Iniciando Limpieza Profunda de Disco y RAM...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Clean-PC.ps1" -DeepClean
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:SIMULACION
cls
echo [i] Ejecutando Simulación (Dry-Run - No se borrarán archivos)...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Clean-PC.ps1" -DryRun -DeepClean
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:PROGRAMAR_DISCO
cls
echo [i] Registrando tarea programada semanal de disco...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Register-ScheduledTask.ps1" -Action Register -Frequency Weekly -DaysOfWeek SUN -Time "18:00"
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:ESTADO_TAREAS
cls
echo ===============================================================================
echo                        ESTADO DE AUTOMATIZACIONES
echo ===============================================================================
echo.
echo --- 1. Centinela de Memoria RAM (WinRAMSentinel) ---
powershell -NoProfile -Command "$t = Get-ScheduledTask -TaskName 'WinRAMSentinel' -ErrorAction SilentlyContinue; if ($t) { Write-Host '  Estado: ACTIVO (' + $t.State + ')' -ForegroundColor Green; $p = Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id)).CommandLine -like '*ram_daemon*' }; if ($p) { Write-Host '  Proceso en ejecucion: PID ' + $p.Id -ForegroundColor Green } else { Write-Host '  Proceso: En espera de inicio de sesion o ejecucion' -ForegroundColor Yellow } } else { Write-Host '  Estado: NO INSTALADO' -ForegroundColor Yellow }"
echo.
echo --- 2. Mantenimiento Automático de Disco (AIPlatform_AutoClean_PC) ---
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Register-ScheduledTask.ps1" -Action Status
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:VER_REPORTE
cls
echo [i] Buscando el reporte más reciente...
powershell -ExecutionPolicy Bypass -NoProfile -Command "$last = Get-ChildItem -Path '%SCRIPT_DIR%logs\*.md' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($last) { Get-Content $last.FullName } else { Write-Host 'Aún no hay reportes generados.' -ForegroundColor Yellow }"
echo.
echo Presiona cualquier tecla para volver al menú principal...
pause >nul
goto MENU

:SALIR
exit
