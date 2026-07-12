#requires -Version 5.1
<#
.SYNOPSIS
  Build Sasist Printer Agent installer (PyInstaller + Inno Setup) and write release manifest.

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
$AgentRoot = Join-SafePath $RepoRoot "sasist-printer-agent"
$DistRoot = Join-SafePath $AgentRoot "dist"
$BuildRoot = Join-SafePath $AgentRoot "build"
$OutputRoot = Join-SafePath $RepoRoot "Output"
$InstallerDir = Join-SafePath $RepoRoot "installer"
$installerScript = Join-SafePath $InstallerDir "installer.iss"
$ManifestPath = Join-SafePath $InstallerDir "build-manifest.json"
$VersionLib = Join-SafePath $RepoRoot "scripts\lib\agent-version.ps1"
$VerifyLib = Join-SafePath $RepoRoot "scripts\lib\agent-build-verify.ps1"
$GithubRepo = if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY.Trim() } else { "JacekMizura/sasist" }

. $VersionLib
. $VerifyLib

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
    Write-Host "[build]           path : $Path"
    return $hash
}

function Get-VersionParts([string]$Version) {
    $normalized = ($Version -replace '^v', '').Trim()
    if (-not $normalized) { return @() }
    return @($normalized.Split('.') | ForEach-Object {
        if ($_ -match '^\d+$') { [int]$_ } else { 0 }
    })
}

function Test-VersionGreater([string]$Candidate, [string]$Baseline) {
    if (-not $Baseline) { return $true }
    $left = Get-VersionParts $Candidate
    $right = Get-VersionParts $Baseline
    $count = [Math]::Max($left.Count, $right.Count)
    for ($i = 0; $i -lt $count; $i++) {
        $lv = if ($i -lt $left.Count) { $left[$i] } else { 0 }
        $rv = if ($i -lt $right.Count) { $right[$i] } else { 0 }
        if ($lv -gt $rv) { return $true }
        if ($lv -lt $rv) { return $false }
    }
    return $false
}

function Read-AgentVersionFromRepo {
    return Get-AgentVersion -RepoRoot $RepoRoot
}

function Get-GitCommit {
    try {
        Push-Location $RepoRoot
        $commit = (git rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $commit) {
            return "unknown"
        }
        return $commit.Trim()
    } catch {
        return "unknown"
    } finally {
        Pop-Location | Out-Null
    }
}

function Get-PreviousReleaseVersion {
    $versions = @()
    if (Test-Path -LiteralPath $ManifestPath) {
        try {
            $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
            if ($manifest.version) { $versions += [string]$manifest.version }
        } catch {
            Write-Host "[build] Warning: could not parse existing build-manifest.json" -ForegroundColor Yellow
        }
    }

    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GithubRepo/releases/latest" `
            -Headers @{ "User-Agent" = "sasist-build"; "Accept" = "application/vnd.github+json" } `
            -TimeoutSec 20
        if ($release.tag_name) {
            $versions += [string]$release.tag_name
        }
    } catch {
        Write-Host "[build] GitHub latest release lookup skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    $best = $null
    foreach ($version in $versions) {
        if (-not $best -or (Test-VersionGreater $version $best)) {
            $best = $version
        }
    }
    return $best
}

function Assert-ReleaseVersionBump([string]$CurrentVersion) {
    $previous = Get-PreviousReleaseVersion
    if (-not $previous) {
        Write-Step "No previous release manifest/tag found - version $CurrentVersion accepted."
        return
    }
    if (-not (Test-VersionGreater $CurrentVersion $previous)) {
        throw "Release version must be greater than previous release ($previous). Current: $CurrentVersion. Run: powershell -File scripts\\bump-version.ps1 x.y.z"
    }
    Write-Step "Version bump OK: $CurrentVersion > $previous"
}

function Write-BuildInfoJson(
    [string]$Version,
    [string]$GitCommit,
    [string]$BuiltAt,
    [string]$AgentSha,
    [string]$ServiceSha,
    [string]$UpdaterSha,
    [string]$TargetPath
) {
    $payload = [ordered]@{
        version = $Version
        git_commit = $GitCommit
        built_at = $BuiltAt
        agent_sha256 = $AgentSha
        service_sha256 = $ServiceSha
        updater_sha256 = $UpdaterSha
    }
    ($payload | ConvertTo-Json -Depth 4) + "`n" | Set-Content -LiteralPath $TargetPath -Encoding UTF8
}

