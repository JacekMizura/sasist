/**
 * Visual QA after API login: labels vs print templates.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("tmp-visual-qa");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "https://localhost:5173";
const API = "http://127.0.0.1:8010/api";

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "admin", password: "admin" }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} ${await res.text()}`);
  return res.json();
}

async function measure(page, pageLabel) {
  return page.evaluate((label) => {
    const qa = (sel) => Array.from(document.querySelectorAll(sel));
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        bottom: Math.round(r.bottom),
        right: Math.round(r.right),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow === "none" ? "none" : "present",
        gap: cs.gap,
      };
    };

    const h1s = qa("h1").map((h) => ({
      text: (h.textContent || "").trim(),
      ...rect(h),
    }));

    const tablists = qa('[role="tablist"]').map((t) => ({
      text: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
      ...rect(t),
    }));

    const asides = qa("aside").map((a) => rect(a));
    const searches = qa('input[type="search"]').map((i) => rect(i));
    const articles = qa("article").slice(0, 4).map((a) => {
      const kids = Array.from(a.children);
      const band = kids[0] || null;
      return { card: rect(a), band: rect(band), body: rect(kids[1] || null) };
    });

    const buttons = qa("button")
      .filter((b) => {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        return /Nowy szablon|Eksport|Użyj|Szczegóły|Edytuj|Lista|Karty/.test(t);
      })
      .slice(0, 14)
      .map((b) => ({
        text: (b.textContent || "").replace(/\s+/g, " ").trim(),
        ...rect(b),
      }));

    const listRows = qa("div")
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 500 &&
          r.height >= 56 &&
          r.height <= 140 &&
          cs.display.includes("flex") &&
          cs.boxShadow !== "none" &&
          (cs.borderRadius === "16px" || parseFloat(cs.borderRadius) >= 12)
        );
      })
      .slice(0, 5)
      .map((el) => rect(el));

    const moduleH1 = h1s.find((h) => /Szablony (etykiet|wydruków)/.test(h.text));
    const toolbarH1 = h1s.find((h) => h.fontSize === "20px" || (h !== moduleH1 && h.text && h.top > (moduleH1?.bottom || 0)));
    const moduleTabs = tablists[0] || null;

    return {
      label,
      url: location.href,
      h1s,
      tablists,
      asides,
      searches,
      articles,
      articleCount: qa("article").length,
      buttons,
      listRows,
      rhythm: {
        moduleTitle: moduleH1 || null,
        toolbarTitle: toolbarH1 || null,
        moduleTabs,
        asideWidth: asides[0]?.width ?? null,
        asideLeft: asides[0]?.left ?? null,
        headerToTabs: moduleH1 && moduleTabs ? moduleTabs.top - moduleH1.bottom : null,
        tabsToToolbar: moduleTabs && toolbarH1 ? toolbarH1.top - moduleTabs.bottom : null,
        tabsToSearch: moduleTabs && searches[0] ? searches[0].top - moduleTabs.bottom : null,
        searchHeight: searches[0]?.height ?? null,
        firstRowHeight: listRows[0]?.height ?? null,
        firstCardHeight: articles[0]?.card?.height ?? null,
        firstCardBandHeight: articles[0]?.band?.height ?? null,
      },
      sample: (document.body?.innerText || "").slice(0, 500),
    };
  }, pageLabel);
}

const tokens = await apiLogin();
const browser = await chromium.launch({
  headless: true,
  args: ["--ignore-certificate-errors"],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1100 },
});

await context.addInitScript(
  ({ access, refresh }) => {
    localStorage.setItem("sasist_remember_me", "1");
    localStorage.setItem("wms_access_token", access);
    localStorage.setItem("wms_refresh_token", refresh);
  },
  { access: tokens.access_token, refresh: tokens.refresh_token },
);

const page = await context.newPage();
const results = {};
for (const [key, url] of [
  ["labels", `${BASE}/templates/labels`],
  ["print", `${BASE}/templates/print`],
  ["labelsReady", `${BASE}/templates/labels/ready`],
  ["printReady", `${BASE}/templates/print/starters`],
]) {
  console.log("GOTO", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  // if redirected to login, fail early
  if (page.url().includes("/login")) {
    results[key] = { error: "still on login", url: page.url() };
    await page.screenshot({ path: path.join(OUT, `${key}-login.png`) });
    continue;
  }
  await page.screenshot({ path: path.join(OUT, `${key}.png`), fullPage: false });
  results[key] = await measure(page, key);
  results[key].screenshot = `${key}.png`;
  console.log(
    key,
    results[key].url,
    "h1",
    results[key].h1s?.map((h) => `${h.text}@${h.fontSize}`),
    "aside",
    results[key].asides?.[0]?.width,
    "articles",
    results[key].articleCount,
    "rows",
    results[key].listRows?.length,
  );
}

fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
console.log("---DONE---");
await browser.close();
