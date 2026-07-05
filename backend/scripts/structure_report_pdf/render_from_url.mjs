/**
 * Reads target URL from argv and writes PDF bytes to stdout.
 * Puppeteer stack aligned with render.mjs (see puppeteer_pdf_shared.mjs).
 */
import {
  PDF_OPTIONS,
  RENDER_TIMEOUT_MS,
  isTimeoutError,
  launchBrowser,
} from "./puppeteer_pdf_shared.mjs";

const RENDER_TIMEOUT_MESSAGE =
  "Report rendering timeout - frontend not reachable or data failed to load";

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error("render_from_url: missing URL argument");
    process.exit(1);
  }

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
    await page.waitForSelector("[data-report-ready='true']", {
      timeout: RENDER_TIMEOUT_MS,
    });
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
