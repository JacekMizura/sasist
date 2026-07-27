#requires -Version 5.1
<#
.SYNOPSIS
  Build official Sasist Agent installer (.NET) and write release manifest.

  Single product path — delegates to sasist-agent/scripts/publish-release.ps1.
  Output:
    Output\SasistAgentSetup.exe
    Output\SasistAgentSetup-<version>.exe
    sasist-agent\dist\SasistAgentSetup.exe

  Usage (from repository root):
    powershell -ExecutionPolicy Bypass -File installer\build.ps1
#>
$ErrorActionPreference = "Stop"

function Join-SafePath {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$Base,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Segments
    )
    $path = $Base
    foreach ($segment in $Segments) {
        if ([string]::IsNullOrWhiteSpace($segment)) { continue }
        $path = [System.IO.Path]::Combine($path, $segment)
    }
    return $path
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AgentRoot = Join-SafePath $RepoRoot "sasist-agent"
$OutputRoot = Join-SafePath $RepoRoot "Output"
$InstallerDir = Join-SafePath $RepoRoot "installer"
$ManifestPath = Join-SafePath $InstallerDir "build-manifest.json"
$VersionLib = Join-SafePath $RepoRoot "scripts\lib\agent-version.ps1"
$EncodingLib = Join-SafePath $RepoRoot "scripts\lib\ps-encoding.ps1"
$PublishScript = Join-SafePath $AgentRoot "scripts\publish-release.ps1"

. $EncodingLib
. $VersionLib

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
    return $hash
}

function Get-GitCommit {
    try {
        Push-Location $RepoRoot
        $commit = (git rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $commit) { return "unknown" }
        return $commit.Trim()
    } catch {
        return "unknown"
    } finally {
        Pop-Location | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $PublishScript)) {
    throw "Missing publish script: $PublishScript"
}

$version = Get-AgentVersion -RepoRoot $RepoRoot
Write-Step "Sasist Agent version: $version"
Write-Step "Building via sasist-agent publish-release.ps1..."

& powershell -NoProfile -ExecutionPolicy Bypass -File $PublishScript
if ($LASTEXITCODE -ne 0) {
    throw "sasist-agent publish-release.ps1 failed (exit $LASTEXITCODE)"
}

$distSetup = Join-SafePath $AgentRoot "dist\SasistAgentSetup.exe"
if (-not (Test-Path -LiteralPath $distSetup)) {
    throw "Expected installer missing: $distSetup"
}

New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$outSetup = Join-SafePath $OutputRoot "SasistAgentSetup.exe"
$outVersioned = Join-SafePath $OutputRoot "SasistAgentSetup-$version.exe"
Copy-Item -LiteralPath $distSetup -Destination $outSetup -Force
Copy-Item -LiteralPath $distSetup -Destination $outVersioned -Force

$setupSha = Write-FileSha256 "SasistAgentSetup.exe" $outSetup
$iconPath = Join-SafePath $AgentRoot "assets\sasist-agent.ico"
$iconSha = $null
if (Test-Path -LiteralPath $iconPath) {
    $iconSha = Write-FileSha256 "sasist-agent.ico" $iconPath
}

$manifest = [ordered]@{
    product           = "Sasist Agent"
    version           = $version
    built_at          = (Get-Date).ToUniversalTime().ToString("o")
    git_commit        = Get-GitCommit
    setup_path        = $outSetup
    setup_versioned   = $outVersioned
    setup_sha256      = $setupSha
    icon_sha256       = $iconSha
    agent_root        = $AgentRoot
    publish_dir       = (Join-SafePath $AgentRoot "publish\win-x64")
}
($manifest | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $ManifestPath -Encoding (Get-Utf8Encoding)

Write-Step "DONE"
Write-Host "[build] Installer: $outSetup" -ForegroundColor Green
Write-Host "[build] Versioned: $outVersioned" -ForegroundColor Green
Write-Host "[build] Manifest:  $ManifestPath" -ForegroundColor Green
exit 0
