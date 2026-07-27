#requires -Version 5.1
<#
.SYNOPSIS
  Verify Sasist Agent release: manifest hash, local Setup.exe, optional GitHub asset.
#>
param(
    [string]$Version = "",
    [string]$ManifestPath = "",
    [string]$GithubRepo = $(if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY.Trim() } else { "JacekMizura/sasist" }),
    [switch]$SkipGithub
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VersionLib = Join-Path $RepoRoot "scripts\lib\agent-version.ps1"
. $VersionLib

if (-not $ManifestPath) {
    $ManifestPath = Join-Path $RepoRoot "installer\build-manifest.json"
}

function Write-Step([string]$Message) {
    Write-Host "[verify-release] $Message" -ForegroundColor Cyan
}

function Normalize-VersionTag([string]$Value) {
    return ($Value -replace '^v', '').Trim()
}

function Add-CheckResult {
    param(
        [System.Collections.Generic.List[string]]$Results,
        [string]$Name,
        [bool]$Passed,
        [string]$Detail = ""
    )
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    $line = "${Name}: $status"
    if ($Detail) { $line += " - $Detail" }
    [void]$Results.Add($line)
    return $Passed
}

$results = New-Object 'System.Collections.Generic.List[string]'
$allPassed = $true

$repoVersion = Get-AgentVersion -RepoRoot $RepoRoot
$targetVersion = if ($Version) { Normalize-VersionTag $Version } else { $repoVersion }

Write-Step "Target version: $targetVersion"

$setupCandidates = @(
    (Join-Path $RepoRoot "Output\SasistAgentSetup.exe"),
    (Join-Path $RepoRoot "Output\SasistAgentSetup-$targetVersion.exe"),
    (Join-Path $RepoRoot "sasist-agent\dist\SasistAgentSetup.exe")
)
$setupPath = $setupCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

$allPassed = (Add-CheckResult $results "Local SasistAgentSetup.exe" ($null -ne $setupPath) $(if ($setupPath) { $setupPath } else { "not found" })) -and $allPassed

if ($setupPath) {
    $sha = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "[verify-release] SHA256: $sha"
}

if (Test-Path -LiteralPath $ManifestPath) {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $manifestVersion = Normalize-VersionTag ([string]$manifest.version)
    $allPassed = (Add-CheckResult $results "Manifest version" ($manifestVersion -eq $targetVersion) "manifest=$manifestVersion target=$targetVersion") -and $allPassed
    if ($setupPath -and $manifest.setup_sha256) {
        $actual = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $allPassed = (Add-CheckResult $results "Manifest SHA256" ($actual -eq $manifest.setup_sha256.ToLowerInvariant()) "") -and $allPassed
    }
} else {
    $allPassed = (Add-CheckResult $results "Manifest present" $false $ManifestPath) -and $allPassed
}

$legacyActive = Test-Path -LiteralPath (Join-Path $RepoRoot "sasist-printer-agent")
$allPassed = (Add-CheckResult $results "No active sasist-printer-agent/" (-not $legacyActive) $(if ($legacyActive) { "move to legacy/" } else { "ok" })) -and $allPassed

if (-not $SkipGithub) {
    Write-Step "Checking GitHub release v$targetVersion..."
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        $allPassed = (Add-CheckResult $results "GitHub CLI" $false "gh not installed") -and $allPassed
    } else {
        $json = gh release view "v$targetVersion" --repo $GithubRepo --json assets,tagName 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $json) {
            $allPassed = (Add-CheckResult $results "GitHub release v$targetVersion" $false "not found") -and $allPassed
        } else {
            $release = $json | ConvertFrom-Json
            $asset = @($release.assets) | Where-Object { $_.name -like "SasistAgentSetup*.exe" } | Select-Object -First 1
            $allPassed = (Add-CheckResult $results "GitHub asset SasistAgentSetup*" ($null -ne $asset) $(if ($asset) { $asset.name } else { "missing" })) -and $allPassed
        }
    }
} else {
    Write-Step "SkipGithub - remote checks omitted"
}

Write-Host ""
Write-Host "===== VERIFY RESULTS =====" -ForegroundColor Cyan
foreach ($line in $results) { Write-Host $line }
if ($allPassed) {
    Write-Host "OVERALL: PASS" -ForegroundColor Green
    exit 0
}
Write-Host "OVERALL: FAIL" -ForegroundColor Red
exit 1
