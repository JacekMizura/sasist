import { chromium } from "playwright";

const base = process.env.VITE_URL ?? "https://localhost:5173";

const ROUTES = [
  "/wms/picking",
  "/wms/picking/products",
  "/wms/picking/products/1",
  "/wms/picking/recovery/1196",
  "/wms/picking/cart",
  "/wms/picking/order-type",
  "/wms/braki",
  "/wms/picking/recovery/batch/1",
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
    if (msg.type() === "error" && /lexical|initialization|ReferenceError/i.test(msg.text())) {
      errors.push({ route: page.url(), kind: "console", message: msg.text() });
    }
  });

  for (const route of ROUTES) {
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
    console.log(`No TDZ/runtime errors on ${ROUTES.length} picking routes`);
  }
  await browser.close();
}

void main();
