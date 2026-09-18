<#
.SYNOPSIS
    Clean-PC.ps1 - Suite de Mantenimiento y Optimización de Disco para Windows.
    Desarrollado para AI Operating Platform.

.DESCRIPTION
    Realiza una limpieza profunda y segura de archivos temporales, cachés de sistema,
    volcados de memoria, cachés de navegadores, cachés de desarrollo y papelera de reciclaje,
    calculando el espacio total liberado sin requerir programas de pago ni de terceros.

.PARAMETER DryRun
    Si se activa ($true), analiza el espacio y muestra lo que se liberaría SIN borrar nada.

.PARAMETER DeepClean
    Si se activa ($true), incluye la limpieza de Windows Update Cache, Prefetch y cachés de desarrollo.

.PARAMETER Silent
    Si se activa ($true), suprime la salida interactiva y solo genera el archivo de log.

.PARAMETER LogPath
    Ruta donde guardar el reporte generado (por defecto: scripts/pc-maintenance/logs/).

.EXAMPLE
    .\Clean-PC.ps1 -DryRun
    .\Clean-PC.ps1 -DeepClean
    .\Clean-PC.ps1 -Silent
#>

[CmdletBinding()]
param (
    [switch]$DryRun,
    [switch]$DeepClean,
    [switch]$Silent,
    [string]$LogPath = ""
)

