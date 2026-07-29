#Requires -Version 5.1
param(
    [ValidateSet("major", "minor", "patch")]
    [string]$Part = "patch"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\agent-version.ps1")
$next = Bump-AgentVersion -Part $Part -Root $Root
Write-Host "Bumped to $next"
