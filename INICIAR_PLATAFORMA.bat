@echo off
setlocal
title AI Operating Platform - Servidor Unificado
cls

echo ===================================================================
echo             AI OPERATING PLATFORM - SERVIDOR UNIFICADO
echo ===================================================================
echo.
echo Este script inicia TODOS los componentes de la plataforma:
echo   1. Core Engine ^& Agentes Autonomos
echo   2. Base de Datos SQLite WAL ^& Durable EventStore
echo   3. Platform REST API v1 (/api/v1/*)
echo   4. Web Console Visual (Dashboard, Blueprint, AR Studio)
echo.
echo ===================================================================
echo.

:: 1. Verificar si Node.js esta instalado
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR CRITICO] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js (v18 o superior) desde https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Si no esta compilado el proyecto, compilarlo una vez
if not exist "dist\src\platform\server.js" (
    echo [Paso 1/2] Compilando codigo fuente TypeScript...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] Fallo la compilacion de TypeScript.
        pause
        exit /b 1
    )
    echo Compilacion exitosa.
    echo.
)

:: 3. Iniciar el servidor
echo [Paso 2/2] Iniciando Servidor de la Plataforma en http://127.0.0.1:3000 ...
echo.
echo  - Web Console:         http://127.0.0.1:3000
echo  - Platform API Health: http://127.0.0.1:3000/api/v1/health
echo.
echo [INFO] Para detener el servidor presiona Ctrl + C en esta ventana.
echo -------------------------------------------------------------------
echo.

:: Abrir navegador automaticamente
start http://127.0.0.1:3000

:: Ejecutar servidor en primer plano
node dist/src/platform/server.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo [AVISO] El servidor se detuvo con codigo de error %ERRORLEVEL%.
    pause
)
