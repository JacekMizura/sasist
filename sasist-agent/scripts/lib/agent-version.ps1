#Requires -Version 5.1
<#
.SYNOPSIS
  Read / write / bump sasist-agent VERSION and sync dependent files.
#>

function Get-AgentRoot {
    Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    # scripts/lib -> scripts -> sasist-agent? 
    # Actually: this file is scripts/lib/agent-version.ps1
    # Parent of lib = scripts, parent of scripts = sasist-agent root
}

# Fix: $PSScriptRoot when dot-sourced from scripts/lib
function Resolve-AgentRoot {
    param([string]$From = $PSScriptRoot)
    # From = .../sasist-agent/scripts/lib
    return (Resolve-Path (Join-Path $From "..\..")).Path
}

function Get-AgentVersion {
    param([string]$Root = (Resolve-AgentRoot))
    $path = Join-Path $Root "VERSION"
    if (-not (Test-Path $path)) { throw "Missing VERSION at $path" }
    $v = (Get-Content $path -Raw).Trim()
    if ($v -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid VERSION '$v' (want MAJOR.MINOR.PATCH)" }
    return $v
}

function Split-SemVer([string]$Version) {
    $p = $Version.Split('.')
    return @{ Major = [int]$p[0]; Minor = [int]$p[1]; Patch = [int]$p[2] }
}

function Format-SemVer($Parts) {
    return "{0}.{1}.{2}" -f $Parts.Major, $Parts.Minor, $Parts.Patch
}

function Set-AgentVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Version,
        [string]$Root = (Resolve-AgentRoot)
    )
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid version '$Version'" }

    Set-Content -Path (Join-Path $Root "VERSION") -Value $Version -NoNewline -Encoding ascii
    # trailing newline for POSIX friendliness
    Add-Content -Path (Join-Path $Root "VERSION") -Value "" -Encoding ascii

    $iss = Join-Path $Root "installer\SasistAgent.iss"
    if (Test-Path $iss) {
        $text = Get-Content $iss -Raw
        $updated = [regex]::Replace($text, '(#define\s+MyAppVersion\s+")[^"]+(")', "`${1}$Version`${2}")
        if ($updated -eq $text -and $text -notmatch [regex]::Escape($Version)) {
            throw "Failed to patch MyAppVersion in SasistAgent.iss"
        }
        Set-Content -Path $iss -Value $updated -NoNewline -Encoding utf8
    }

    Write-Host "Agent version set to $Version" -ForegroundColor Green
}

function Bump-AgentVersion {
    param(
        [ValidateSet("major", "minor", "patch")]
        [string]$Part = "patch",
        [string]$Root = (Resolve-AgentRoot)
    )
    $cur = Get-AgentVersion -Root $Root
    $p = Split-SemVer $cur
    switch ($Part) {
        "major" { $p.Major++; $p.Minor = 0; $p.Patch = 0 }
        "minor" { $p.Minor++; $p.Patch = 0 }
        "patch" { $p.Patch++ }
    }
    $next = Format-SemVer $p
    if ($next -eq $cur) { throw "Bump produced same version $cur" }
    Set-AgentVersion -Version $next -Root $Root
    return $next
}
