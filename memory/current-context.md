# current-context

## Active

**PDF print architecture (Agent):** PDF → PDFium render → GDI `PrintDocument`. `WindowsRawSpooler` only for native languages (ZPL/EPL/ESC-POS/PCL/PostScript/raw). `DriverFactory` resolves format → `IPrintDriver`.

**Print dialog UX:** template + place (workstation) + PDF/browser alternatives; prefs per document type.
