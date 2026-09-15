@echo off
setlocal enabledelayedexpansion
title AI Operating Platform - Servidor Unificado
cls

echo ===================================================================
echo             AI OPERATING PLATFORM - SERVIDOR UNIFICADO
echo ===================================================================
echo.

:: 1. Auto-detectar y anadir rutas de Node.js al PATH del proceso
set "PATH=%APPDATA%\Antigravity\bin;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\node;%APPDATA%\npm;%PATH%"

:: 2. Localizar ejecutable de Node
set "NODE_EXE="
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "NODE_EXE=node"
) else if exist "%APPDATA%\Antigravity\bin\node.cmd" (
    set "NODE_EXE=%APPDATA%\Antigravity\bin\node.cmd"
) else if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
) else (
    echo [ERROR CRITICO] No se encontro Node.js en el sistema.
    echo Por favor instala Node.js desde https://nodejs.org/ o verifica tu PATH.
    echo.
    pause
    exit /b 1
)

:: 3. Informar estado al usuario
echo [OK] Node.js detectado correctamente.
echo.
echo Iniciando todos los componentes de la plataforma:
echo   1. Core Engine ^& Agentes Autonomos
echo   2. Base de Datos SQLite WAL ^& Durable EventStore
echo   3. Platform REST API v1 (/api/v1/*)
echo   4. Web Console Visual (Dashboard, Blueprint, AR Studio)
echo.
echo ===================================================================
echo.
echo  - Web Console:         http://127.0.0.1:3000
echo  - Platform API Health: http://127.0.0.1:3000/api/v1/health
echo.
echo [INFO] Presiona Ctrl + C en esta ventana para detener el servidor.
echo -------------------------------------------------------------------
echo.

:: 4. Abrir navegador automaticamente tras un breve instante
start http://127.0.0.1:3000

:: 5. Ejecutar el servidor compilado directamente
call !NODE_EXE! dist/src/platform/server.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo [AVISO] El servidor se ha detenido con codigo de salida %ERRORLEVEL%.
    pause
)
