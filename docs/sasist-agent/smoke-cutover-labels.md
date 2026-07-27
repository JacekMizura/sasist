# Smoke checklist — QZ → Sasist Agent label cutover

Use warehouse with `prefer_sasist_agent = true`, online .NET Sasist Agent reporting `supported_formats` including **zpl**, and a default **label** printer.

## Happy path

- [ ] Zebra: Z-PZ close → job appears in queue → label prints via Agent
- [ ] Brother: return label print → Agent queue → printed
- [ ] PDF payload (Z-PZ / return): Agent downloads/prints PDF (jobFormat=pdf, gate=zpl)
- [ ] LabelPrintQueue location print → resolvePrintRoute + queue
- [ ] Multiple copies (set copies on job / defaults) — verify N pages/labels

## Failure / fallback

- [ ] Timeout / slow printer — job fails with error message in queue UI
- [ ] Missing printer mapping — fallback browser or QZ (telemetry `no_default_printer`)
- [ ] Agent offline — fallback QZ/browser (`no_online_agent`); no crash
- [ ] Agent online without `zpl` capability — fallback (`unsupported_capability`)
- [ ] Rollback: set `prefer_sasist_agent = false` → next print uses QZ/browser path **without** restart/login
- [ ] QZ fallback: with flag on but Agent down, QZ still prints if Tray available

## Dialog

- [ ] PrintMethodDialog order: Sasist Agent → Przeglądarka → Pobierz PDF
- [ ] With prefer flag: QZ hidden until „Pokaż metody awaryjne”
- [ ] Agent tile disabled when cloud-capability not ready

## Telemetry

Inspect `sessionStorage['sasist.print.telemetry.v1']` or `getPrintTelemetry()`:

- [ ] `printed_via_agent` increments on Agent path
- [ ] `printed_via_qz` / `printed_via_browser` on fallbacks
- [ ] `unsupported_capability` / `fallback_reason` populated
