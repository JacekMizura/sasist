$ErrorActionPreference = "Stop"
$log = "C:\ProgramData\Sasist\Agent\logs\upgrade-1.4.0.log"
function Log($m) { $line = "$(Get-Date -Format o) $m"; Add-Content -Path $log -Value $line; Write-Host $line }

try {
  $pub = "C:\Users\jacek_bbbkzut\Desktop\Analiza magazynowa\sasist-agent\publish\win-x64"
  $app = "C:\Program Files\Sasist\Agent"
  $backup = "C:\ProgramData\Sasist\Agent\backup-pre-1.4.0-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

  Log "STOP service"
  & sc.exe stop SasistAgent | Out-Null
  Start-Sleep -Seconds 3
  Get-Process -Name "Sasist.Agent.Host","Sasist.Agent.Tray" -ErrorAction SilentlyContinue | ForEach-Object {
    Log "KILL $($_.ProcessName) pid=$($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  $st = (Get-Service SasistAgent).Status
  Log "Service status=$st"
  if ($st -ne "Stopped") {
    & sc.exe stop SasistAgent | Out-Null
    Start-Sleep -Seconds 5
  }

  Log "BACKUP $backup"
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  & robocopy $app $backup /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

  Log "ROBOCOPY publish -> app"
  & robocopy $pub $app /MIR /E /R:3 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np
  $rc = $LASTEXITCODE
  Log "robocopy exit=$rc"
  if ($rc -ge 8) { throw "robocopy failed $rc" }

  $plugins = Join-Path $app "plugins"
  if (-not (Test-Path $plugins)) { New-Item -ItemType Directory -Path $plugins | Out-Null }
  Copy-Item (Join-Path $app "Sasist.Agent.Modules.Printing.dll") (Join-Path $plugins "Sasist.Agent.Modules.Printing.dll") -Force

  & sc.exe config SasistAgent binPath= "`"$app\Sasist.Agent.Host.exe`"" start= auto | Out-Null
  Log "START service"
  & sc.exe start SasistAgent | Out-Null
  Start-Sleep -Seconds 4
  Log "Service status=$((Get-Service SasistAgent).Status)"

  $dllPath = Join-Path $app "Sasist.Agent.Modules.Printing.dll"
  $bytes = [IO.File]::ReadAllBytes($dllPath)
  $t = [Text.Encoding]::ASCII.GetString($bytes)
  Log "Printing.dll size=$((Get-Item $dllPath).Length) time=$((Get-Item $dllPath).LastWriteTime)"
  Log "PdfShellPrint=$($t.Contains('PdfShellPrint')) Gdi=$($t.Contains('WindowsGdiDocumentPrinter')) PDFtoImage=$($t.Contains('PDFtoImage'))"
  Log "PDFtoImage.dll exists=$(Test-Path (Join-Path $app 'PDFtoImage.dll')) pdfium.dll exists=$(Test-Path (Join-Path $app 'pdfium.dll'))"
  Log "SUCCESS"
  exit 0
}
catch {
  Log "FAIL: $($_.Exception.Message)"
  exit 1
}
