import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Poczta module Phase 1 UI", () => {
  it("defines canonical top tabs", () => {
    const tabs = read("modules/poczta/pocztaTabs.ts");
    expect(tabs).toContain("/poczta/korespondencja");
    expect(tabs).toContain("/poczta/nadawcza");
    expect(tabs).toContain("/poczta/konta");
    expect(tabs).toContain("/poczta/szablony");
  });

  it("main nav includes Poczta category", () => {
    const nav = read("layout/mainNavConfig.tsx");
    expect(nav).toContain('label: "Poczta"');
    expect(nav).toContain('activePathPrefix: "/poczta"');
  });

  it("correspondence empty state mentions no mail account", () => {
    const page = read("pages/poczta/MailCorrespondencePage.tsx");
    expect(page).toContain("Nie masz skonfigurowanego konta pocztowego");
    expect(page).toContain("Brak korespondencji");
  });

  it("accounts page uses OperationalActionButton", () => {
    const page = read("pages/poczta/MailAccountsPage.tsx");
    expect(page).toContain("OperationalActionButton");
    expect(page).toContain("moduleListTableClass");
  });

  it("templates canonical path is /poczta/szablony", () => {
    const paths = read("pages/Templates/templatesPaths.ts");
    expect(paths).toContain('"/poczta/szablony"');
  });
});
