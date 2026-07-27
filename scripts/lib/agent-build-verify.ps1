# Stage 5 — .NET Sasist Agent build verification helpers (minimal).

function Assert-SasistAgentSetupPresent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $candidates = @(
        (Join-Path $RepoRoot "Output\SasistAgentSetup.exe"),
        (Join-Path $RepoRoot "sasist-agent\dist\SasistAgentSetup.exe")
    )
    $found = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $found) {
        throw "SasistAgentSetup.exe not found under Output\ or sasist-agent\dist\"
    }
    Write-Host "[build-verify] Found installer: $found" -ForegroundColor Green
    return $found
}
