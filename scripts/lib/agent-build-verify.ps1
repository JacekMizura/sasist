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
        [string]$RepoRoot,
        [string]$ExpectedIconSha256 = ""
    )

    if (-not (Test-Path -LiteralPath $AgentExePath)) {
        Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
        throw "Agent EXE not found: $AgentExePath"
    }

    $verifyScript = Join-Path $RepoRoot "scripts\verify_agent_exe.py"
    if (-not (Test-Path -LiteralPath $verifyScript)) {
        throw "Missing validation script: $verifyScript"
    }

    $iconPath = Join-Path $RepoRoot "sasist-printer-agent\assets\icon.ico"
    if (-not $ExpectedIconSha256 -and (Test-Path -LiteralPath $iconPath)) {
        $ExpectedIconSha256 = (Get-FileHash -LiteralPath $iconPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    $args = @($verifyScript, $AgentExePath, "--expected-version", $ExpectedVersion)
    if ($ExpectedIconSha256) {
        $args += @("--expected-icon-sha256", $ExpectedIconSha256)
    }

    & python @args
    if ($LASTEXITCODE -ne 0) {
        if ($LASTEXITCODE -eq 1) {
            Write-Host "Installer was built without the new UI modules." -ForegroundColor Red
        }
        exit 1
    }
}

function Invoke-AgentUiSmokeTest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AgentExePath
    )

    if (-not (Test-Path -LiteralPath $AgentExePath)) {
        throw "Agent EXE not found for UI smoke test: $AgentExePath"
    }

    Write-Host ("[build] UI smoke test: {0} --ui-smoke-test" -f $AgentExePath) -ForegroundColor Cyan
    & $AgentExePath --ui-smoke-test
    if ($LASTEXITCODE -ne 0) {
        throw "UI smoke test failed with exit code $LASTEXITCODE"
    }
    Write-Host ("[build] UI smoke test PASS") -ForegroundColor Green
}

function Get-SourceIconSha256 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $iconPath = Join-Path $RepoRoot "sasist-printer-agent\assets\icon.ico"
    if (-not (Test-Path -LiteralPath $iconPath)) {
        return $null
    }
    return (Get-FileHash -LiteralPath $iconPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Extract-BuildInfoFromInstaller {
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
    & $sevenZip e -y "-o$OutputDirectory" $InstallerPath "build_info.json" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    $buildInfoPath = Join-Path $OutputDirectory "build_info.json"
    if (Test-Path -LiteralPath $buildInfoPath) {
        return $buildInfoPath
    }
    return $null
}

function Invoke-LocalDistArtifactValidation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AgentExePath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceExePath,
        [Parameter(Mandatory = $true)]
        [string]$UpdaterExePath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $artifacts = @(
        @{ Label = "SasistPrinterAgent.exe"; Path = $AgentExePath },
        @{ Label = "SasistPrinterService.exe"; Path = $ServiceExePath },
        @{ Label = "SasistPrinterUpdater.exe"; Path = $UpdaterExePath }
    )

    foreach ($item in $artifacts) {
        if (-not (Test-Path -LiteralPath $item.Path)) {
            throw "Missing build artifact: $($item.Path)"
        }
        $length = (Get-Item -LiteralPath $item.Path).Length
        if ($length -le 0) {
            throw "Build artifact is empty: $($item.Label) ($($item.Path))"
        }
        Write-Host ("[build] Verified local {0} ({1} bytes)" -f $item.Label, $length) -ForegroundColor Green
    }

    Write-Host ("[build] Validating SasistPrinterAgent.exe (UI modules + VERSION)...") -ForegroundColor Cyan
    Invoke-AgentExeValidation -AgentExePath $AgentExePath -ExpectedVersion $ExpectedVersion -RepoRoot $RepoRoot

    Write-Host ("[build] UI smoke test (Status / Logi / Ustawienia)...") -ForegroundColor Cyan
    Invoke-AgentUiSmokeTest -AgentExePath $AgentExePath
}

function Invoke-OptionalSetupValidation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [string]$ExtractDirectory = ""
    )

    $sevenZip = Find-SevenZip
    if (-not $sevenZip) {
        Write-Host ("[build] Warning: 7-Zip not found - skipping optional installer setup validation.") -ForegroundColor Yellow
        Write-Host ("[build]          Install 7-Zip to validate SasistPrinterAgent.exe inside the setup EXE.") -ForegroundColor Yellow
        return $false
    }

    if (-not $ExtractDirectory) {
        $ExtractDirectory = Join-Path (Split-Path -Parent $InstallerPath) "_build_verify_extracted"
    }

    Write-Host ("[build] Optional setup validation (7Zip): {0}" -f $sevenZip) -ForegroundColor Cyan
    $installerAgentExe = Extract-AgentExeFromInstaller -InstallerPath $InstallerPath -OutputDirectory $ExtractDirectory
    if (-not $installerAgentExe) {
        Write-Host ("[build] Warning: could not extract SasistPrinterAgent.exe from installer - setup validation skipped.") -ForegroundColor Yellow
        return $false
    }

    Invoke-AgentExeValidation -AgentExePath $installerAgentExe -ExpectedVersion $ExpectedVersion -RepoRoot $RepoRoot
    Write-Host ("[build] Optional setup validation PASS") -ForegroundColor Green
    return $true
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
