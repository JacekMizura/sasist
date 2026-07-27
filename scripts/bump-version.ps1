#requires -Version 5.1
<#
.SYNOPSIS
  Bump Sasist Agent version (SSOT: sasist-agent/VERSION).

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 1.0.1
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\agent-version.ps1")

$newVersion = Set-AgentVersion -Version $Version -RepoRoot $RepoRoot
Write-Host "[bump-version] sasist-agent/VERSION -> $newVersion" -ForegroundColor Green
Write-Host "[bump-version] Git tag for release: v$newVersion" -ForegroundColor Cyan
Write-Host "[bump-version] Next: commit, run installer\build.ps1, publish GitHub Release v$newVersion" -ForegroundColor Cyan
