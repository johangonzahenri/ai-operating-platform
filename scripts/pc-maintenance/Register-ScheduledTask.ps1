<#
.SYNOPSIS
    Register-ScheduledTask.ps1 - Programa el mantenimiento automático en Windows.
    Desarrollado para AI Operating Platform.

.DESCRIPTION
    Crea, consulta o elimina una Tarea Programada en Windows para ejecutar
    Clean-PC.ps1 automáticamente en segundo plano.

.PARAMETER Action
    Accion a realizar: Register (crear), Unregister (eliminar), Status (consultar). Por defecto: Register.

.PARAMETER Frequency
    Frecuencia de ejecucion: Weekly (Semanal), Daily (Diaria). Por defecto: Weekly.

.PARAMETER DaysOfWeek
    Dia para ejecucion semanal (por ejemplo: SUN, SAT, MON). Por defecto: SUN.

.PARAMETER Time
    Hora de ejecucion (formato HH:mm). Por defecto: 18:00.

.PARAMETER DeepClean
    Si se incluye, la tarea programada ejecutara la limpieza profunda.

.EXAMPLE
    .\Register-ScheduledTask.ps1 -Action Register -Frequency Weekly -DaysOfWeek SUN -Time "18:00"
    .\Register-ScheduledTask.ps1 -Action Status
    .\Register-ScheduledTask.ps1 -Action Unregister
#>

[CmdletBinding()]
param (
    [ValidateSet("Register", "Unregister", "Status")]
    [string]$Action = "Register",

    [ValidateSet("Weekly", "Daily")]
    [string]$Frequency = "Weekly",

    [string]$DaysOfWeek = "SUN",
    [string]$Time = "18:00",
    [switch]$DeepClean
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TaskName = "AIPlatform_AutoClean_PC"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CleanScriptPath = Join-Path $ScriptDir "Clean-PC.ps1"

# Verificar privilegios de administrador para acciones de modificacion
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (($Action -in @("Register", "Unregister")) -and (-not $isAdmin)) {
    Write-Warning "Para registrar o modificar tareas en Windows se requieren permisos de Administrador."
    Write-Host "Por favor, vuelve a ejecutar este script en una consola de PowerShell iniciada como Administrador o usa Ejecutar-Limpieza.bat." -ForegroundColor Red
    return
}

switch ($Action) {
    "Status" {
        Write-Host "Consultando estado de la tarea '$TaskName'..." -ForegroundColor Cyan
        $TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($TaskExists) {
            Write-Host "[OK] La tarea '$TaskName' está registrada." -ForegroundColor Green
            Write-Host "Estado actual: $($TaskExists.State)" -ForegroundColor Yellow
            $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
            if ($TaskInfo) {
                Write-Host "Ultima ejecucion: $($TaskInfo.LastRunTime)"
                Write-Host "Proxima ejecucion: $($TaskInfo.NextRunTime)"
                Write-Host "Ultimo resultado: $($TaskInfo.LastTaskResult)"
            }
        } else {
            Write-Host "[!] La tarea '$TaskName' no está registrada actualmente." -ForegroundColor Yellow
        }
    }

    "Unregister" {
        Write-Host "Eliminando tarea '$TaskName'..." -ForegroundColor Cyan
        $TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($TaskExists) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "[OK] Tarea '$TaskName' eliminada correctamente." -ForegroundColor Green
        } else {
            Write-Host "[!] La tarea '$TaskName' no existía." -ForegroundColor Yellow
        }
    }

    "Register" {
        Write-Host "Configurando tarea programada '$TaskName'..." -ForegroundColor Cyan

        # Argumentos para powershell.exe
        $Params = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$CleanScriptPath`" -Silent"
        if ($DeepClean) {
            $Params += " -DeepClean"
        }

        $TaskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Params

        if ($Frequency -eq "Daily") {
            $Trigger = New-ScheduledTaskTrigger -Daily -At $Time
        } else {
            $DayEnum = [System.DayOfWeek]::Sunday
            switch ($DaysOfWeek.ToUpper()) {
                "MON" { $DayEnum = [System.DayOfWeek]::Monday }
                "TUE" { $DayEnum = [System.DayOfWeek]::Tuesday }
                "WED" { $DayEnum = [System.DayOfWeek]::Wednesday }
                "THU" { $DayEnum = [System.DayOfWeek]::Thursday }
                "FRI" { $DayEnum = [System.DayOfWeek]::Friday }
                "SAT" { $DayEnum = [System.DayOfWeek]::Saturday }
                "SUN" { $DayEnum = [System.DayOfWeek]::Sunday }
            }
            $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayEnum -At $Time
        }

        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

        # Registrar / Sobrescribir tarea
        Register-ScheduledTask -TaskName $TaskName `
                               -Action $TaskAction `
                               -Trigger $Trigger `
                               -Settings $Settings `
                               -Description "Limpieza y mantenimiento periodico autonomo del sistema por AI Operating Platform" `
                               -Force | Out-Null

        Write-Host "[OK] Tarea '$TaskName' registrada exitosamente!" -ForegroundColor Green
        Write-Host "     Frecuencia: $Frequency ($DaysOfWeek a las $Time)" -ForegroundColor White
        Write-Host "     Modo: $(if ($DeepClean) { 'Limpieza Profunda' } else { 'Limpieza Estandar' })" -ForegroundColor White
        Write-Host "     Script destino: $CleanScriptPath" -ForegroundColor White
    }
}
