@echo off
title AI Operating Platform - Dev Server (Live TSX)
cls

echo ========================================================
echo   AI OPERATING PLATFORM - DEV SERVER (TSX LIVE)
echo ========================================================
echo.
echo Iniciando servidor en modo directo con TSX...
echo.
echo  - Web Console:         http://127.0.0.1:3000
echo  - Platform API Health: http://127.0.0.1:3000/api/v1/health
echo.

npx tsx src/platform/server.ts

if %ERRORLEVEL% neq 0 (
    echo.
    echo [AVISO] El servidor se ha detenido con codigo de salida %ERRORLEVEL%.
    pause
)