# Configurar salida UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Determinar si corre como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Carpetas y Logs
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($LogPath)) {
    $LogDir = Join-Path $ScriptDir "logs"
} else {
    $LogDir = $LogPath
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$LogFileJson = Join-Path $LogDir "maintenance_report_$Timestamp.json"
$LogFileMd   = Join-Path $LogDir "maintenance_report_$Timestamp.md"

function Write-StyledMessage {
    param(
        [string]$Message,
        [string]$Type = "Info"
    )
    if ($Silent) { return }

    switch ($Type) {
        "Header"  { Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
        "Success" { Write-Host " [OK] $Message" -ForegroundColor Green }
        "Warning" { Write-Host " [!] $Message" -ForegroundColor Yellow }
        "Error"   { Write-Host " [X] $Message" -ForegroundColor Red }
        "Detail"  { Write-Host "     $Message" -ForegroundColor Gray }
        Default   { Write-Host " [*] $Message" -ForegroundColor White }
    }
}

# Medición inicial de disco C:
$DriveC = Get-PSDrive C -ErrorAction SilentlyContinue
$FreeBytesBefore = if ($DriveC) { $DriveC.Free } else { 0 }

Write-StyledMessage "AI OPERATING PLATFORM - SUITE DE MANTENIMIENTO WINDOWS" "Header"
Write-StyledMessage "Modo: $(if ($DryRun) { 'SIMULACION (Dry-Run)' } else { 'LIMPIEZA REAL' }) | Nivel: $(if ($DeepClean) { 'PROFUNDA' } else { 'ESTANDAR' })" "Detail"
Write-StyledMessage "Privilegios: $(if ($isAdmin) { 'ADMINISTRADOR' } else { 'USUARIO ESTANDAR (Algunas rutas requeriran admin)' })" "Detail"
Write-StyledMessage "Espacio libre inicial en C: $([math]::Round($FreeBytesBefore / 1GB, 2)) GB" "Detail"

# Contenedor de estadísticas
$Stats = [ordered]@{
    Fecha = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Modo = if ($DryRun) { "Simulacion" } else { "Limpieza" }
    Tipo = if ($DeepClean) { "Profunda" } else { "Estandar" }
    EsAdmin = $isAdmin
    EspacioInicialGB = [math]::Round($FreeBytesBefore / 1GB, 2)
    TotalBytesLiberados = 0
    ArchivosEliminados = 0
    Secciones = @()
}

function Clean-DirectoryContent {
    param(
        [string]$Path,
        [string]$CategoryName,
        [int]$OlderThanDays = 0,
        [string]$Filter = "*"
    )

    if (-not (Test-Path $Path)) {
        return @{ Bytes = 0; Files = 0 }
    }

    $CutoffDate = (Get-Date).AddDays(-$OlderThanDays)
    $BytesFreed = 0
    $FileCount = 0

    try {
        $Items = Get-ChildItem -Path $Path -Filter $Filter -Recurse -Force -File -ErrorAction SilentlyContinue |
                 Where-Object { $_.LastWriteTime -lt $CutoffDate }

        if ($Items) {
            foreach ($Item in $Items) {
                $ItemSize = $Item.Length
                if ($DryRun) {
                    $BytesFreed += $ItemSize
                    $FileCount++
                } else {
                    try {
                        Remove-Item -LiteralPath $Item.FullName -Force -ErrorAction Stop
                        $BytesFreed += $ItemSize
                        $FileCount++
                    } catch {
                        # Archivo en uso o protegido; se ignora con seguridad
                    }
                }
            }
        }

        # Intentar eliminar carpetas vacias secundarias
        if (-not $DryRun) {
            Get-ChildItem -Path $Path -Recurse -Force -Directory -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Where-Object { (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0 } |
                Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    } catch {
        Write-StyledMessage "No se pudo procesar $CategoryName ($Path): $_" "Warning"
    }

    return @{ Bytes = $BytesFreed; Files = $FileCount }
}

# --- LISTA DE TAREAS DE LIMPIEZA ---

$RawCleaningTasks = @(
    @{ Name = "Temporales de Usuario (%TEMP%)"; Path = $env:TEMP; OlderDays = 0; RequireAdmin = $false },
    @{ Name = "Reportes de Error de Usuario (CrashDumps)"; Path = "$env:LOCALAPPDATA\CrashDumps"; OlderDays = 1; RequireAdmin = $false },
    @{ Name = "Cache de Miniaturas Explorer"; Path = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"; Filter = "thumbcache_*.db"; OlderDays = 0; RequireAdmin = $false },
    @{ Name = "Temporales de Google Chrome"; Path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"; OlderDays = 0; RequireAdmin = $false },
    @{ Name = "Temporales de Microsoft Edge"; Path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"; OlderDays = 0; RequireAdmin = $false },
    @{ Name = "Temporales de Brave Browser"; Path = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache"; OlderDays = 0; RequireAdmin = $false },
    @{ Name = "Temporales de Mozilla Firefox"; Path = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles"; Filter = "cache2"; OlderDays = 0; RequireAdmin = $false }
)

if ($isAdmin) {
    $RawCleaningTasks += @{ Name = "Temporales del Sistema (Windows\Temp)"; Path = "$env:SystemRoot\Temp"; OlderDays = 0; RequireAdmin = $true }
    $RawCleaningTasks += @{ Name = "Reportes de Error del Sistema (WER)"; Path = "$env:ProgramData\Microsoft\Windows\WER"; OlderDays = 1; RequireAdmin = $true }
}

if ($DeepClean) {
    if ($isAdmin) {
        $RawCleaningTasks += @{ Name = "Cache de Descargas de Windows Update"; Path = "$env:SystemRoot\SoftwareDistribution\Download"; OlderDays = 0; RequireAdmin = $true }
        $RawCleaningTasks += @{ Name = "Archivos Prefetch de Windows"; Path = "$env:SystemRoot\Prefetch"; OlderDays = 14; RequireAdmin = $true }
    }
    # Caches de desarrollo frecuentes en entornos de programadores
    $RawCleaningTasks += @{ Name = "Cache npm (.npm / npm-cache)"; Path = "$env:LOCALAPPDATA\npm-cache"; OlderDays = 7; RequireAdmin = $false }
    $RawCleaningTasks += @{ Name = "Cache pip (Python)"; Path = "$env:LOCALAPPDATA\pip\cache"; OlderDays = 7; RequireAdmin = $false }
    $RawCleaningTasks += @{ Name = "Cache VS Code (Cache / CachedData)"; Path = "$env:APPDATA\Code\Cache"; OlderDays = 7; RequireAdmin = $false }
}

# Deduplicar tareas por ruta normalizada
$SeenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$CleaningTasks = @()

foreach ($T in $RawCleaningTasks) {
    if (-not [string]::IsNullOrWhiteSpace($T.Path)) {
        $NormPath = [System.IO.Path]::GetFullPath($T.Path)
        $Key = "$NormPath|$($T.Filter)"
        if ($SeenPaths.Add($Key)) {
            $T.Path = $NormPath
            $CleaningTasks += $T
        }
    }
}

# --- EJECUCIÓN DE LIMPIEZA POR SECCIÓN ---

Write-StyledMessage "Iniciando escaneo y optimización de directorios..." "Header"

foreach ($Task in $CleaningTasks) {
    $Filter = if ($Task.Filter) { $Task.Filter } else { "*" }
    $Result = Clean-DirectoryContent -Path $Task.Path -CategoryName $Task.Name -OlderThanDays $Task.OlderDays -Filter $Filter
    
    $MBFreed = [math]::Round($Result.Bytes / 1MB, 2)
    $Stats.TotalBytesLiberados += $Result.Bytes
    $Stats.ArchivosEliminados += $Result.Files

    $SectionSummary = [PSCustomObject]@{
        Categoria = $Task.Name
        Ruta = $Task.Path
        Archivos = $Result.Files
        MB = $MBFreed
    }
    $Stats.Secciones += $SectionSummary

    if ($Result.Files -gt 0) {
        Write-StyledMessage "$($Task.Name): $MBFreed MB liberados ($($Result.Files) archivos)" "Success"
    } else {
        Write-StyledMessage "$($Task.Name): Limpio o sin archivos candidatos" "Detail"
    }
}

# --- LIMPIEZA DE PAPELERA DE RECICLAJE ---
if (-not $DryRun) {
    Write-StyledMessage "Vaciando Papelera de Reciclaje..." "Header"
    try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
        Write-StyledMessage "Papelera de reciclaje vaciada exitosamente" "Success"
    } catch {
        Write-StyledMessage "No se pudo vaciar la papelera: $_" "Warning"
    }
}

# --- VACIADO DE CACHE DNS ---
if (-not $DryRun) {
    Write-StyledMessage "Optimizando red (Flush DNS)..." "Header"
    try {
        Clear-DnsClientCache -ErrorAction SilentlyContinue
        Write-StyledMessage "Caché DNS resuelta y limpiada correctamente" "Success"
    } catch {
        Write-StyledMessage "No se pudo limpiar la caché DNS: $_" "Warning"
    }
}

# --- OPTIMIZACIÓN DE MEMORIA RAM ---
if (-not $DryRun) {
    Write-StyledMessage "Optimizando memoria RAM (Purga de Working Sets inactivos)..." "Header"
    $ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent
    $DaemonScript = Join-Path $ProjectRoot "win-memory-daemon\src\ram_daemon.pyw"
    if (Test-Path $DaemonScript) {
        try {
            $RamOutput = & python "$DaemonScript" --once 2>&1
            foreach ($Line in $RamOutput) {
                Write-StyledMessage $Line "Detail"
            }
        } catch {
            Write-StyledMessage "No se pudo invocar el optimizador de RAM: $_" "Warning"
        }
    }
}

# --- MEDICIÓN FINAL ---
$DriveCAfter = Get-PSDrive C -ErrorAction SilentlyContinue
$FreeBytesAfter = if ($DriveCAfter) { $DriveCAfter.Free } else { $FreeBytesBefore }
$Stats.EspacioFinalGB = [math]::Round($FreeBytesAfter / 1GB, 2)
$Stats.TotalMBLiberados = [math]::Round($Stats.TotalBytesLiberados / 1MB, 2)
$Stats.TotalGBLiberados = [math]::Round($Stats.TotalBytesLiberados / 1GB, 3)

Write-StyledMessage "RESUMEN DE RESULTADOS" "Header"
Write-StyledMessage "Total Archivos Procesados: $($Stats.ArchivosEliminados)" "Detail"
$LabelEspacio = if ($DryRun) { "Espacio Simulado (recuperable)" } else { "Espacio Total Liberado" }
Write-StyledMessage "$($LabelEspacio): $($Stats.TotalMBLiberados) MB (~$($Stats.TotalGBLiberados) GB)" "Success"
Write-StyledMessage "Espacio Libre Final en C: $($Stats.EspacioFinalGB) GB" "Detail"

# --- GENERAR REPORTES ---
# JSON
$Stats | ConvertTo-Json -Depth 4 | Set-Content -Path $LogFileJson -Encoding UTF8

# Markdown
$MdLines = @(
    "# Reporte de Mantenimiento de Sistema",
    "**Fecha:** $($Stats.Fecha)",
    "**Modo:** $($Stats.Modo) ($($Stats.Tipo))",
    "**Espacio Estimado:** $($Stats.TotalMBLiberados) MB ($($Stats.TotalGBLiberados) GB)",
    "**Espacio Libre en C:** $($Stats.EspacioFinalGB) GB (Antes: $($Stats.EspacioInicialGB) GB)",
    "**Archivos Procesados:** $($Stats.ArchivosEliminados)",
    "",
    "## Detalle por Categoria",
    "| Categoria | Archivos | Espacio (MB) | Ruta |",
    "|---|---|---|---|"
)

foreach ($Sec in $Stats.Secciones) {
    $MdLines += "| {0} | {1} | {2} MB | `{3}` |" -f $Sec.Categoria, $Sec.Archivos, $Sec.MB, $Sec.Ruta
}

$MdLines += ""
$MdLines += "---"
$MdLines += "*Generado automaticamente por el motor de mantenimiento de AI Operating Platform.*"

$MdLines -join "`r`n" | Set-Content -Path $LogFileMd -Encoding UTF8

Write-StyledMessage "Reporte guardado en: $LogFileMd" "Success"

