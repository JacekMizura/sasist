#Requires -Version 5.1
<#
.SYNOPSIS
  Builds Release, publishes win-x64 (self-contained), creates SasistAgentSetup.exe.
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PublishDir = Join-Path $Root "publish\$Runtime"
$DistDir = Join-Path $Root "dist"
$Sln = Join-Path $Root "Sasist.Agent.sln"
$Iss = Join-Path $Root "installer\SasistAgent.iss"

Write-Host "== Sasist Agent release build ==" -ForegroundColor Cyan
Write-Host "Root: $Root"

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
Write-Host "[1/4] dotnet restore / build Release..." -ForegroundColor Yellow
dotnet restore $Sln
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed" }
dotnet build $Sln -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed" }

Write-Host ""
Write-Host "[2/4] Publish Host (self-contained $Runtime)..." -ForegroundColor Yellow
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
Write-Host "[3/4] Publish Tray into same folder..." -ForegroundColor Yellow
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

Write-Host "Publish OK: $PublishDir" -ForegroundColor Green
Get-ChildItem $PublishDir -Filter "*.exe" | Select-Object Name, Length | Format-Table

if ($SkipInstaller) {
    Write-Host "SkipInstaller - Inno Setup skipped." -ForegroundColor DarkYellow
    exit 0
}

Write-Host ""
Write-Host "[4/4] Inno Setup -> SasistAgentSetup.exe..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
& $Iscc $Iss
if ($LASTEXITCODE -ne 0) { throw "ISCC failed" }

$Setup = Join-Path $DistDir "SasistAgentSetup.exe"
if (-not (Test-Path $Setup)) { throw "Missing $Setup" }

$Instr = Join-Path $Root "INSTALACJA.md"
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Installer: $Setup"
Write-Host "Publish:   $PublishDir"
Write-Host "Docs:      $Instr"
