#requires -Version 5.1
<#
.SYNOPSIS
  Verify Printer Agent release: manifest hash, local build, GitHub asset, UI modules.

  Usage (from repository root):
    powershell -ExecutionPolicy Bypass -File scripts\verify-release.ps1
    powershell -ExecutionPolicy Bypass -File scripts\verify-release.ps1 -Version 1.0.3
    powershell -ExecutionPolicy Bypass -File scripts\verify-release.ps1 -SkipGithub
#>
param(
    [string]$Version = "",
    [string]$ManifestPath = "",
    [string]$GithubRepo = $(if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY.Trim() } else { "JacekMizura/sasist" }),
    [string]$DownloadDir = "",
    [switch]$SkipGithub
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VerifyLib = Join-Path $RepoRoot "scripts\lib\agent-build-verify.ps1"
$VersionLib = Join-Path $RepoRoot "scripts\lib\agent-version.ps1"

. $VerifyLib
. $VersionLib

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

function Add-CheckResult {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$Results,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [bool]$Passed,
        [string]$Detail = ""
    )

    $status = if ($Passed) { "PASS" } else { "FAIL" }
    $line = "${Name}: $status"
    if ($Detail) {
        $line += " - $Detail"
    }
    [void]$Results.Add($line)
    return $Passed
}

$results = New-Object 'System.Collections.Generic.List[string]'
$allPassed = $true

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

