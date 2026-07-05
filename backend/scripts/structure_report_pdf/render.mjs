/**
 * Reads full HTML document from stdin, writes PDF bytes to stdout.
 * Used by the FastAPI structure-report-pdf endpoint.
 *
 * Temporary diagnostics (PDF_RENDER_DEBUG=1):
 *   - HTML passed to Puppeteer, DOM probes, full-page screenshot before page.pdf()
 *   - browser console / pageerror / requestfailed
 *   - summary.json + stderr line with verdict hint
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";

function isDebugEnabled() {
  const v = (process.env.PDF_RENDER_DEBUG || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function ensureDebugDir() {
  const configured = (process.env.PDF_RENDER_DEBUG_DIR || "").trim();
  const dir = configured || path.join("/tmp", "pdf_render_debug", randomUUID());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeJsonl(filePath, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  await fs.writeFile(filePath, lines + (lines ? "\n" : ""), "utf-8");
}

function buildInterpretation({ domAppearsEmpty, bodyInnerTextChars, bodyRectHeight }) {
  if (domAppearsEmpty || bodyInnerTextChars < 10 || bodyRectHeight < 5) {
    return {
      stage: "BEFORE_PAGE_PDF",
      message:
        "DOM appears empty before page.pdf(). Open 05_pre_pdf_screenshot.png — if white, content was lost during setContent/CSS/DOM.",
    };
  }
  return {
    stage: "COMPARE_SCREENSHOT_VS_PDF",
    message:
      "DOM has text before page.pdf(). Open 05_pre_pdf_screenshot.png: if it shows content but 09_output.pdf is blank, the failure is in page.pdf() or Chromium print settings.",
  };
}

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

  const debug = isDebugEnabled();
  const debugDir = debug ? await ensureDebugDir() : null;
  const consoleLog = [];
  const pageErrors = [];
  const failedRequests = [];

  if (debug) {
    await fs.writeFile(path.join(debugDir, "00_input_html.html"), html, "utf-8");
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

    if (debug) {
      page.on("console", (msg) => {
        consoleLog.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
        });
      });
      page.on("pageerror", (err) => {
        pageErrors.push({
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
        });
      });
      page.on("requestfailed", (req) => {
        failedRequests.push({
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
          failure: req.failure()?.errorText ?? null,
        });
      });
    }

    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 120_000 });

    let domProbe = null;
    if (debug) {
      domProbe = await page.evaluate(() => {
        const body = document.body;
        const rect = body?.getBoundingClientRect();
        return {
          bodyInnerHTML: body?.innerHTML ?? "",
          bodyInnerText: body?.innerText ?? "",
          bodyRect: rect
            ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
              }
            : null,
          documentElementOuterHTML: document.documentElement?.outerHTML ?? "",
          documentElementScrollHeight: document.documentElement?.scrollHeight ?? 0,
          title: document.title ?? "",
        };
      });

      await fs.writeFile(
        path.join(debugDir, "01_body_innerHTML.html"),
        domProbe.bodyInnerHTML,
        "utf-8",
      );
      await fs.writeFile(
        path.join(debugDir, "02_body_innerText.txt"),
        domProbe.bodyInnerText,
        "utf-8",
      );
      await fs.writeFile(
        path.join(debugDir, "03_body_rect.json"),
        JSON.stringify(domProbe.bodyRect, null, 2),
        "utf-8",
      );
      await fs.writeFile(
        path.join(debugDir, "04_document_outerHTML.html"),
        domProbe.documentElementOuterHTML,
        "utf-8",
      );

      await page.screenshot({
        path: path.join(debugDir, "05_pre_pdf_screenshot.png"),
        fullPage: true,
      });
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      preferCSSPageSize: false,
      scale: 1,
    });

    if (debug) {
      await fs.writeFile(path.join(debugDir, "09_output.pdf"), pdf);
      await writeJsonl(path.join(debugDir, "06_browser_console.jsonl"), consoleLog);
      await writeJsonl(path.join(debugDir, "07_page_errors.jsonl"), pageErrors);
      await writeJsonl(path.join(debugDir, "08_failed_requests.jsonl"), failedRequests);

      const bodyInnerTextChars = domProbe.bodyInnerText.trim().length;
      const bodyRectHeight = domProbe.bodyRect?.height ?? 0;
      const domAppearsEmpty = bodyInnerTextChars < 10 || bodyRectHeight < 5;
      const interpretation = buildInterpretation({
        domAppearsEmpty,
        bodyInnerTextChars,
        bodyRectHeight,
      });

      const summary = {
        label: (process.env.PDF_RENDER_DEBUG_LABEL || "").trim() || null,
        debug_dir: debugDir,
        input_html_chars: html.length,
        body_innerHTML_chars: domProbe.bodyInnerHTML.length,
        body_innerText_chars: bodyInnerTextChars,
        body_innerText_preview: domProbe.bodyInnerText.trim().slice(0, 500),
        body_rect: domProbe.bodyRect,
        document_scroll_height: domProbe.documentElementScrollHeight,
        document_title: domProbe.title,
        screenshot_file: "05_pre_pdf_screenshot.png",
        output_pdf_file: "09_output.pdf",
        output_pdf_bytes: pdf.length,
        console_event_count: consoleLog.length,
        page_error_count: pageErrors.length,
        failed_request_count: failedRequests.length,
        dom_appears_empty: domAppearsEmpty,
        interpretation,
      };

      await fs.writeFile(
        path.join(debugDir, "summary.json"),
        JSON.stringify(summary, null, 2),
        "utf-8",
      );
      console.error(`[PDF_RENDER_DEBUG] ${JSON.stringify(summary)}`);
    }

    process.stdout.write(pdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
