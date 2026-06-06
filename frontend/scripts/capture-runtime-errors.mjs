import { chromium } from "playwright";

const base = process.env.VITE_URL ?? "http://127.0.0.1:4173";

const ROUTES = [
  "/",
  "/login",
  "/products",
  "/products/133/edit",
  "/products/new",
  "/wms/picking",
  "/wms/picking/products",
  "/wms/picking/products/1",
  "/wms/direct-sales",
  "/warehouse-designer",
  "/dashboard",
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", (err) => {
    errors.push({
      route: page.url(),
      kind: "pageerror",
      message: err.message,
      stack: err.stack ?? "",
    });
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" && /lexical|initialization|ReferenceError|window\.onerror/i.test(text)) {
      errors.push({ route: page.url(), kind: "console", message: text });
    }
  });

  // Initial load — catches eager App.tsx import TDZ
  try {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    errors.push({ route: "/", kind: "goto", message: String(e) });
  }

  for (const route of ROUTES) {
    if (route === "/") continue;
    try {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
    } catch (e) {
      errors.push({ route, kind: "goto", message: String(e) });
    }
  }

  if (errors.length) {
    console.log("=== RUNTIME ERRORS ===");
    for (const e of errors) {
      console.log(JSON.stringify(e, null, 2));
    }
    process.exitCode = 1;
  } else {
    console.log(`No TDZ/runtime errors on ${ROUTES.length} routes (${base})`);
  }
  await browser.close();
}

void main();
