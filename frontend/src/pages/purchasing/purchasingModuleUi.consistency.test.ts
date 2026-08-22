import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Purchasing module UI consistency", () => {
  it("A. top nav uses Zamówienia do dostawców", () => {
    const tabs = read("modules/purchasing/purchasingTabs.ts");
    expect(tabs).toContain("Zamówienia do dostawców");
    expect(tabs).not.toContain("Zamówienia zakupowe");
  });

  it("B. active PO page has no old title", () => {
    const po = read("pages/purchasing/PurchasingPoPage.tsx");
    expect(po).not.toContain("Zamówienia zakupowe");
    expect(po).not.toContain("Szkice i zamówienia");
  });

  it("C. dashboard has no page title/subtitle", () => {
    const dash = read("modules/purchasing/views/PlanningDashboard.tsx");
    expect(dash).not.toContain("Pulpit zakupów");
    expect(dash).not.toContain("Decyzje zakupowe");
    expect(dash).not.toContain("PurchasingPageHeader");
  });

  it("D. PO page has no PurchasingPageHeader", () => {
    const po = read("pages/purchasing/PurchasingPoPage.tsx");
    expect(po).not.toContain("PurchasingPageHeader");
  });

  it("K. thumbnail box without frame border class", () => {
    const tokens = read("modules/purchasing/ui/purchasingProductThumbnailTokens.ts");
    expect(tokens).toContain("overflow-hidden bg-transparent");
    expect(tokens).not.toMatch(/purchasingThumbBoxClass[\s\S]{0,120}border/);
  });

  it("L. plan product panel uses ExternalLink pattern", () => {
    const panel = read("pages/purchasing/plan/PlanProductDetailPanel.tsx");
    expect(panel).toContain("ExternalLink");
    expect(panel).toContain('title="Otwórz kartę produktu"');
    expect(panel).not.toContain("Karta produktu");
  });

  it("M. dashboard section CTAs use purchasingSectionLinkBtnClass", () => {
    const dash = read("modules/purchasing/views/PlanningDashboard.tsx");
    expect(dash).toContain("purchasingSectionLinkBtnClass");
    expect(dash).not.toContain("purchasingLinkSectionClass");
  });

  it("N. plan table uses moduleList table tokens", () => {
    const plan = read("pages/purchasing/PurchasingReplenishmentPage.tsx");
    expect(plan).toContain("moduleListThClass");
    expect(plan).toContain("moduleListTdClass");
  });

  it("O. signal column renamed to Ocena sugestii", () => {
    const plan = read("pages/purchasing/PurchasingReplenishmentPage.tsx");
    expect(plan).toContain("Ocena sugestii");
    expect(plan).not.toMatch(/>\s*Sygnał\s*</);
  });

  it("PurchasingProductCell uses formatProductEanSkuMeta", () => {
    const cell = read("modules/purchasing/ui/PurchasingProductThumbnail.tsx");
    expect(cell).toContain("formatProductEanSkuMeta");
    expect(cell).toContain("text-sm font-medium text-slate-900");
  });
});
