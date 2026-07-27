# Shared Sasist Agent version helpers (SSOT: sasist-agent/VERSION).

. (Join-Path $PSScriptRoot "ps-encoding.ps1")

function Get-AgentVersionFilePath {
    param(
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    return Join-Path $RepoRoot "sasist-agent\VERSION"
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
    ($normalized + [Environment]::NewLine) | Set-Content -LiteralPath $versionPath -Encoding (Get-Utf8Encoding)

    # Keep Inno + Host/Tray Version property in sync when present
    $iss = Join-Path $RepoRoot "sasist-agent\installer\SasistAgent.iss"
    if (Test-Path -LiteralPath $iss) {
        $issText = Get-Content -LiteralPath $iss -Raw
        $issText = [regex]::Replace($issText, '#define MyAppVersion "[^"]*"', "#define MyAppVersion `"$normalized`"")
        Set-Content -LiteralPath $iss -Value $issText -Encoding (Get-Utf8Encoding) -NoNewline
    }

    foreach ($rel in @(
        "sasist-agent\src\Sasist.Agent.Host\Sasist.Agent.Host.csproj",
        "sasist-agent\src\Sasist.Agent.Tray\Sasist.Agent.Tray.csproj"
    )) {
        $csproj = Join-Path $RepoRoot $rel
        if (Test-Path -LiteralPath $csproj) {
            $xml = Get-Content -LiteralPath $csproj -Raw
            if ($xml -match '<Version>[^<]+</Version>') {
                $xml = [regex]::Replace($xml, '<Version>[^<]+</Version>', "<Version>$normalized</Version>")
                Set-Content -LiteralPath $csproj -Value $xml -Encoding (Get-Utf8Encoding) -NoNewline
            }
        }
    }

    return $normalized
}

function Get-AgentVersionTag {
    param(
        [string]$RepoRoot = $(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )

    return "v$(Get-AgentVersion -RepoRoot $RepoRoot)"
}
