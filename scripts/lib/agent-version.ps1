# Shared Printer Agent version helpers (SSOT: sasist-printer-agent/VERSION).

function Get-AgentVersionFilePath {
    param(
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    return Join-Path $RepoRoot "sasist-printer-agent\VERSION"
}

function Get-AgentVersion {
    param(
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    $path = Get-AgentVersionFilePath -RepoRoot $RepoRoot
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing VERSION file: $path"
    }

    $version = (Get-Content -LiteralPath $path -Raw).Trim()
    if (-not $version) {
        throw "VERSION file is empty: $path"
    }
    if ($version -match '\s') {
        throw "VERSION must be a single line semver (no whitespace): '$version'"
    }
    if ($version -notmatch '^\d+\.\d+\.\d+$') {
        throw "VERSION must use semver format x.y.z: '$version'"
    }
    return $version
}

function Set-AgentVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version,
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    $normalized = $Version.Trim().TrimStart("v")
    if ($normalized -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must use semver format x.y.z: '$Version'"
    }

    $versionPath = Get-AgentVersionFilePath -RepoRoot $RepoRoot
    ($normalized + [Environment]::NewLine) | Set-Content -LiteralPath $versionPath -Encoding UTF8

    $exampleConfig = Join-Path $RepoRoot "sasist-printer-agent\config\config.example.json"
    if (Test-Path -LiteralPath $exampleConfig) {
        $content = Get-Content -LiteralPath $exampleConfig -Raw
        $updated = [regex]::Replace($content, '"version"\s*:\s*"[^"]*"', """version"": ""$normalized""")
        Set-Content -LiteralPath $exampleConfig -Value $updated -Encoding UTF8 -NoNewline
    }

    return $normalized
}

function Get-AgentVersionTag {
    param(
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    return "v$(Get-AgentVersion -RepoRoot $RepoRoot)"
}