$agentVersion = Get-AgentVersion -RepoRoot $RepoRoot
$versionMatch = ($agentVersion -eq $targetVersion)
$allPassed = (Add-CheckResult -Results $results -Name "Agent VERSION file" -Passed $versionMatch `
    -Detail "VERSION=$agentVersion manifest=$manifestVersion") -and $allPassed

Write-Step "Manifest version: $manifestVersion"
Write-Step "Expected setup SHA256: $expectedSetupSha"

$localInstallerPath = Join-Path $RepoRoot "Output\SasistPrinterAgent-Setup-$targetVersion.exe"
$localInstallerExists = Test-Path -LiteralPath $localInstallerPath

if ($localInstallerExists) {
    $localSetupSha = (Get-FileHash -LiteralPath $localInstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $localHashMatch = ($localSetupSha -eq $expectedSetupSha)
    $allPassed = (Add-CheckResult -Results $results -Name "Local installer SHA256 vs manifest" -Passed $localHashMatch `
        -Detail "local=$localSetupSha") -and $allPassed

    $installerVersion = Get-InstallerVersionFromName -FileName ([System.IO.Path]::GetFileName($localInstallerPath))
    $nameMatch = ($installerVersion -eq $targetVersion)
    $allPassed = (Add-CheckResult -Results $results -Name "Local installer file name vs version" -Passed $nameMatch `
        -Detail "file=$installerVersion expected=$targetVersion") -and $allPassed

    Write-Step "Validating UI modules in local build..."
    $localAgentExe = Resolve-AgentExeForValidation -RepoRoot $RepoRoot -InstallerPath $localInstallerPath `
        -ExtractDirectory (Join-Path $DownloadDir "_local_extracted_agent")
    if (-not $localAgentExe) {
        $allPassed = (Add-CheckResult -Results $results -Name "Local agent EXE for UI validation" -Passed $false `
            -Detail "Could not resolve SasistPrinterAgent.exe from dist or installer") -and $allPassed
    } else {
        $verifyScript = Join-Path $RepoRoot "scripts\verify_agent_exe.py"
        $prevErrorAction = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & python $verifyScript $localAgentExe --expected-version $targetVersion 2>&1 | Out-Host
            $uiPassed = ($LASTEXITCODE -eq 0)
        } finally {
            $ErrorActionPreference = $prevErrorAction
        }
        if (-not $uiPassed) {
            Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
        }
        $allPassed = (Add-CheckResult -Results $results -Name "Local agent UI modules + VERSION" -Passed $uiPassed) -and $allPassed
    }
} else {
    Write-Step "Local installer not found: $localInstallerPath (skipping local checks)"
    Add-CheckResult -Results $results -Name "Local installer present" -Passed $false `
        -Detail "Missing $localInstallerPath" | Out-Null
    $allPassed = $false
}

$githubSetupSha = $null
$githubDownloadPath = $null

if (-not $SkipGithub) {
    $tag = "v$targetVersion"
    Write-Step "Fetching GitHub release $tag from $GithubRepo ..."
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GithubRepo/releases/tags/$tag" `
            -Headers @{ "User-Agent" = "sasist-verify-release"; "Accept" = "application/vnd.github+json" } `
            -TimeoutSec 30

        $assetName = "SasistPrinterAgent-Setup-$targetVersion.exe"
        $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
        if (-not $asset) {
            $asset = $release.assets | Where-Object { $_.name -like "SasistPrinterAgent-Setup*.exe" } | Select-Object -First 1
        }
        if (-not $asset) {
            Add-CheckResult -Results $results -Name "GitHub release asset" -Passed $false `
                -Detail "Release $tag has no SasistPrinterAgent-Setup*.exe" | Out-Null
            $allPassed = $false
        } else {
            New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null
            $githubDownloadPath = Join-Path $DownloadDir $asset.name
            Write-Step "Downloading $($asset.name) ..."
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $githubDownloadPath -TimeoutSec 300

            $githubSetupSha = (Get-FileHash -LiteralPath $githubDownloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-Step "GitHub setup SHA256: $githubSetupSha"

            $githubManifestMatch = ($githubSetupSha -eq $expectedSetupSha)
            $allPassed = (Add-CheckResult -Results $results -Name "GitHub asset SHA256 vs manifest" -Passed $githubManifestMatch `
                -Detail "github=$githubSetupSha") -and $allPassed

            if ($localInstallerExists) {
                $githubLocalMatch = ($githubSetupSha -eq $localSetupSha)
                $allPassed = (Add-CheckResult -Results $results -Name "GitHub asset SHA256 vs local build" -Passed $githubLocalMatch `
                    -Detail "github=$githubSetupSha local=$localSetupSha") -and $allPassed
            }

            Write-Step "Validating UI modules in GitHub release asset..."
            $githubAgentExe = Resolve-AgentExeForValidation -RepoRoot $RepoRoot -InstallerPath $githubDownloadPath `
                -ExtractDirectory (Join-Path $DownloadDir "_github_extracted_agent")
            if (-not $githubAgentExe) {
                $allPassed = (Add-CheckResult -Results $results -Name "GitHub agent EXE for UI validation" -Passed $false `
                    -Detail "Could not extract SasistPrinterAgent.exe (install 7-Zip)") -and $allPassed
            } else {
                $verifyScript = Join-Path $RepoRoot "scripts\verify_agent_exe.py"
                $prevErrorAction = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                try {
                    & python $verifyScript $githubAgentExe --expected-version $targetVersion 2>&1 | Out-Host
                    $githubUiPassed = ($LASTEXITCODE -eq 0)
                } finally {
                    $ErrorActionPreference = $prevErrorAction
                }
                if (-not $githubUiPassed) {
                    Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
                }
                $allPassed = (Add-CheckResult -Results $results -Name "GitHub agent UI modules + VERSION" -Passed $githubUiPassed) -and $allPassed
            }
        }
    } catch {
        Add-CheckResult -Results $results -Name "GitHub release lookup" -Passed $false `
            -Detail $_.Exception.Message | Out-Null
        $allPassed = $false
    }
} else {
    Write-Step "GitHub checks skipped (-SkipGithub)"
}

Write-Host ""
Write-Host "[verify-release] Results:" -ForegroundColor Cyan
foreach ($line in $results) {
    if ($line -match ': PASS') {
        Write-Host "  $line" -ForegroundColor Green
    } elseif ($line -match ': FAIL') {
        Write-Host "  $line" -ForegroundColor Red
    } else {
        Write-Host "  $line"
    }
}

Write-Host ""
if ($allPassed) {
    Write-Host "[verify-release] PASS" -ForegroundColor Green
    exit 0
}

Write-Host "[verify-release] FAIL" -ForegroundColor Red
exit 1
