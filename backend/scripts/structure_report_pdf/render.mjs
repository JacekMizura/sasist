/**
 * Reads full HTML document from stdin, writes PDF bytes to stdout.
 * Used by the FastAPI structure-report-pdf endpoint.
 */
import puppeteer from "puppeteer";

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
    // Screen styles — DTE templates define layout in global CSS, not @media print.
    await page.emulateMediaType("screen");
    // domcontentloaded: avoid hanging on external logo URLs; HTML is self-contained.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      // MUST stay false: preferCSSPageSize + @page margins in base_document.twig clip body text → blank PDF.
      preferCSSPageSize: false,
      scale: 1,
    });
    process.stdout.write(pdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
