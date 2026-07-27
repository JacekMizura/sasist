#requires -Version 5.1
<#
.SYNOPSIS
  Create or update a GitHub Release for Sasist Agent and upload SasistAgentSetup.exe.
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
    $candidate = Join-Path $RepoRoot "Output\SasistAgentSetup.exe"
    $versioned = Join-Path $RepoRoot "Output\SasistAgentSetup-$normalized.exe"
    if (Test-Path -LiteralPath $candidate) {
        $InstallerPath = $candidate
    } elseif (Test-Path -LiteralPath $versioned) {
        $InstallerPath = $versioned
    } else {
        $InstallerPath = Join-Path $RepoRoot "sasist-agent\dist\SasistAgentSetup.exe"
    }
}
if (-not (Test-Path -LiteralPath $InstallerPath)) {
    throw "Installer not found: $InstallerPath"
}
if (-not $NotesFile) {
    $NotesFile = Join-Path $RepoRoot "RELEASE_NOTES.md"
}

# Upload as canonical asset name (backend looks for SasistAgentSetup*)
$uploadName = "SasistAgentSetup.exe"
$uploadPath = Join-Path $env:TEMP $uploadName
Copy-Item -LiteralPath $InstallerPath -Destination $uploadPath -Force

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
    Write-Step "Release $tag exists - uploading $uploadName (--clobber)"
    gh release upload $tag $uploadPath --clobber
    if ($LASTEXITCODE -ne 0) {
        throw "gh release upload failed (exit $LASTEXITCODE)"
    }
    Write-Step "Uploaded: $uploadName"
    return
}

if (-not (Test-Path -LiteralPath $NotesFile)) {
    throw "Release notes file not found: $NotesFile. Create RELEASE_NOTES.md before the first release."
}

Write-Step "Creating release $tag"
gh release create $tag `
    $uploadPath `
    --title "Sasist Agent v$normalized" `
    --notes-file $NotesFile `
    --latest

if ($LASTEXITCODE -ne 0) {
    throw "gh release create failed (exit $LASTEXITCODE)"
}

Write-Step "Created release $tag with asset: $uploadName"
