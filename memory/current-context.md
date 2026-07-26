# current-context

## Active

**PrintMethodDialog** — standardowy dialog wyboru sposobu wydruku dla całego Sasist.

- Entry: `usePrintMethodFlow().requestPrint(handlers)`
- UI: `PrintMethodDialog` (DS `Dialog` + `PageHeader` + Primary/Secondary)
- Skip dialog gdy `hasDefaultCloudPrinter` (`a4_printer_id` / label / receipt)
- Handlers: `onBrowserPrint` | `onCloudPrint` | `onDownloadPdf`

Podpięte: produkcja (karty), dokumenty magazynowe. Kolejne moduły: etykiety, raporty, sprzedaż — ten sam flow.

## Layout Master (wcześniej)

SSOT layout tokens Label System dla Szablonów wydruków.
