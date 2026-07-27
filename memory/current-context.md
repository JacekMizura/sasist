# current-context

## Active

**Sasist Agent 1.1.0 — desktop product UI**

- Main window (not tray-only): Status, Urządzenia (+ test print), Zadania, Logi, Diagnostyka, pairing overlay
- Installer upgrade-safe (stop/kill before file copy) — verified silent upgrade 1.0.0 → 1.1.0, no DeleteFile code 5
- Official setup: `sasist-agent/dist/SasistAgentSetup.exe` (also `Output/`)

**Important:** Old **Sasist Printer Agent** (Python) may still be installed separately at `C:\Program Files\Sasist\PrinterAgent\` — uninstall from Windows Apps. New product name is **Sasist Agent**.

Next: publish GitHub Release with `SasistAgentSetup.exe` so ERP download is not the legacy Printer Agent.
