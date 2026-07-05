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

function countPdfPages(pdfBuffer) {
  const s = pdfBuffer.toString("latin1");
  const countMatch = s.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  if (countMatch) {
    return parseInt(countMatch[1], 10);
  }
  const pageMatches = s.match(/\/Type\s*\/Page\b/g);
  return pageMatches ? pageMatches.length : null;
}

function buildStageAndInterpretation({
  htmlLength,
  bodyInnerTextLength,
  domNodeCount,
  bodyRect,
}) {
  const bodyHeight = bodyRect?.height ?? 0;

  if (htmlLength < 50) {
    return {
      stage: "1_INPUT_HTML_MISSING",
      interpretation:
        "HTML przekazany do Puppeteera jest pusty lub minimalny. Problem jest przed setContent (backend / Twig / provider).",
    };
  }
  if (bodyInnerTextLength < 10 || domNodeCount < 5 || bodyHeight < 5) {
    return {
      stage: "2_DOM_EMPTY",
      interpretation:
        "HTML dociera do Puppeteera, ale DOM po setContent nie ma treści. Otwórz 05_pre_pdf_screenshot.png — jeśli biały, treść znika przed page.pdf() (setContent / CSS / DOM).",
    };
  }
  return {
    stage: "3_DOM_HAS_CONTENT",
    interpretation:
      "HTML dociera i DOM ma treść przed page.pdf(). Porównaj 05_pre_pdf_screenshot.png z 09_output.pdf: jeśli screenshot OK, a PDF biały, treść znika w page.pdf() / Chromium.",
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
        const style = body ? window.getComputedStyle(body) : null;
        return {
          bodyInnerHTML: body?.innerHTML ?? "",
          bodyInnerText: body?.innerText ?? "",
          domNodeCount: [...document.querySelectorAll("*")].length,
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
          bodyStyle: style
            ? {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                color: style.color,
                background: style.background,
                fontSize: style.fontSize,
                transform: style.transform,
                zoom: style.zoom,
                width: body.offsetWidth,
                height: body.offsetHeight,
                scrollWidth: body.scrollWidth,
                scrollHeight: body.scrollHeight,
              }
            : null,
          documentElementOuterHTML: document.documentElement?.outerHTML ?? "",
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

      const bodyInnerTextLength = domProbe.bodyInnerText.trim().length;
      const { stage, interpretation } = buildStageAndInterpretation({
        htmlLength: html.length,
        bodyInnerTextLength,
        domNodeCount: domProbe.domNodeCount,
        bodyRect: domProbe.bodyRect,
      });

      const summary = {
        debug_dir: debugDir,
        label: (process.env.PDF_RENDER_DEBUG_LABEL || "").trim() || null,
        html_length: html.length,
        body_inner_text_length: bodyInnerTextLength,
        dom_node_count: domProbe.domNodeCount,
        body_rect: domProbe.bodyRect,
        body_style: domProbe.bodyStyle,
        pdf_bytes: pdf.length,
        pdf_pages: countPdfPages(pdf),
        stage,
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
