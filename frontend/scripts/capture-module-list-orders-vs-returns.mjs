/**
 * Capture porównania wierszy Orders vs Returns — wymaga `npm run dev` na :5173.
 * node scripts/capture-module-list-orders-vs-returns.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "components", "listPage", "moduleList", "mockups");
const port = process.env.VITE_DEV_PORT ?? "5173";
const url = `https://127.0.0.1:${port}/dev/module-list-orders-vs-returns`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 2200 },
  ignoreHTTPSErrors: true,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#module-list-orders-vs-returns");
await page.addStyleTag({
  content: ".module-list-screenshot-page .module-list-row-actions { opacity: 1 !important; }",
});
await page.waitForTimeout(400);

const outFile = path.join(outDir, "module-list-orders-vs-returns.png");
await page.locator("#module-list-orders-vs-returns").screenshot({ path: outFile });
await browser.close();

console.log(`Saved: ${outFile}`);
