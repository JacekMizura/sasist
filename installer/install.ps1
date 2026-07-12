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

$encodingLib = Join-Path $PSScriptRoot "lib\ps-encoding.ps1"
if (-not (Test-Path -LiteralPath $encodingLib)) {
    $encodingLib = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\lib\ps-encoding.ps1"
}
. $encodingLib

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
        $defaultVersion = "1.0.1"
        $buildInfoPath = Join-Path $InstallDir "build_info.json"
        if (Test-Path -LiteralPath $buildInfoPath) {
            try {
                $buildInfo = Get-Content -LiteralPath $buildInfoPath -Raw | ConvertFrom-Json
                if ($buildInfo.version) {
                    $defaultVersion = [string]$buildInfo.version
                }
            } catch {
                Write-Step "Nie udało się odczytać wersji z build_info.json — używam domyślnej"
            }
        }
        @"
{
  "server_url": "",
  "api_key": "",
  "token": "",
  "machine_id": "",
  "agent_id": 0,
  "computer_name": "$($env:COMPUTERNAME)",
  "version": "$defaultVersion",
  "heartbeat_interval_sec": 30,
  "poll_interval_sec": 5
}
"@ | Set-Content -Path $ConfigPath -Encoding (Get-Utf8Encoding)
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

$legacyDesktopLinks = @(
    (Join-Path $env:PUBLIC "Desktop\Sasist Printer Logs.lnk"),
    (Join-Path $env:PUBLIC "Desktop\Sasist Printer Config.lnk")
)
foreach ($link in $legacyDesktopLinks) {
    if (Test-Path -LiteralPath $link) {
        Write-Step "Usuwanie przestarzałego skrótu: $link"
        Remove-Item -LiteralPath $link -Force
    }
}

function Refresh-WindowsIconCache {
    $ie4uinit = Join-Path $env:SystemRoot "System32\ie4uinit.exe"
    if (Test-Path -LiteralPath $ie4uinit) {
        Write-Step "Odświeżanie cache ikon Windows (ie4uinit)"
        & $ie4uinit.exe -show | Out-Null
    }
}

function New-AgentShortcut {
    param(
        [string]$ShortcutPath,
        [string]$TargetPath,
        [string]$IconPath,
        [string]$Description
    )
    if (-not (Test-Path -LiteralPath $TargetPath)) {
        return
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    if (Test-Path -LiteralPath $IconPath) {
        $shortcut.IconLocation = "$IconPath,0"
    }
    $shortcut.Description = $Description
    $shortcut.WorkingDirectory = Split-Path -Parent $TargetPath
    $shortcut.Save()
}

$iconPath = Join-Path $InstallDir "assets\icon.ico"
$desktopLink = Join-Path $env:PUBLIC "Desktop\Sasist Printer Agent.lnk"
$startMenuDir = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Sasist Printer Agent"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
$startMenuLink = Join-Path $startMenuDir "Sasist Printer Agent.lnk"

Write-Step "Odtwarzanie skrótów z aktualną ikoną"
New-AgentShortcut -ShortcutPath $desktopLink -TargetPath $agentExe -IconPath $iconPath -Description "Sasist Printer Agent"
New-AgentShortcut -ShortcutPath $startMenuLink -TargetPath $agentExe -IconPath $iconPath -Description "Sasist Printer Agent"
Refresh-WindowsIconCache
