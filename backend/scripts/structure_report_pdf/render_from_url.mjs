/**
 * Reads target URL from argv and writes PDF bytes to stdout.
 * Used by FastAPI reports endpoint for frontend-rendered HTML -> PDF.
 */
import puppeteer from "puppeteer";

const RENDER_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MESSAGE =
  "Report rendering timeout - frontend not reachable or data failed to load";

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error("render_from_url: missing URL argument");
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
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
    await page.waitForSelector("[data-report-ready='true']", {
      timeout: RENDER_TIMEOUT_MS,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        bottom: "20px",
        left: "20px",
        right: "20px",
      },
    });
    process.stdout.write(pdf);
  } catch (err) {
    const isTimeout =
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err.name === "TimeoutError" || String(err).toLowerCase().includes("timeout"));
    if (isTimeout) {
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
