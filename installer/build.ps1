#requires -Version 5.1
<#
.SYNOPSIS
  Build Sasist Printer Agent installer (PyInstaller + Inno Setup).

  Usage (from repository root):
    powershell -ExecutionPolicy Bypass -File installer\build.ps1
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AgentRoot = Join-Path $RepoRoot "sasist-printer-agent"
$DistRoot = Join-Path $AgentRoot "dist"
$OutputRoot = Join-Path $RepoRoot "Output"
$IssFile = Join-Path $RepoRoot "installer\installer.iss"

function Write-Step([string]$Message) {
    Write-Host "[build] $Message" -ForegroundColor Cyan
}

function Find-InnoSetup {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

Write-Step "Repository: $RepoRoot"
Set-Location $AgentRoot

Write-Step "PyInstaller: agent.spec"
python -m PyInstaller agent.spec
Write-Step "PyInstaller: service.spec"
python -m PyInstaller service.spec
Write-Step "PyInstaller: updater.spec"
python -m PyInstaller updater.spec

$required = @(
    "SasistPrinterAgent.exe",
    "SasistPrinterService.exe",
    "SasistPrinterUpdater.exe"
)
foreach ($name in $required) {
    $path = Join-Path $DistRoot $name
    if (-not (Test-Path $path)) {
        throw "Missing build artifact: $path"
    }
}

$iscc = Find-InnoSetup
if (-not $iscc) {
    throw "Inno Setup 6 (ISCC.exe) not found. Install from https://jrsoftware.org/isinfo.php"
}

Write-Step "Inno Setup: installer.iss"
Set-Location $RepoRoot
& $iscc $IssFile

$setup = Get-ChildItem -Path $OutputRoot -Filter "SasistPrinterAgent-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
    throw "Installer EXE not found in $OutputRoot"
}

Write-Step "Done: $($setup.FullName)"
