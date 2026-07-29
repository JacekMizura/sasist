# current-context

## Active

**Sasist Agent 1.5.0** installed at `C:\Program Files\Sasist\Agent` (clean reinstall 2026-07-29). Service Running. Desktop shortcut → Tray.

**Versioning SSOT:** `sasist-agent/VERSION` → Directory.Build.props → EXE metadata / Tray / Host logs. `publish-release.ps1` auto-bumps patch unless `-NoBump`.

**Browser print:** production FE opens native PDF blob (no HTML wrapper / no noopener). Verified on batch 9.

**Station print:** PrintJob #18 → Agent 1.5.0 → `pdf-driver.log` `pipeline=PDFium->GDI` → Windows spooler `Sasist PDF GDI job 18` → status printed.
