# Shared Printer Agent build/release validation helpers.

function Get-InstallerVersionFromName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    if ($FileName -match 'SasistPrinterAgent-Setup-(\d+\.\d+\.\d+)\.exe$') {
        return $Matches[1]
    }
    return $null
}

function Invoke-AgentExeValidation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AgentExePath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    if (-not (Test-Path -LiteralPath $AgentExePath)) {
        Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
        throw "Agent EXE not found: $AgentExePath"
    }

    $verifyScript = Join-Path $RepoRoot "scripts\verify_agent_exe.py"
    if (-not (Test-Path -LiteralPath $verifyScript)) {
        throw "Missing validation script: $verifyScript"
    }

    & python $verifyScript $AgentExePath --expected-version $ExpectedVersion
    if ($LASTEXITCODE -ne 0) {
        if ($LASTEXITCODE -eq 1) {
            Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
        }
        exit 1
    }
}

function Assert-InstallerNameMatchesVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion
    )

    $fileName = [System.IO.Path]::GetFileName($InstallerPath)
    $installerVersion = Get-InstallerVersionFromName -FileName $fileName
    if (-not $installerVersion) {
        throw "Could not parse version from installer file name: $fileName"
    }
    if ($installerVersion -ne $ExpectedVersion) {
        Write-Host "Version mismatch: installer file name is $installerVersion but agent VERSION is $ExpectedVersion." -ForegroundColor Red
        throw "Installer version mismatch: file=$installerVersion expected=$ExpectedVersion ($fileName)"
    }
}

function Find-SevenZip {
    $candidates = @(
        (Get-Command 7z -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "${env:ProgramFiles}\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    return $candidates | Select-Object -First 1
}

function Extract-AgentExeFromInstaller {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,
        [Parameter(Mandatory = $true)]
        [string]$OutputDirectory
    )

    $sevenZip = Find-SevenZip
    if (-not $sevenZip) {
        return $null
    }

    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    & $sevenZip e -y "-o$OutputDirectory" $InstallerPath "SasistPrinterAgent.exe" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    $agentExe = Join-Path $OutputDirectory "SasistPrinterAgent.exe"
    if (Test-Path -LiteralPath $agentExe) {
        return $agentExe
    }
    return $null
}

function Resolve-AgentExeForValidation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [string]$InstallerPath = "",
        [string]$ExtractDirectory = ""
    )

    $distExe = Join-Path $RepoRoot "sasist-printer-agent\dist\SasistPrinterAgent.exe"
    if (Test-Path -LiteralPath $distExe) {
        return $distExe
    }

    if ($InstallerPath -and (Test-Path -LiteralPath $InstallerPath)) {
        if (-not $ExtractDirectory) {
            $ExtractDirectory = Join-Path $RepoRoot "Output\_release_verify\_extracted_agent"
        }
        $extracted = Extract-AgentExeFromInstaller -InstallerPath $InstallerPath -OutputDirectory $ExtractDirectory
        if ($extracted) {
            return $extracted
        }
    }

    return $null
}
