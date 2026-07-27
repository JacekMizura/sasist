# Sasist Printer Agent

Windows agent for PDF printing via Sasist backend API.

## Requirements

- Windows 10/11 x64
- Network access to Sasist backend

## Development

```powershell
cd sasist-printer-agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Copy and edit config:

```powershell
copy config\config.example.json $env:ProgramData\Sasist\PrinterAgent\config.json
notepad $env:ProgramData\Sasist\PrinterAgent\config.json
```

Set `server_url` to your Sasist instance (e.g. `https://app.example.com`).

Run:

```powershell
python -m agent
```

## Production build (installer)

Build **from repository root** after installing dependencies:

```powershell
cd sasist-printer-agent
python -m pip install pyinstaller pywin32 pystray Pillow requests
python -m PyInstaller agent.spec
python -m PyInstaller service.spec
python -m PyInstaller updater.spec
cd ..
iscc installer\installer.iss
```

Or use the helper script:

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

### Build artifacts

| Step | Output |
|------|--------|
| `pyinstaller agent.spec` | `sasist-printer-agent\dist\SasistPrinterAgent.exe` |
| `pyinstaller service.spec` | `sasist-printer-agent\dist\SasistPrinterService.exe` |
| `pyinstaller updater.spec` | `sasist-printer-agent\dist\SasistPrinterUpdater.exe` |
| `iscc installer\installer.iss` | `Output\SasistPrinterAgent-Setup-1.0.0.exe` |

The installer ships **only PyInstaller EXEs** plus `config.example.json` and `icon.ico` — no `.py` sources.

### What the installer deploys

| Target | Content |
|--------|---------|
| `C:\Program Files\Sasist\PrinterAgent\` | Agent, Service, Updater EXEs, `config\`, `assets\`, `installer\install.ps1` |
| `%ProgramData%\Sasist\PrinterAgent\` | `config.json` (seeded on first install), `logs\` |
| Windows Service | `SasistPrinterService` — Automatic start, recovery restart ×3 |
| Shortcuts | Start menu + desktop: Tray, Logs, Config |

### Upgrade behaviour

1. Inno Setup stops `SasistPrinterService` before copying files.
2. Binaries in Program Files are overwritten.
3. `install.ps1` preserves existing `config.json`, re-applies service auto-start + recovery, starts service.

### Manual install (PowerShell as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File installer\install.ps1 -InstallDir "C:\Program Files\Sasist\PrinterAgent"
```

Note: run only after copying the three EXEs to the install directory (normally handled by the Inno installer).

### Uninstall

Use **Apps & features** → Sasist Printer Agent, or rerun uninstaller from `Output\`. This stops the service and runs `SasistPrinterService.exe remove`.

Logs: `%ProgramData%\Sasist\PrinterAgent\logs\agent.log`

## Automated release

### One-time setup

Install [GitHub CLI](https://cli.github.com/) and authenticate:

```powershell
gh auth login
```

### Release from your machine

1. Edit `RELEASE_NOTES.md` in the repository root (release notes for GitHub).
2. Run from the **repository root**:

```powershell
powershell -ExecutionPolicy Bypass -File release.ps1 -Version 1.0.6
```

The script will:

1. Bump `sasist-printer-agent/VERSION` via `scripts\bump-version.ps1`
2. Commit, push (`Printer Agent vX.Y.Z`)
3. Build the installer (`installer\build.ps1`)
4. Create or update GitHub Release `vX.Y.Z` with `Output\SasistPrinterAgent-Setup-X.Y.Z.exe`
5. Run `scripts\verify-release.ps1`

Any failed step stops the process with a non-zero exit code.

### Release via GitHub Actions (tag push)

After `VERSION` is bumped and committed on the default branch:

```powershell
git tag v1.0.6
git push origin v1.0.6
```

Workflow `.github/workflows/printer-agent-release.yml` will build the installer, publish the GitHub Release, upload the Setup.exe asset, and verify the release.

## Tests

```powershell
cd sasist-printer-agent
pytest tests -q
```
