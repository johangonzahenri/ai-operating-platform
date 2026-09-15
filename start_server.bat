@echo off
title AI Operating Platform - Control Plane Server
cls

echo ========================================================
echo         AI OPERATING PLATFORM - CONTROL PLANE
echo ========================================================
echo.
echo [1/3] Verificando dependencias y entorno...

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js (v18 o superior) desde https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [2/3] Compilando TypeScript (Build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] La compilacion de TypeScript ha fallado.
    echo.
    pause
    exit /b 1
)

echo [3/3] Iniciando servidor de la plataforma...
echo.
echo  - Web Console:         http://127.0.0.1:3000
echo  - Platform API Health: http://127.0.0.1:3000/api/v1/health
echo.
echo Presiona Ctrl+C para detener el servidor en cualquier momento.
echo --------------------------------------------------------
echo.

node dist/src/platform/server.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo [AVISO] El servidor se ha detenido con codigo de salida %ERRORLEVEL%.
    pause
)
