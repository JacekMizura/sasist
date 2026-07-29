@echo off
:: Double-click this file and accept UAC to upgrade Sasist Agent to PDFium/GDI build.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"C:\ProgramData\Sasist\Agent\upgrade-inplace-admin.ps1\"'"
echo.
echo Exit done. Check C:\ProgramData\Sasist\Agent\logs\upgrade-1.4.0.log
pause
