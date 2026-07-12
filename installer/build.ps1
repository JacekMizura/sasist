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
$installerScript = Join-Path $RepoRoot "installer\installer.iss"

function Write-Step([string]$Message) {
    Write-Host "[build] $Message" -ForegroundColor Cyan
}

function Search-IsccOnDrives {
    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        $roots = @(
            Join-Path $drive.Root "Program Files (x86)",
            Join-Path $drive.Root "Program Files"
        )
        foreach ($root in $roots) {
            $candidate = Join-Path $root "Inno Setup 6\ISCC.exe"
            if (Test-Path -LiteralPath $candidate) {
                return $candidate
            }
        }
    }

    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        $found = Get-ChildItem -Path $drive.Root -Filter "ISCC.exe" -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like "*\Inno Setup 6\ISCC.exe" } |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
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

try {
    $iscc = (Get-Command ISCC.exe -ErrorAction Stop).Source
} catch {
    $iscc = $null
}

if (-not $iscc -or -not (Test-Path -LiteralPath $iscc)) {
    $iscc = Search-IsccOnDrives
}

if (-not $iscc) {
    throw "Inno Setup 6 (ISCC.exe) not found. Install from https://jrsoftware.org/isinfo.php or add ISCC.exe to PATH."
}

Write-Step "Using ISCC: $iscc"
Write-Step "Compiling installer..."
Set-Location $RepoRoot
& $iscc $installerScript
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed with exit code $LASTEXITCODE"
}

$setup = Get-ChildItem -Path $OutputRoot -Filter "SasistPrinterAgent-Setup-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $setup) {
    throw "Installer EXE not created. Expected: $OutputRoot\SasistPrinterAgent-Setup-*.exe"
}

Write-Step "Installer created: $($setup.FullName)"
