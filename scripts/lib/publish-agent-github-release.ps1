#requires -Version 5.1
<#
.SYNOPSIS
  Create or update a GitHub Release for Sasist Printer Agent and upload the installer.

  Used by release.ps1 and GitHub Actions.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),

    [string]$NotesFile = "",

    [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "[publish-release] $Message" -ForegroundColor Cyan
}

$normalized = $Version.Trim().TrimStart("v")
if ($normalized -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must use semver format x.y.z: '$Version'"
}

$tag = "v$normalized"
if (-not $InstallerPath) {
    $InstallerPath = Join-Path $RepoRoot "Output\SasistPrinterAgent-Setup-$normalized.exe"
}
if (-not (Test-Path -LiteralPath $InstallerPath)) {
    throw "Installer not found: $InstallerPath"
}
if (-not $NotesFile) {
    $NotesFile = Join-Path $RepoRoot "RELEASE_NOTES.md"
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "GitHub CLI (gh) is not installed or not on PATH. Run: gh auth login"
}

Write-Step "Checking gh authentication..."
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run: gh auth login`n$authStatus"
}

$releaseExists = $false
$null = gh release view $tag 2>$null
if ($LASTEXITCODE -eq 0) {
    $releaseExists = $true
}

if ($releaseExists) {
    Write-Step "Release $tag exists - uploading installer (--clobber)"
    gh release upload $tag $InstallerPath --clobber
    if ($LASTEXITCODE -ne 0) {
        throw "gh release upload failed (exit $LASTEXITCODE)"
    }
    Write-Step "Uploaded: $InstallerPath"
    return
}

if (-not (Test-Path -LiteralPath $NotesFile)) {
    throw "Release notes file not found: $NotesFile. Create RELEASE_NOTES.md before the first release."
}

Write-Step "Creating release $tag"
gh release create $tag `
    $InstallerPath `
    --title "Sasist Printer Agent v$normalized" `
    --notes-file $NotesFile `
    --latest

if ($LASTEXITCODE -ne 0) {
    throw "gh release create failed (exit $LASTEXITCODE)"
}

Write-Step "Created release $tag with asset: $InstallerPath"
