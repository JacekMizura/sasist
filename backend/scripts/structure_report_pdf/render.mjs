/**
 * Reads full HTML document from stdin, writes PDF bytes to stdout.
 * DTE documents (Twig HTML via setContent) — NOT aligned with render_from_url.mjs:
 * layout/CSS is authored for screen; preferCSSPageSize stays false (@page clip → blank PDF).
 */
import { isTimeoutError, launchBrowser } from "./puppeteer_pdf_shared.mjs";

const RENDER_TIMEOUT_MS = 120_000;
const RENDER_TIMEOUT_MESSAGE = "HTML document rendering timeout";

/** @type {import("puppeteer").PDFOptions} */
const DTE_PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  margin: {
    top: "12mm",
    right: "12mm",
    bottom: "12mm",
    left: "12mm",
  },
  // MUST stay false: preferCSSPageSize + @page margins clip body text → blank PDF.
  preferCSSPageSize: false,
  scale: 1,
};

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
    // Screen styles — DTE layout lives in global CSS, not @media print.
    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf(DTE_PDF_OPTIONS);
    process.stdout.write(pdf);
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error(RENDER_TIMEOUT_MESSAGE);
      process.exit(2);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
