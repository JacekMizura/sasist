/** Capture section screenshots for returns status configurator UX mockup page. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../src/pages/Settings/returnsStatusesConfigurator/mockups");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "https://127.0.0.1:4173/dev/returns-statuses-configurator-screenshots";

const sections = [
  { selector: "text=Sekcja 1 — Etykiety listy", file: "returns-configurator-section-1-labels.png" },
  { selector: "text=Sekcja 2 — Decyzje produktowe", file: "returns-configurator-section-2-decisions.png" },
  { selector: "text=Sekcja 3 — Statusy RMZ", file: "returns-configurator-section-3-rmz.png" },
  { selector: "text=Sekcja 4 — Uszkodzenia", file: "returns-configurator-section-4-damage.png" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });

for (const { selector, file } of sections) {
  const heading = page.locator("h2", { hasText: selector.replace("text=", "") });
  const block = heading.locator("xpath=..");
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await block.screenshot({ path: path.join(outDir, file) });
  console.log("Saved", file);
}

await page.screenshot({ path: path.join(outDir, "returns-configurator-full-page.png"), fullPage: true });
console.log("Saved returns-configurator-full-page.png");
await browser.close();
