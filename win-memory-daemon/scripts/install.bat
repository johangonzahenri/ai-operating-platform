@echo off
:: ============================================================================
:: Windows RAM Sentinel - Automated Installation Script
:: Registers and launches the background daemon as a high-privilege scheduled task
:: ============================================================================
setlocal EnableDelayedExpansion
title Windows RAM Sentinel - Installer

:: Check for Administrator Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required.
    echo [*] Requesting elevation...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================
echo     Windows RAM Sentinel - Setup & Registration
echo ===================================================

:: Resolve absolute paths
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "DAEMON_PATH=%ROOT_DIR%\src\ram_daemon.pyw"

if not exist "%DAEMON_PATH%" (
    echo [ERROR] Could not find ram_daemon.pyw at: "%DAEMON_PATH%"
    pause
    exit /b 1
)

:: Find pythonw.exe in PATH, py launcher, or registry
set "PYTHONW_PATH="

:: Try finding pythonw directly in PATH
where pythonw.exe >nul 2>&1
if %errorLevel% equ 0 (
    for /f "delims=" %%I in ('where pythonw.exe') do (
        if not defined PYTHONW_PATH set "PYTHONW_PATH=%%I"
    )
)

:: If not in PATH, ask Python Launcher (py.exe) for the executable path
if "!PYTHONW_PATH!"=="" (
    where py.exe >nul 2>&1
    if %errorLevel% equ 0 (
        for /f "delims=" %%I in ('py -c "import sys, os; print(os.path.join(sys.prefix, 'pythonw.exe'))"') do (
            if exist "%%I" set "PYTHONW_PATH=%%I"
        )
    )
)

:: If still not found, search common directories
if "!PYTHONW_PATH!"=="" (
    echo [WARNING] pythonw.exe was not found in standard PATH.
    echo [*] Searching common installation paths...
    
    for %%V in (313 312 311 310 39 38) do (
        if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\pythonw.exe" set "PYTHONW_PATH=%LOCALAPPDATA%\Programs\Python\Python%%V\pythonw.exe"
        if exist "C:\Python%%V\pythonw.exe" set "PYTHONW_PATH=C:\Python%%V\pythonw.exe"
        if exist "%ProgramFiles%\Python%%V\pythonw.exe" set "PYTHONW_PATH=%ProgramFiles%\Python%%V\pythonw.exe"
    )

    if "!PYTHONW_PATH!"=="" (
        echo [ERROR] Python was not detected on this system. Please install Python 3.8+ and add it to PATH.
        pause
        exit /b 1
    )
)

echo [*] Target Daemon : %DAEMON_PATH%
echo [*] Python Runtime: %PYTHONW_PATH%

set "TASK_NAME=WinRAMSentinel"
set "TASK_ACTION=\"%PYTHONW_PATH%\" \"%DAEMON_PATH%\""

echo [*] Registering scheduled task: %TASK_NAME%...
schtasks /create /tn "%TASK_NAME%" /tr "%TASK_ACTION%" /sc onlogon /rl highest /f

if %errorLevel% equ 0 (
    echo [*] Starting sentinel task immediately...
    schtasks /run /tn "%TASK_NAME%"
    echo.
    echo [SUCCESS] Windows RAM Sentinel has been successfully installed and activated!
    echo           It will automatically start whenever any user logs on.
) else (
    echo.
    echo [ERROR] Failed to register the scheduled task. Error code: %errorLevel%
)

echo.
echo Press any key to exit.
pause >nul
