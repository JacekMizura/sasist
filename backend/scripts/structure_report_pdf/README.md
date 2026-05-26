# Raport struktury magazynu → PDF (Puppeteer)

Backend renders HTML (Jinja2) i przekazuje ją do `render.mjs` (stdin → PDF stdout).

## Instalacja

W tym katalogu:

```bash
npm install
```

Wymagany jest **Node.js** (LTS). Pierwsze uruchomienie pobierze Chromium przez Puppeteer.

## Zależności Python

```bash
pip install jinja2
```

## Rozwiązywanie problemów

- **Linux / Docker:** Puppeteer może wymagać bibliotek systemowych dla Chromium; w `render.mjs` użyto `--no-sandbox` pod typowe środowiska CI.
- Brak `node` w PATH — endpoint zwróci błąd 500 z komunikatem o braku skryptu.