function Assert-PublicationReady(
    [string]$ManifestPath,
    [string]$SetupSha,
    [string]$CurrentVersion
) {
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Publication blocked: build-manifest.json was not created at $ManifestPath"
    }
    if (-not $SetupSha) {
        throw "Publication blocked: setup SHA256 was not generated."
    }

    try {
        $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    } catch {
        throw "Publication blocked: build-manifest.json is invalid JSON."
    }

    if ([string]$manifest.setup_sha256 -ne $SetupSha) {
        throw "Publication blocked: manifest setup_sha256 does not match computed setup hash."
    }
    if ([string]$manifest.version -ne $CurrentVersion) {
        throw "Publication blocked: manifest version does not match sasist-printer-agent/VERSION."
    }

    Write-Host "[build] Publication validation passed." -ForegroundColor Green
}

function Search-IsccOnDrives {
    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        $driveRoot = [string]$drive.Root
        if ([string]::IsNullOrWhiteSpace($driveRoot)) { continue }

        $programRoots = @(
            (Join-SafePath $driveRoot "Program Files (x86)")
            (Join-SafePath $driveRoot "Program Files")
        )
        foreach ($programRoot in $programRoots) {
            $candidate = Join-SafePath $programRoot "Inno Setup 6" "ISCC.exe"
            if (Test-Path -LiteralPath $candidate) {
                return $candidate
            }
        }
    }

    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        $driveRoot = [string]$drive.Root
        if ([string]::IsNullOrWhiteSpace($driveRoot)) { continue }

        $found = Get-ChildItem -Path $driveRoot -Filter "ISCC.exe" -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like "*\Inno Setup 6\ISCC.exe" } |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    return $null
}

Write-Step "Repository: $RepoRoot"
$version = Read-AgentVersionFromRepo
Write-Step "Agent version (VERSION): $version"
Assert-ReleaseVersionBump -CurrentVersion $version
$gitCommit = Get-GitCommit
$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss'Z'")

Set-Location $AgentRoot

Write-Step "Cleaning stale PyInstaller artifacts..."
Remove-Item $BuildRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $DistRoot -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $AgentRoot -Filter "*.spec.cache" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Step "PyInstaller: agent.spec"
python -m PyInstaller agent.spec
Write-Step "PyInstaller: service.spec"
python -m PyInstaller service.spec
Write-Step "PyInstaller: updater.spec"
python -m PyInstaller updater.spec

$agentExe = Join-SafePath $DistRoot "SasistPrinterAgent.exe"
$serviceExe = Join-SafePath $DistRoot "SasistPrinterService.exe"
$updaterExe = Join-SafePath $DistRoot "SasistPrinterUpdater.exe"
$required = @(
    @{ Name = "SasistPrinterAgent.exe"; Path = $agentExe },
    @{ Name = "SasistPrinterService.exe"; Path = $serviceExe },
    @{ Name = "SasistPrinterUpdater.exe"; Path = $updaterExe }
)
foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath $item.Path)) {
        throw "Missing build artifact: $($item.Path)"
    }
}

Write-Step "Validating SasistPrinterAgent.exe (UI modules + VERSION)..."
Invoke-AgentExeValidation -AgentExePath $agentExe -ExpectedVersion $version -RepoRoot $RepoRoot

Write-Step "UI smoke test (Status / Logi / Ustawienia)..."
Invoke-AgentUiSmokeTest -AgentExePath $agentExe

Write-Step "Computing SHA256 for PyInstaller artifacts..."
$agentSha = Write-FileSha256 "SasistPrinterAgent.exe" $agentExe
$serviceSha = Write-FileSha256 "SasistPrinterService.exe" $serviceExe
$updaterSha = Write-FileSha256 "SasistPrinterUpdater.exe" $updaterExe

if (-not $agentSha -or -not $serviceSha -or -not $updaterSha) {
    throw "Failed to compute SHA256 for one or more build artifacts."
}

