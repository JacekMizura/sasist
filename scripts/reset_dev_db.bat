@echo off
setlocal
cd /d "%~dp0.."

echo.
echo === Dev DB reset (stop backend first) ===
echo.

python scripts\reset_dev_db.py %*
set EXITCODE=%ERRORLEVEL%

if %EXITCODE% NEQ 0 (
  echo.
  echo Reset failed with exit code %EXITCODE%.
  pause
  exit /b %EXITCODE%
)

echo.
pause
exit /b 0
