<#
.SYNOPSIS
    Backup-OneDriveToGDrive.ps1 - Respaldo y liberación automática de espacio en OneDrive hacia Google Drive.
    Desarrollado para AI Operating Platform.

.DESCRIPTION
    Monitorea el espacio ocupado en la carpeta de OneDrive. Si supera un umbral de GB configurado
    (o bajo demanda), transfiere/mueve archivos antiguos o pesados hacia la carpeta o unidad
    de Google Drive (o carpeta de respaldo designada), liberando espacio real en la cuenta y disco de OneDrive.

.PARAMETER SourcePath
    Ruta de origen de OneDrive (por defecto: $env:OneDrive).

.PARAMETER DestinationPath
    Ruta de destino en Google Drive o almacenamiento secundario.

.PARAMETER OlderThanDays
    Mover solo archivos con antigüedad mayor a X días (por defecto: 14 días). 0 para mover todos los candidatos.

.PARAMETER ThresholdGB
    Umbral de activación en GB (por defecto: 3.0 GB). Si el tamaño es menor, se omite salvo que se use -Force.

.PARAMETER MoveFiles
    Si es $true, mueve los archivos (los copia a Google Drive y los elimina de OneDrive para liberar espacio).

.PARAMETER DryRun
    Si es $true, solo simula y muestra qué archivos se moverían sin tocar nada.
#>

