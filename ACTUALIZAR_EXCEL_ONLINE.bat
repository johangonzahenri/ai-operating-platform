@echo off
title Sincronizador de Kanban y Metricas a Excel Online
echo ================================================================
echo   SINCRONIZANDO KANBAN Y METRICAS CON EXCEL ONLINE (ONEDRIVE)
echo ================================================================
echo.
python scripts/generate_roadmap_excel.py
echo.
echo ================================================================
echo [COMPLETADO] Archivo actualizado. OneDrive sincronizara los
echo cambios automaticamente con Excel Online en pocos segundos.
echo ================================================================
pause
