/**
 * Jednorazowy capture mockupu v3 — wymaga działającego `npm run dev` na :5173.
 * node scripts/capture-panel-sidebar-mockup-v3.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "components", "panel", "mockups");
const outFile = path.join(outDir, "panel-status-sidebar-mockup-v3-screenshot.png");
const url = "https://127.0.0.1:5173/dev/panel-status-sidebar-mockup-screenshot";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 420, height: 1400 },
  ignoreHTTPSErrors: true,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#mockup-sidebar-screenshot");
await page.locator("#mockup-sidebar-screenshot").screenshot({ path: outFile });
await browser.close();

console.log(`Saved: ${outFile}`);
