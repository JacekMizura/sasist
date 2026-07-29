$ErrorActionPreference = "Continue"
$log = "C:\ProgramData\Sasist\Agent\logs\clean-reinstall.log"
New-Item -ItemType Directory -Path "C:\ProgramData\Sasist\Agent\logs" -Force | Out-Null
function L([string]$m) {
  try { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format o), $m) -Encoding UTF8 } catch {}
  [Console]::WriteLine($m)
}
L "SCRIPT_START"
try {
  $ErrorActionPreference = "Stop"
  $pub = 'C:\Users\jacek_bbbkzut\Desktop\Analiza magazynowa\sasist-agent\publish\win-x64'
  $app = 'C:\Program Files\Sasist\Agent'
  $svc = 'SasistAgent'
  L ("pub_exists=" + (Test-Path (Join-Path $pub 'Sasist.Agent.Host.exe')))
  if (-not (Test-Path (Join-Path $pub 'Sasist.Agent.Host.exe'))) { throw "Missing publish Host.exe" }
  $version = (Get-Content (Join-Path $pub 'VERSION') -Raw).Trim()
  L ("version=" + $version)

  L "stop_service"
  & sc.exe stop $svc 2>&1 | Out-Null
  Start-Sleep 3
  Get-Process Sasist.Agent.Host,Sasist.Agent.Tray -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2

  L "delete_service"
  & sc.exe delete $svc 2>&1 | Out-Null
  Start-Sleep 2

  if (Test-Path $app) {
    L "remove_appdir"
    cmd /c "rmdir /s /q `"$app`""
    Start-Sleep 1
  }

  $desktops = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory')
  )
  foreach ($d in $desktops) {
    foreach ($name in @('Sasist Agent.lnk','Sasist Printer Agent.lnk')) {
      $p = Join-Path $d $name
      if (Test-Path $p) { Remove-Item $p -Force; L ("removed " + $p) }
    }
  }

  L "mkdir_app"
  New-Item -ItemType Directory -Path $app -Force | Out-Null
  L "robocopy"
  $robolog = "C:\ProgramData\Sasist\Agent\logs\robocopy-out.txt"
  cmd /c "robocopy `"$pub`" `"$app`" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np > `"$robolog`" 2>&1"
  $rc = $LASTEXITCODE
  L ("robocopy_exit=" + $rc)
  if ($rc -ge 8) { throw ("robocopy failed " + $rc) }

  $plugins = Join-Path $app 'plugins'
  New-Item -ItemType Directory -Path $plugins -Force | Out-Null
  Copy-Item (Join-Path $app 'Sasist.Agent.Modules.Printing.dll') (Join-Path $plugins 'Sasist.Agent.Modules.Printing.dll') -Force

  $hostExe = Join-Path $app 'Sasist.Agent.Host.exe'
  L "create_service"
  $createOut = & sc.exe create $svc binPath= "`"$hostExe`"" start= auto DisplayName= "Sasist Agent" 2>&1 | Out-String
  L $createOut.Trim()
  & sc.exe config $svc binPath= "`"$hostExe`"" start= auto 2>&1 | Out-Null
  & sc.exe start $svc 2>&1 | Out-Null
  Start-Sleep 5
  $st = (Get-Service $svc -ErrorAction Stop).Status
  L ("service=" + $st)
  if ("$st" -ne 'Running') { throw "service not running" }

  $tray = Join-Path $app 'Sasist.Agent.Tray.exe'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnkPath = Join-Path $desktop 'Sasist Agent.lnk'
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  $lnk.TargetPath = $tray
  $lnk.WorkingDirectory = $app
  $lnk.Description = "Sasist Agent $version"
  $lnk.Save()
  L ("shortcut=" + $lnkPath)

  $vi = (Get-Item $hostExe).VersionInfo
  L ("FileVersion=" + $vi.FileVersion + " ProductVersion=" + $vi.ProductVersion)
  L "SUCCESS"
  exit 0
}
catch {
  L ("FAIL " + $_.Exception.Message)
  exit 1
}
