#requires -Version 5.1
<#
.SYNOPSIS
  Post-install hook for Sasist Printer Agent (Inno Setup).
  Idempotent: safe on first install and upgrades.

  Inno Setup deploys binaries to $InstallDir before invoking this script.
  This script only prepares ProgramData, seeds config, registers/starts the service,
  and verifies shortcuts (Inno creates menu/desktop links).
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir,

    [switch]$SkipService
)

$ErrorActionPreference = "Stop"

$ServiceName = "SasistPrinterService"
$ServiceDisplayName = "Sasist Printer Service"
$ProgramDataDir = Join-Path $env:ProgramData "Sasist\PrinterAgent"
$LogsDir = Join-Path $ProgramDataDir "logs"
$ConfigPath = Join-Path $ProgramDataDir "config.json"

function Write-Step([string]$Message) {
    Write-Host "[Sasist] $Message" -ForegroundColor Cyan
}

function Wait-ServiceStatus([string]$Name, [string]$DesiredStatus, [int]$TimeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status.ToString() -eq $DesiredStatus) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Stop-ServiceSafe([string]$Name) {
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) {
        return
    }
    if ($svc.Status -eq "Running") {
        Write-Step "Zatrzymywanie usługi $Name"
        Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
        Wait-ServiceStatus -Name $Name -DesiredStatus "Stopped" | Out-Null
    }
}

function Configure-ServiceRecovery([string]$Name) {
    & sc.exe failure $Name reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
}

Write-Step "Konfiguracja po instalacji: $InstallDir"

if (-not (Test-Path $InstallDir)) {
    throw "Katalog instalacji nie istnieje: $InstallDir"
}

New-Item -ItemType Directory -Force -Path $ProgramDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

if (-not (Test-Path $ConfigPath)) {
    $exampleCandidates = @(
        (Join-Path $InstallDir "config\config.example.json"),
        (Join-Path $InstallDir "config.example.json")
    )
    $example = $exampleCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($example) {
        Write-Step "Tworzenie config.json z config.example.json"
        Copy-Item -Path $example -Destination $ConfigPath -Force
    } else {
        Write-Step "Brak config.example.json — tworzę minimalny config.json"
        @"
{
  "server_url": "",
  "tenant_id": 1,
  "warehouse_id": 1,
  "token": "",
  "machine_id": "",
  "agent_id": 0,
  "computer_name": "$($env:COMPUTERNAME)",
  "version": "1.0.0",
  "heartbeat_interval_sec": 30,
  "poll_interval_sec": 5
}
"@ | Set-Content -Path $ConfigPath -Encoding UTF8
    }
} else {
    Write-Step "Zachowano istniejący config.json"
}

$serviceExe = Join-Path $InstallDir "SasistPrinterService.exe"
$agentExe = Join-Path $InstallDir "SasistPrinterAgent.exe"
$updaterExe = Join-Path $InstallDir "SasistPrinterUpdater.exe"

foreach ($required in @($agentExe, $serviceExe, $updaterExe)) {
    if (-not (Test-Path $required)) {
        throw "Brak wymaganego pliku instalacyjnego: $required"
    }
}

if (-not $SkipService) {
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Step "Aktualizacja istniejącej instalacji usługi"
        Stop-ServiceSafe -Name $ServiceName
    } else {
        Write-Step "Pierwsza instalacja usługi Windows"
        & $serviceExe install
        if ($LASTEXITCODE -ne 0) {
            throw "Rejestracja usługi nie powiodła się (exit $LASTEXITCODE)"
        }
    }

    & sc.exe config $ServiceName start= auto | Out-Null
    & sc.exe description $ServiceName "Sasist local printing service." | Out-Null
    Configure-ServiceRecovery -Name $ServiceName

    Write-Step "Uruchamianie usługi $ServiceDisplayName"
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop
    } catch {
        Write-Step "Start-Service nie powiódł się, próba sc.exe start"
        & sc.exe start $ServiceName | Out-Null
    }

    if (-not (Wait-ServiceStatus -Name $ServiceName -DesiredStatus "Running" -TimeoutSec 30)) {
        Write-Warning "Usługa $ServiceName nie przeszła w stan Running w oczekiwanym czasie."
    }
}

Write-Step "Instalacja zakończona pomyślnie."
