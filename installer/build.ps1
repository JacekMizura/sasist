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
$BuildRoot = Join-Path $AgentRoot "build"
$OutputRoot = Join-Path $RepoRoot "Output"
$installerScript = Join-Path $RepoRoot "installer\installer.iss"

function Write-Step([string]$Message) {
    Write-Host "[build] $Message" -ForegroundColor Cyan
}

function Write-FileSha256([string]$Label, [string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Host "[build] SHA256 $Label : MISSING ($Path)" -ForegroundColor Yellow
        return $null
    }
    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "[build] SHA256 $Label : $hash" -ForegroundColor Green
    Write-Host "[build]           path : $Path"
    return $hash
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

Write-Step "Cleaning stale PyInstaller artifacts..."
Remove-Item $BuildRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $DistRoot -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $AgentRoot -Filter "*.spec.cache" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

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

$agentExe = Join-Path $DistRoot "SasistPrinterAgent.exe"
$localAgentHash = Write-FileSha256 "SasistPrinterAgent.exe (local build)" $agentExe

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
$localSetupHash = Write-FileSha256 "SasistPrinterAgent-Setup (local build)" $setup.FullName

Write-Step "Optional: compare with GitHub Release (requires internet)..."
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/JacekMizura/sasist/releases/latest" `
        -Headers @{ "User-Agent" = "sasist-build"; "Accept" = "application/vnd.github+json" } `
        -TimeoutSec 20
    $asset = $release.assets | Where-Object { $_.name -like "SasistPrinterAgent-Setup*.exe" } | Select-Object -First 1
    if ($asset) {
        $githubDir = Join-Path $OutputRoot "_github_compare"
        New-Item -ItemType Directory -Force -Path $githubDir | Out-Null
        $githubSetupPath = Join-Path $githubDir $asset.name
        Write-Step "Downloading GitHub asset: $($asset.name)"
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $githubSetupPath -TimeoutSec 120
        $githubSetupHash = Write-FileSha256 "SasistPrinterAgent-Setup (GitHub release)" $githubSetupPath

        if ($localSetupHash -and $githubSetupHash) {
            if ($localSetupHash -eq $githubSetupHash) {
                Write-Host "[build] Setup hash MATCH — GitHub release matches this build." -ForegroundColor Green
            } else {
                Write-Host "[build] Setup hash MISMATCH — GitHub release contains a different (likely older) installer." -ForegroundColor Red
                Write-Host "[build] Upload the new Output\$($setup.Name) to GitHub Releases." -ForegroundColor Yellow
            }
        }

        # Best-effort: extract inner SasistPrinterAgent.exe via 7-Zip if available.
        $sevenZip = @(
            "${env:ProgramFiles}\7-Zip\7z.exe",
            "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1

        if ($sevenZip) {
            $extractDir = Join-Path $githubDir "extracted"
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
            & $sevenZip x $githubSetupPath "-o$extractDir" -y | Out-Null
            $githubAgent = Get-ChildItem -Path $extractDir -Filter "SasistPrinterAgent.exe" -Recurse -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($githubAgent) {
                $githubAgentHash = Write-FileSha256 "SasistPrinterAgent.exe (GitHub release)" $githubAgent.FullName
                if ($localAgentHash -and $githubAgentHash) {
                    if ($localAgentHash -eq $githubAgentHash) {
                        Write-Host "[build] Agent EXE hash MATCH." -ForegroundColor Green
                    } else {
                        Write-Host "[build] Agent EXE hash MISMATCH — release ships stale SasistPrinterAgent.exe." -ForegroundColor Red
                    }
                }
            } else {
                Write-Host "[build] Could not locate SasistPrinterAgent.exe inside GitHub setup (7-Zip extract)." -ForegroundColor Yellow
            }
        } else {
            Write-Host "[build] 7-Zip not found — skipping inner EXE hash comparison." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[build] No SasistPrinterAgent-Setup*.exe asset on latest GitHub release." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[build] GitHub compare skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}