$buildInfoPath = Join-SafePath $DistRoot "build_info.json"
Write-BuildInfoJson -Version $version -GitCommit $gitCommit -BuiltAt $builtAt `
    -AgentSha $agentSha -ServiceSha $serviceSha -UpdaterSha $updaterSha -TargetPath $buildInfoPath
Write-Step "Wrote $buildInfoPath"

try {
    $iscc = (Get-Command ISCC.exe -ErrorAction Stop).Source
} catch {
    $iscc = $null
}

if (-not $iscc -or -not (Test-Path -LiteralPath $iscc)) {
    $iscc = Search-IsccOnDrives
}

if (-not $iscc) {
    throw "Inno Setup 6 (ISCC.exe) not found. Install from https://jrsoftware.org/isinfo.php or add ISCC.exe to PATH."
}

Write-Step "Using ISCC: $iscc"
Write-Step "Compiling installer for version $version..."
Set-Location $RepoRoot
& $iscc "/DMyAppVersion=$version" $installerScript
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed with exit code $LASTEXITCODE"
}

$setup = Get-ChildItem -Path $OutputRoot -Filter "SasistPrinterAgent-Setup-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $setup) {
    throw "Installer EXE not created. Expected: $OutputRoot\SasistPrinterAgent-Setup-*.exe"
}

Write-Step "Installer created: $($setup.FullName)"
$setupPath = $setup.FullName
Assert-InstallerNameMatchesVersion -InstallerPath $setupPath -ExpectedVersion $version

Write-Step "Validating SasistPrinterAgent.exe inside installer (UI modules + VERSION)..."
$installerExtractDir = Join-SafePath $OutputRoot "_build_verify_extracted"
$installerAgentExe = Extract-AgentExeFromInstaller -InstallerPath $setupPath -OutputDirectory $installerExtractDir
if (-not $installerAgentExe) {
    throw "Could not extract SasistPrinterAgent.exe from installer for validation. Install 7-Zip."
}
Invoke-AgentExeValidation -AgentExePath $installerAgentExe -ExpectedVersion $version -RepoRoot $RepoRoot

$localSetupHash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "[build] Local setup hash: $localSetupHash"

try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GithubRepo/releases/latest" `
        -Headers @{ "User-Agent" = "sasist-build"; "Accept" = "application/vnd.github+json" } `
        -TimeoutSec 20
    $asset = $release.assets | Where-Object { $_.name -like "SasistPrinterAgent-Setup*.exe" } | Select-Object -First 1
    if ($asset) {
        $githubDir = Join-SafePath $OutputRoot "_github_compare"
        New-Item -ItemType Directory -Force -Path $githubDir | Out-Null
        $githubSetupPath = Join-SafePath $githubDir $asset.name
        Write-Step "Downloading GitHub asset: $($asset.name)"
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $githubSetupPath -TimeoutSec 120
        $githubSetupHash = (Get-FileHash -LiteralPath $githubSetupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "[build] GitHub setup hash: $githubSetupHash"
        if ($localSetupHash -eq $githubSetupHash) {
            Write-Host "[build] MATCH" -ForegroundColor Green
        } else {
            Write-Host "[build] MISMATCH" -ForegroundColor Red
        }
    } else {
        Write-Host "[build] GitHub latest release has no SasistPrinterAgent-Setup*.exe asset." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[build] GitHub setup hash compare skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

$setupSha = $localSetupHash

$iconSha256 = Get-SourceIconSha256 -RepoRoot $RepoRoot

$manifest = [ordered]@{
    version = $version
    built_at = $builtAt
    git_commit = $gitCommit
    agent_sha256 = $agentSha
    service_sha256 = $serviceSha
    updater_sha256 = $updaterSha
    setup_sha256 = $setupSha
    icon_sha256 = $iconSha256
}
($manifest | ConvertTo-Json -Depth 4) + "`n" | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
Write-Step "Wrote $ManifestPath"

Assert-PublicationReady -ManifestPath $ManifestPath -SetupSha $setupSha -CurrentVersion $version
Write-Step "Running upgrade verification script..."
powershell -ExecutionPolicy Bypass -File (Join-SafePath $RepoRoot "scripts\verify_agent_upgrade.ps1")
Write-Step "Build complete. Upload Output\SasistPrinterAgent-Setup-${version}.exe to GitHub Release v$version, then run scripts\\verify-release.ps1."
