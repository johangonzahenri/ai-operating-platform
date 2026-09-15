@echo off
:: ============================================================================
:: Windows RAM Sentinel - Uninstallation Script
:: Terminates the active sentinel daemon and removes the scheduled task
:: ============================================================================
setlocal EnableDelayedExpansion
title Windows RAM Sentinel - Uninstaller

:: Check for Administrator Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required.
    echo [*] Requesting elevation...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================
echo     Windows RAM Sentinel - Uninstallation
echo ===================================================

set "TASK_NAME=WinRAMSentinel"

echo [*] Terminating running ram_daemon.pyw instances via PowerShell/WMI...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*ram_daemon.pyw*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo [*] Removing scheduled task '%TASK_NAME%'...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

if %errorLevel% equ 0 (
    echo [SUCCESS] Scheduled task deleted.
) else (
    echo [INFO] Scheduled task '%TASK_NAME%' was not registered or already removed.
)

echo.
echo [DONE] Windows RAM Sentinel has been completely uninstalled.
echo.
echo Press any key to exit.
pause >nul
