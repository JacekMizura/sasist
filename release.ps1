#requires -Version 5.1
<#
.SYNOPSIS
  Fully automated Sasist Printer Agent release (version bump → commit → build → GitHub Release → verify).

  Prerequisites:
    gh auth login

  Usage (from repository root):
    powershell -ExecutionPolicy Bypass -File release.ps1 -Version 1.0.6
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$PublishScript = Join-Path $RepoRoot "scripts\lib\publish-agent-github-release.ps1"

function Write-ReleaseStep([string]$Message) {
    Write-Host "[release] $Message" -ForegroundColor Cyan
}

function Invoke-ReleaseStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-ReleaseStep "==> $Name"
    try {
        & $Action
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "Step exited with code $LASTEXITCODE"
        }
    } catch {
        Write-Host ""
        Write-Host "[release] FAILED: $Name" -ForegroundColor Red
        Write-Host "[release] $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

$normalized = $Version.Trim().TrimStart("v")
if ($normalized -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "[release] Version must use semver format x.y.z (example: 1.0.6)" -ForegroundColor Red
    exit 1
}

Write-ReleaseStep "Starting Printer Agent release v$normalized"

Invoke-ReleaseStep "Bump version" {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\bump-version.ps1") $normalized
}

Invoke-ReleaseStep "Git commit and push" {
    Push-Location $RepoRoot
    try {
        git add .
        git diff --cached --quiet
        if ($LASTEXITCODE -eq 0) {
            throw "No staged changes after version bump - nothing to commit."
        }
        git commit -m "Printer Agent v$normalized"
        if ($LASTEXITCODE -ne 0) {
            throw "git commit failed (exit $LASTEXITCODE)"
        }
        git push
        if ($LASTEXITCODE -ne 0) {
            throw "git push failed (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

Invoke-ReleaseStep "Build installer" {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "installer\build.ps1")
}

Invoke-ReleaseStep "Publish GitHub Release" {
    & powershell -ExecutionPolicy Bypass -File $PublishScript -Version $normalized -RepoRoot $RepoRoot
}

Invoke-ReleaseStep "Verify release" {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-release.ps1") -Version $normalized
}

Write-Host ""
Write-Host "[release] SUCCESS - Sasist Printer Agent v$normalized is published." -ForegroundColor Green
Write-Host "[release] Installer: Output\SasistPrinterAgent-Setup-$normalized.exe" -ForegroundColor Green
Write-Host "[release] GitHub Release: v$normalized" -ForegroundColor Green
exit 0
