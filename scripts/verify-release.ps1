#requires -Version 5.1
<#
.SYNOPSIS
  Verify GitHub Release installer hash against installer/build-manifest.json.

  Usage (from repository root):
    powershell -ExecutionPolicy Bypass -File scripts\verify-release.ps1
    powershell -ExecutionPolicy Bypass -File scripts\verify-release.ps1 -Version 1.0.1
#>
param(
    [string]$Version = "",
    [string]$ManifestPath = "",
    [string]$GithubRepo = $(if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY.Trim() } else { "JacekMizura/sasist" }),
    [string]$DownloadDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ManifestPath) {
    $ManifestPath = Join-Path $RepoRoot "installer\build-manifest.json"
}
if (-not $DownloadDir) {
    $DownloadDir = Join-Path $RepoRoot "Output\_release_verify"
}

function Write-Step([string]$Message) {
    Write-Host "[verify-release] $Message" -ForegroundColor Cyan
}

function Normalize-VersionTag([string]$Value) {
    return ($Value -replace '^v', '').Trim()
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Missing manifest: $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$manifestVersion = Normalize-VersionTag ([string]$manifest.version)
$expectedSetupSha = [string]$manifest.setup_sha256

if (-not $expectedSetupSha) {
    throw "Manifest does not contain setup_sha256."
}

$targetVersion = if ($Version) { Normalize-VersionTag $Version } else { $manifestVersion }
if ($targetVersion -ne $manifestVersion) {
    throw "Requested version $targetVersion does not match manifest version $manifestVersion."
}

Write-Step "Manifest version: $manifestVersion"
Write-Step "Expected setup SHA256: $expectedSetupSha"

$tag = "v$targetVersion"
Write-Step "Fetching GitHub release $tag from $GithubRepo ..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GithubRepo/releases/tags/$tag" `
    -Headers @{ "User-Agent" = "sasist-verify-release"; "Accept" = "application/vnd.github+json" } `
    -TimeoutSec 30

$assetName = "SasistPrinterAgent-Setup-$targetVersion.exe"
$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "SasistPrinterAgent-Setup*.exe" } | Select-Object -First 1
}
if (-not $asset) {
    throw "GitHub release $tag has no SasistPrinterAgent-Setup*.exe asset."
}

New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null
$downloadPath = Join-Path $DownloadDir $asset.name
Write-Step "Downloading $($asset.name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadPath -TimeoutSec 300

$actualSetupSha = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Step "GitHub setup SHA256: $actualSetupSha"

if ($actualSetupSha -ne $expectedSetupSha) {
    Write-Host "[verify-release] HASH MISMATCH" -ForegroundColor Red
    Write-Host "[verify-release] manifest: $expectedSetupSha"
    Write-Host "[verify-release] github  : $actualSetupSha"
    throw "GitHub release asset hash does not match installer/build-manifest.json."
}

Write-Host "[verify-release] OK — GitHub release matches build manifest." -ForegroundColor Green