[CmdletBinding()]
param (
    [string]$SourcePath = $env:OneDrive,
    [string]$DestinationPath = "",
    [int]$OlderThanDays = 14,
    [double]$ThresholdGB = 3.0,
    [switch]$MoveFiles,
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Silent
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ScriptDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$ConfigFile = Join-Path $ScriptDir "config.json"

# Cargar configuracion persistente si existe
if (Test-Path $ConfigFile) {
    try {
        $SavedConfig = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if (-not $DestinationPath -and $SavedConfig.DestinationPath) {
            $DestinationPath = $SavedConfig.DestinationPath
        }
    } catch {}
}

# Auto-detectar ruta de Google Drive si no se especifico
if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
    # 1. Buscar unidad montada por Google Drive Desktop (habitualmente G:)
    $GDriveUnit = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -like "*G:*" -or $_.Description -like "*Google*" } | Select-Object -First 1
    if ($GDriveUnit) {
        $DestinationPath = Join-Path $GDriveUnit.Root "Mi unidad\Respaldos_OneDrive"
    } else {
        # 2. Buscar carpetas comunes
        $CommonPaths = @(
            "$env:USERPROFILE\Google Drive\Respaldos_OneDrive",
            "$env:USERPROFILE\GoogleDrive\Respaldos_OneDrive",
            "C:\GoogleDrive_Respaldos",
            "$env:USERPROFILE\Documents\Respaldos_Externos_GDrive"
        )
        foreach ($P in $CommonPaths) {
            if (Test-Path (Split-Path $P -Parent)) {
                $DestinationPath = $P
                break
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
        $DestinationPath = "$env:USERPROFILE\Documents\Respaldos_OneDrive_Para_GDrive"
    }
}

# Guardar configuracion
$ConfigObj = [ordered]@{
    SourcePath = $SourcePath
    DestinationPath = $DestinationPath
    OlderThanDays = $OlderThanDays
    ThresholdGB = $ThresholdGB
    LastRun = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}
$ConfigObj | ConvertTo-Json -Depth 3 | Set-Content -Path $ConfigFile -Encoding UTF8

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$LogFileJson = Join-Path $LogDir "backup_report_$Timestamp.json"
$LogFileMd   = Join-Path $LogDir "backup_report_$Timestamp.md"

function Write-StyledMessage {
    param([string]$Message, [string]$Type = "Info")
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

Write-StyledMessage "AI OPERATING PLATFORM - RESPALDO AUTOMATICO ONEDRIVE -> GDRIVE" "Header"
Write-StyledMessage "Origen OneDrive : $SourcePath" "Detail"
Write-StyledMessage "Destino GDrive  : $DestinationPath" "Detail"
Write-StyledMessage "Modo de accion  : $(if ($DryRun) { 'SIMULACION (Dry-Run)' } elseif ($MoveFiles) { 'MOVER Y LIBERAR ESPACIO EN ONEDRIVE' } else { 'COPIA DE SEGURIDAD' })" "Detail"

if (-not (Test-Path $SourcePath)) {
    Write-StyledMessage "La ruta de OneDrive no existe: $SourcePath" "Error"
    return
}

# Calcular peso total de OneDrive
Write-StyledMessage "Calculando espacio ocupado en OneDrive..." "Detail"
$AllFiles = Get-ChildItem -Path $SourcePath -Recurse -File -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notlike "*\.git\*" -and $_.FullName -notlike "*\node_modules\*" }

$TotalBytes = ($AllFiles | Measure-Object -Property Length -Sum).Sum
if (-not $TotalBytes) { $TotalBytes = 0 }
$TotalGB = [math]::Round($TotalBytes / 1GB, 2)

Write-StyledMessage "Espacio total ocupado en OneDrive: $TotalGB GB" "Detail"

if ($TotalGB -lt $ThresholdGB -and -not $Force) {
    Write-StyledMessage "El espacio ocupado ($TotalGB GB) es menor al umbral configurado ($ThresholdGB GB)." "Success"
    Write-StyledMessage "No se requiere migración forzada en este momento. (Usa -Force para omitir este umbral)." "Detail"
    return
}

# Filtrar archivos candidatos (antigüedad o carpetas pesadas)
$CutoffDate = (Get-Date).AddDays(-$OlderThanDays)
$CandidateFiles = $AllFiles | Where-Object { 
    ($OlderThanDays -eq 0 -or $_.LastWriteTime -lt $CutoffDate) -and
    ($_.FullName -notlike "*\IA_Work\*" -or $_.Extension -match "\.(zip|rar|iso|mp4|mov|mkv|pdf|docx|xlsx|pptx)$")
}

$CandidateBytes = ($CandidateFiles | Measure-Object -Property Length -Sum).Sum
if (-not $CandidateBytes) { $CandidateBytes = 0 }
$CandidateMB = [math]::Round($CandidateBytes / 1MB, 2)
$CandidateGB = [math]::Round($CandidateBytes / 1GB, 3)

Write-StyledMessage "Archivos candidatos para migrar : $($CandidateFiles.Count) archivos ($CandidateMB MB / ~$CandidateGB GB)" "Detail"

if ($CandidateFiles.Count -eq 0) {
    Write-StyledMessage "No hay archivos que cumplan los criterios de antigüedad ($OlderThanDays días)." "Success"
    return
}

if (-not $DryRun -and -not (Test-Path $DestinationPath)) {
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
}

$TransferredFiles = 0
$TransferredBytes = 0
$Errors = 0
$ItemsReport = @()

foreach ($File in $CandidateFiles) {
    # Mantener estructura relativa
    $RelativePath = $File.FullName.Substring($SourcePath.Length).TrimStart('\', '/')
    $TargetFilePath = Join-Path $DestinationPath $RelativePath
    $TargetDir = Split-Path $TargetFilePath -Parent

    if ($DryRun) {
        $TransferredFiles++
        $TransferredBytes += $File.Length
        $ItemsReport += [PSCustomObject]@{
            Archivo = $RelativePath
            TamanoMB = [math]::Round($File.Length / 1MB, 2)
            Estado = "Simulado"
        }
    } else {
        try {
            if (-not (Test-Path $TargetDir)) {
                New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
            }
            Copy-Item -LiteralPath $File.FullName -Destination $TargetFilePath -Force -ErrorAction Stop
            
            if ($MoveFiles) {
                # Eliminar de OneDrive solo tras copia exitosa
                Remove-Item -LiteralPath $File.FullName -Force -ErrorAction Stop
            }

            $TransferredFiles++
            $TransferredBytes += $File.Length
            $ItemsReport += [PSCustomObject]@{
                Archivo = $RelativePath
                TamanoMB = [math]::Round($File.Length / 1MB, 2)
                Estado = if ($MoveFiles) { "Movido y Liberado" } else { "Copiado" }
            }
        } catch {
            $Errors++
            $ItemsReport += [PSCustomObject]@{
                Archivo = $RelativePath
                TamanoMB = [math]::Round($File.Length / 1MB, 2)
                Estado = "Error: $_"
            }
        }
    }
}

$FreedMB = [math]::Round($TransferredBytes / 1MB, 2)
$FreedGB = [math]::Round($TransferredBytes / 1GB, 3)

Write-StyledMessage "RESUMEN DEL RESPALDO Y LIBERACION" "Header"
Write-StyledMessage "Total Archivos Procesados : $TransferredFiles" "Detail"
Write-StyledMessage "Espacio Transferido/Liberado: $FreedMB MB (~$FreedGB GB)" "Success"
if ($Errors -gt 0) { Write-StyledMessage "Errores encontrados: $Errors archivos" "Warning" }

# Guardar reportes
$ReportData = [ordered]@{
    Fecha = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Origen = $SourcePath
    Destino = $DestinationPath
    Modo = if ($DryRun) { "Simulacion" } elseif ($MoveFiles) { "Mover_Liberar" } else { "Copiar" }
    ArchivosProcesados = $TransferredFiles
    EspacioLiberadoMB = $FreedMB
    EspacioLiberadoGB = $FreedGB
    Errores = $Errors
}
$ReportData | ConvertTo-Json -Depth 3 | Set-Content -Path $LogFileJson -Encoding UTF8

$MdLines = @(
    "# Reporte de Respaldo y Liberación OneDrive -> Google Drive",
    "**Fecha:** $($ReportData.Fecha)  ",
    "**Modo:** $($ReportData.Modo)  ",
    "**Espacio Liberado en OneDrive:** $FreedMB MB ($FreedGB GB)  ",
    "**Destino Google Drive:** `$DestinationPath`  ",
    "**Archivos Transferidos:** $TransferredFiles",
    "",
    "## Archivos Procesados (Top 20)",
    "| Archivo | Tamaño (MB) | Estado |",
    "|---|---|---|"
)
foreach ($Item in ($ItemsReport | Select-Object -First 20)) {
    $MdLines += "| {0} | {1} MB | {2} |" -f $Item.Archivo, $Item.TamanoMB, $Item.Estado
}
$MdLines -join "`r`n" | Set-Content -Path $LogFileMd -Encoding UTF8

Write-StyledMessage "Reporte guardado en: $LogFileMd" "Success"
