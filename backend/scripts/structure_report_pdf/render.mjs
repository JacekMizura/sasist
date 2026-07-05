/**
 * Reads full HTML document from stdin, writes PDF bytes to stdout.
 * Puppeteer stack aligned with render_from_url.mjs (see puppeteer_pdf_shared.mjs).
 */
import {
  PDF_OPTIONS,
  RENDER_TIMEOUT_MS,
  isTimeoutError,
  launchBrowser,
} from "./puppeteer_pdf_shared.mjs";

const RENDER_TIMEOUT_MESSAGE = "HTML document rendering timeout";

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
    await page.setContent(html, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf(PDF_OPTIONS);
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
