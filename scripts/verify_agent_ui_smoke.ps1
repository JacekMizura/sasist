#requires -Version 5.1
<#
.SYNOPSIS
  Run UI smoke test against built SasistPrinterAgent.exe or dist binary.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\verify_agent_ui_smoke.ps1
#>
param(
    [string]$AgentExePath = "",
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $AgentExePath) {
    $AgentExePath = Join-Path $RepoRoot "sasist-printer-agent\dist\SasistPrinterAgent.exe"
}

if (-not (Test-Path -LiteralPath $AgentExePath)) {
    throw "Agent EXE not found: $AgentExePath"
}

Write-Host "[ui-smoke] Running: $AgentExePath --ui-smoke-test" -ForegroundColor Cyan
& $AgentExePath --ui-smoke-test
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ui-smoke] FAIL" -ForegroundColor Red
    exit 1
}

Write-Host "[ui-smoke] PASS" -ForegroundColor Green
exit 0
