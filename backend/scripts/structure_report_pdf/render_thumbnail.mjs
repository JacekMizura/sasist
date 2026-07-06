/**
 * Reads full HTML from stdin, writes PNG thumbnail (A4 viewport) to stdout.
 */
import { launchBrowser } from "./puppeteer_pdf_shared.mjs";

const VIEWPORT = { width: 595, height: 842, deviceScaleFactor: 1 };
const RENDER_TIMEOUT_MS = 90_000;

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const html = Buffer.concat(chunks).toString("utf-8");
  if (!html.trim()) {
    console.error("structure_report_pdf: empty HTML on stdin");
    process.exit(1);
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    process.stdout.write(png);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
