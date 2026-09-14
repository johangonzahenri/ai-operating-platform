@echo off
title AI Operating Platform - Server
echo ========================================================
echo   Iniciando AI Operating Platform Control Plane...
echo ========================================================
cd /d "%~dp0"
if not exist "data" mkdir "data"
call npm start
pause
