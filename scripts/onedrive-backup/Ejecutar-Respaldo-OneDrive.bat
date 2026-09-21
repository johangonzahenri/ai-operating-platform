@echo off
chcp 65001 >nul
title AI Operating Platform - Respaldo OneDrive a Google Drive

set "SCRIPT_DIR=%~dp0"

:MENU
cls
echo ===============================================================================
echo        AI OPERATING PLATFORM - RESPALDO AUTOMÁTICO ONEDRIVE A GDRIVE
echo ===============================================================================
echo   Libera espacio en OneDrive transfiriendo archivos pesados a Google Drive
echo ===============================================================================
echo.
echo   [1] Simulación (Dry-Run: ver qué archivos se moverían y cuánto espacio se liberará)
echo   [2] Mover y Liberar Espacio en OneDrive AHORA (Archivos mayores a 14 días)
echo   [3] Copiar sin Eliminar de OneDrive (Copia de seguridad)
echo   [4] Forzar Migración de Todos los Archivos Antiguos (Omitir umbral de GB)
echo   [5] Configurar Ruta de Destino en Google Drive
echo   [6] Ver Último Reporte de Respaldo
echo   [7] Volver / Salir
echo.
echo ===============================================================================
set /p OPCION=" Selecciona una opción (1-7): "

if "%OPCION%"=="1" goto SIMULACION
if "%OPCION%"=="2" goto MOVER_LIBERAR
if "%OPCION%"=="3" goto COPIAR
if "%OPCION%"=="4" goto FORZAR
if "%OPCION%"=="5" goto CONFIGURAR
if "%OPCION%"=="6" goto VER_REPORTE
if "%OPCION%"=="7" goto SALIR

echo [X] Opción inválida.
timeout /t 2 >nul
goto MENU

:SIMULACION
cls
echo [i] Analizando archivos candidatos en OneDrive...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Backup-OneDriveToGDrive.ps1" -DryRun -Force
echo.
pause
goto MENU

:MOVER_LIBERAR
cls
echo ===============================================================================
echo                MIGRACIÓN Y LIBERACIÓN DE ESPACIO EN ONEDRIVE
echo ===============================================================================
echo [i] Se transferirán los archivos a Google Drive y se liberará espacio en OneDrive.
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Backup-OneDriveToGDrive.ps1" -MoveFiles
echo.
pause
goto MENU

:COPIAR
cls
echo [i] Creando copia de seguridad sin borrar archivos de OneDrive...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Backup-OneDriveToGDrive.ps1"
echo.
pause
goto MENU

:FORZAR
cls
echo [i] Forzando migración y liberación completa...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%Backup-OneDriveToGDrive.ps1" -MoveFiles -Force -OlderThanDays 7
echo.
pause
goto MENU

:CONFIGURAR
cls
echo ===============================================================================
echo               CONFIGURAR RUTA DE DESTINO EN GOOGLE DRIVE
echo ===============================================================================
echo Ejemplo: G:\Mi unidad\Respaldos_OneDrive  o  C:\GoogleDrive_Respaldos
echo.
set /p NUEVA_RUTA=" Ingresa la ruta de destino: "
if not "%NUEVA_RUTA%"=="" (
    powershell -ExecutionPolicy Bypass -NoProfile -Command "$cfg = @{ DestinationPath = '%NUEVA_RUTA%' }; $cfg | ConvertTo-Json | Set-Content -Path '%SCRIPT_DIR%config.json' -Encoding UTF8; Write-Host '[OK] Ruta guardada correctamente.' -ForegroundColor Green"
)
echo.
pause
goto MENU

:VER_REPORTE
cls
powershell -ExecutionPolicy Bypass -NoProfile -Command "$last = Get-ChildItem -Path '%SCRIPT_DIR%logs\*.md' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($last) { Get-Content $last.FullName } else { Write-Host 'Aún no hay reportes de respaldo generados.' -ForegroundColor Yellow }"
echo.
pause
goto MENU

:SALIR
exit /b
