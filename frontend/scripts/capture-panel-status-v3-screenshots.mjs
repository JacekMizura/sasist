/**
 * Capture wdrożenia v3 — wymaga `npm run dev` na :5173.
 * node scripts/capture-panel-status-v3-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "components", "panel", "mockups");
const url = "https://127.0.0.1:5173/dev/panel-status-v3-screenshots";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 2200 },
  ignoreHTTPSErrors: true,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const frames = page.locator("div").filter({ has: page.getByText("1. Zamówienia") }).first();
await page.screenshot({
  path: path.join(outDir, "panel-status-v3-production-screenshots.png"),
  fullPage: true,
});

const titles = ["1. Zamówienia", "2. Zwroty (statusy + operacyjne)", "3. Reklamacje", "4. Dropdown masowej zmiany statusu"];
for (const title of titles) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const frame = page.locator("p", { hasText: title }).locator("..");
  await frame.screenshot({ path: path.join(outDir, `panel-status-v3-${slug}.png`) });
}

await browser.close();
console.log(`Saved screenshots to ${outDir}`);
