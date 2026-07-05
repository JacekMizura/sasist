/**
 * Reads full HTML from stdin, writes PNG thumbnail (A4 preview) to stdout.
 * Same Puppeteer stack as render.mjs — used for starter gallery miniatures.
 */
import puppeteer from "puppeteer";

const VIEWPORT = { width: 595, height: 842, deviceScaleFactor: 1 };

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

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 90_000 });
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
