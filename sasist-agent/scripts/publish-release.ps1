#Requires -Version 5.1
<#
.SYNOPSIS
  Builds Release, publishes win-x64 (self-contained), creates SasistAgentSetup.exe.

.NOTES
  Shipping MUST come from publish\win-x64 (self-contained).
  Never copy bin\Release\net8.0-windows - that is framework-dependent and requires .NET 8 Runtime.
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$SkipInstaller,
    [switch]$NoBump,
    [ValidateSet("major", "minor", "patch")]
    [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PublishDir = Join-Path $Root "publish\$Runtime"
$DistDir = Join-Path $Root "dist"
$Sln = Join-Path $Root "Sasist.Agent.sln"
$Iss = Join-Path $Root "installer\SasistAgent.iss"

. (Join-Path $PSScriptRoot "lib\agent-version.ps1")

Write-Host "== Sasist Agent release build ==" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Mode: self-contained $Runtime (NOT framework-dependent)"

if ($NoBump) {
    $version = Get-AgentVersion -Root $Root
    Set-AgentVersion -Version $version -Root $Root  # sync iss / files
    Write-Host "Version (no bump): $version" -ForegroundColor Yellow
}
else {
    $version = Bump-AgentVersion -Part $Bump -Root $Root
    Write-Host "Version bumped to: $version" -ForegroundColor Yellow
}

$IsccCandidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "d:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
$Iscc = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Iscc -and -not $SkipInstaller) {
    throw "ISCC.exe not found (Inno Setup 6). Install Inno Setup or use -SkipInstaller."
}

Write-Host ""
Write-Host "[1/5] dotnet restore / build Release..." -ForegroundColor Yellow
dotnet restore $Sln
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed" }
dotnet build $Sln -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed" }

Write-Host ""
Write-Host "[2/5] Publish Host (self-contained $Runtime)..." -ForegroundColor Yellow
if (Test-Path $PublishDir) { Remove-Item $PublishDir -Recurse -Force }
New-Item -ItemType Directory -Path $PublishDir | Out-Null

dotnet publish (Join-Path $Root "src\Sasist.Agent.Host\Sasist.Agent.Host.csproj") `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=false `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $PublishDir
if ($LASTEXITCODE -ne 0) { throw "Host publish failed" }

Write-Host ""
Write-Host "[3/5] Publish Tray into same folder..." -ForegroundColor Yellow
dotnet publish (Join-Path $Root "src\Sasist.Agent.Tray\Sasist.Agent.Tray.csproj") `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=false `
    -o $PublishDir
if ($LASTEXITCODE -ne 0) { throw "Tray publish failed" }

$plugins = Join-Path $PublishDir "plugins"
if (-not (Test-Path $plugins)) { New-Item -ItemType Directory -Path $plugins | Out-Null }
Get-ChildItem $PublishDir -Filter "Sasist.Agent.Modules.*.dll" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName (Join-Path $plugins $_.Name) -Force }

Copy-Item (Join-Path $Root "config\config.default.json") (Join-Path $PublishDir "config.default.json") -Force
Copy-Item (Join-Path $Root "config\config.example.json") (Join-Path $PublishDir "config.example.json") -Force
Copy-Item (Join-Path $Root "VERSION") (Join-Path $PublishDir "VERSION") -Force

Write-Host ""
Write-Host "[4/5] Verify self-contained (fail if framework-dependent)..." -ForegroundColor Yellow
function Assert-SelfContained([string]$exeName) {
    $exe = Join-Path $PublishDir $exeName
    if (-not (Test-Path $exe)) { throw "Missing $exe" }
    $rcPath = [IO.Path]::ChangeExtension($exe, ".runtimeconfig.json")
    if (-not (Test-Path $rcPath)) { throw "Missing $rcPath" }
    $rc = Get-Content $rcPath -Raw
    if ($rc -match '"frameworks"\s*:') {
        throw "$exeName is FRAMEWORK-DEPENDENT (runtimeconfig has frameworks[]). Refusing to ship."
    }
    if ($rc -notmatch '"includedFrameworks"\s*:') {
        throw "$exeName runtimeconfig missing includedFrameworks - not a valid self-contained publish."
    }
    if (-not (Test-Path (Join-Path $PublishDir "coreclr.dll"))) {
        throw "Missing coreclr.dll in publish - runtime not bundled."
    }
    $len = (Get-Item $exe).Length
    Write-Host ("OK  {0}  size={1}  includedFrameworks + coreclr.dll" -f $exeName, $len)
}

Assert-SelfContained "Sasist.Agent.Host.exe"
Assert-SelfContained "Sasist.Agent.Tray.exe"

$pubBytes = (Get-ChildItem $PublishDir -Recurse -File | Measure-Object Length -Sum).Sum
$pubSizeMb = [math]::Round($pubBytes / 1MB, 1)
Write-Host ("Publish OK: {0} ({1} MB)" -f $PublishDir, $pubSizeMb) -ForegroundColor Green
Get-ChildItem $PublishDir -Filter "*.exe" | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table

if ($SkipInstaller) {
    Write-Host "SkipInstaller - Inno Setup skipped." -ForegroundColor DarkYellow
    exit 0
}

Write-Host ""
Write-Host "[5/5] Inno Setup -> SasistAgentSetup.exe (from publish\$Runtime ONLY)..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
& $Iscc $Iss
if ($LASTEXITCODE -ne 0) { throw "ISCC failed" }

$Setup = Join-Path $DistDir "SasistAgentSetup.exe"
if (-not (Test-Path $Setup)) { throw "Missing $Setup" }

$setupMb = [math]::Round((Get-Item $Setup).Length / 1MB, 1)
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host ("Version:   {0}" -f $version)
Write-Host ("Installer: {0}  ({1} MB)" -f $Setup, $setupMb)
Write-Host ("Publish:   {0}  ({1} MB)" -f $PublishDir, $pubSizeMb)
Write-Host ""
Write-Host "IMPORTANT: Install ONLY via SasistAgentSetup.exe." -ForegroundColor Yellow
Write-Host "Never copy bin\Release - that build requires .NET 8 Runtime." -ForegroundColor Yellow
