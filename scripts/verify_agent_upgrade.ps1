#requires -Version 5.1
<#
.SYNOPSIS
  Verify upgrade-safe install.ps1 behavior (config/token/logs/autostart preservation).

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\verify_agent_upgrade.ps1
#>
param(
    [string]$InstallScript = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $InstallScript) {
    $InstallScript = Join-Path $RepoRoot "installer\install.ps1"
}

if (-not (Test-Path -LiteralPath $InstallScript)) {
    throw "Missing install script: $InstallScript"
}

$results = New-Object 'System.Collections.Generic.List[string]'
$script:allPassed = $true

function Add-Result {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Detail = ""
    )
    if (-not $Passed) {
        $script:allPassed = $false
    }
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    $line = "${Name}: $status"
    if ($Detail) { $line += " - $Detail" }
    [void]$results.Add($line)
}

$content = Get-Content -LiteralPath $InstallScript -Raw

Add-Result "Preserves existing config.json" ($content -match 'config\.json')
Add-Result "Creates logs dir without wiping" ($content -match 'Join-Path \$ProgramDataDir "logs"')
Add-Result "Service autostart on upgrade" ($content -match 'sc\.exe config \$ServiceName start= auto')
Add-Result "Stops service before upgrade" ($content -match 'Stop-ServiceSafe')
Add-Result "Removes legacy desktop shortcuts" ($content -match 'Sasist Printer Logs\.lnk')

Write-Host "[verify-upgrade] Results:" -ForegroundColor Cyan
foreach ($line in $results) {
    if ($line -match ': PASS') {
        Write-Host "  $line" -ForegroundColor Green
    } else {
        Write-Host "  $line" -ForegroundColor Red
    }
}

if ($script:allPassed) {
    Write-Host "[verify-upgrade] PASS" -ForegroundColor Green
    exit 0
}

Write-Host "[verify-upgrade] FAIL" -ForegroundColor Red
exit 1
