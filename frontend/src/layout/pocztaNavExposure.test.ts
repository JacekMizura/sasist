import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Poczta application navigation exposure", () => {
  it("includes poczta in sales sidebar sections", () => {
    const nav = read("layout/mainNavConfig.tsx");
    expect(nav).toContain('categoryIds: ["orders", "customers", "assortment", "documents", "poczta"]');
  });

  it("main nav poczta click leads to korespondencja", () => {
    const nav = read("layout/mainNavConfig.tsx");
    expect(nav).toContain('primaryClickPath: "/poczta/korespondencja"');
  });

  it("flyout excludes outbox until Phase 3", () => {
    const nav = read("layout/mainNavConfig.tsx");
    expect(nav).not.toContain("/poczta/nadawcza");
  });

  it("top tabs exclude outbox until Phase 3", () => {
    const tabs = read("modules/poczta/pocztaTabs.ts");
    expect(tabs).not.toContain("/poczta/nadawcza");
    expect(tabs).toContain("Korespondencja");
    expect(tabs).toContain("Konta pocztowe");
    expect(tabs).toContain("Szablony");
  });

  it("App redirects /poczta and legacy nadawcza route", () => {
    const app = read("App.tsx");
    expect(app).toContain('Navigate to="/poczta/korespondencja"');
    expect(app).toContain('path="nadawcza" element={<Navigate to="/poczta/korespondencja"');
  });

  it("templates render embedded inside poczta shell", () => {
    const app = read("App.tsx");
    expect(app).toContain("<MessageTemplatesModule embedded />");
    const mod = read("pages/admin/MessageTemplatesModule.tsx");
    expect(mod).toContain("embedded?: boolean");
  });

  it("nav flyout access helper gates poczta by mail permissions", () => {
    const helper = read("layout/navFlyoutAccess.ts");
    expect(helper).toContain("mail.view");
    expect(helper).toContain("userCanSeePocztaNav");
  });

  it("correspondence page has breadcrumb and empty state CTA", () => {
    const page = read("pages/poczta/MailCorrespondencePage.tsx");
    expect(page).toContain("ModuleListBreadcrumb");
    expect(page).toContain("Nie masz skonfigurowanego konta pocztowego");
    expect(page).toContain("/poczta/konta");
  });

  it("accounts page is routable with add button and empty-state icon", () => {
    const app = read("App.tsx");
    expect(app).toContain('path="konta" element={<MailAccountsPage />}');
    const page = read("pages/poczta/MailAccountsPage.tsx");
    expect(page).toContain("Dodaj konto");
    expect(page).toContain("brandPrimaryButtonClass");
    expect(page).toMatch(/<AppEmptyState[\s\S]*icon=\{/);
  });

  it("conversation detail route registered", () => {
    const app = read("App.tsx");
    expect(app).toContain("korespondencja/:conversationId");
  });
});
