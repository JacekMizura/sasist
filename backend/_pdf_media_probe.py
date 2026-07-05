"""Test preferCSSPageSize clipping with emulateMediaType print vs screen."""
import io
import json
import subprocess
from pathlib import Path

from pypdf import PdfReader

from backend._pdf_probe_temp import build_dte_html

ROOT = Path(__file__).resolve().parent.parent
RENDER_DIR = Path(__file__).resolve().parent / "scripts" / "structure_report_pdf"

SCRIPT = RENDER_DIR / "_probe_media.mjs"
SCRIPT.write_text(
    """
import puppeteer from 'puppeteer';
const html = await new Promise((res, rej) => {
  const c = []; process.stdin.on('data', d => c.push(d));
  process.stdin.on('end', () => res(Buffer.concat(c).toString('utf-8')));
  process.stdin.on('error', rej);
});
const media = process.argv[2];
const preferCSS = process.argv[3] === 'true';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulateMediaType(media);
await page.setContent(html, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready);
const dom = await page.evaluate(() => ({
  innerLen: (document.body?.innerText || '').trim().length,
  start: (document.body?.innerText || '').trim().slice(0, 80),
}));
const pdf = await page.pdf({
  format: 'A4', printBackground: true,
  margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
  preferCSSPageSize: preferCSS, scale: 1,
});
await browser.close();
process.stdout.write(JSON.stringify({ media, preferCSS, dom, pdfBytes: pdf.length, pdfB64: pdf.toString('base64') }));
""",
    encoding="utf-8",
)

old_block = (
    "@page { size: A4; margin: 14mm 12mm 18mm 12mm; }\n"
    "    @bottom-center { content: 'Strona ' counter(page); font-size: 8px; color: #666; }"
)
dte = build_dte_html()
dte_old = dte.replace("@page {\n      size: A4;\n    }", old_block, 1)

import base64

for html_label, html in [("current_css", dte), ("old_css", dte_old)]:
    for media in ("screen", "print"):
        for pref in (False, True):
            proc = subprocess.run(
                ["node", str(SCRIPT), media, "true" if pref else "false"],
                input=html.encode("utf-8"),
                capture_output=True,
                cwd=str(RENDER_DIR),
                timeout=120,
            )
            data = json.loads(proc.stdout.decode())
            pdf = base64.b64decode(data.pop("pdfB64"))
            text = "".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf)).pages)
            print(
                json.dumps(
                    {
                        "html": html_label,
                        "media": media,
                        "preferCSS": pref,
                        "dom_inner_len": data["dom"]["innerLen"],
                        "pdf_bytes": data["pdfBytes"],
                        "pdf_text_len": len(text.strip()),
                        "pdf_text_start": text.strip()[:60],
                    },
                    ensure_ascii=False,
                )
            )
