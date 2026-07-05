/**
 * Shared Puppeteer launch + page.pdf() options for stdin and URL PDF renderers.
 * Keep render.mjs and render_from_url.mjs aligned — only navigation/input may differ.
 */
import puppeteer from "puppeteer";

export const RENDER_TIMEOUT_MS = 15_000;

export const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

/** @type {import("puppeteer").PDFOptions} */
export const PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  margin: {
    top: "20px",
    bottom: "20px",
    left: "20px",
    right: "20px",
  },
  preferCSSPageSize: false,
  scale: 1,
};

export function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });
}

export function isTimeoutError(err) {
  return (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err.name === "TimeoutError" || String(err).toLowerCase().includes("timeout"))
  );
}
