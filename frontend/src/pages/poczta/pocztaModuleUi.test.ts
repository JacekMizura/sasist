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
    expect(tabs).not.toContain("/poczta/nadawcza");
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

describe("Poczta module Phase 2 UI", () => {
  it("correspondence list uses sidebar and OperationalActionLink", () => {
    const page = read("pages/poczta/MailCorrespondencePage.tsx");
    expect(page).toContain("MailCorrespondenceSidebar");
    expect(page).toContain("OperationalActionLink");
    expect(page).toContain("listMailConversations");
  });

  it("detail page has reply composer and MessageTemplatePicker", () => {
    const page = read("pages/poczta/MailConversationDetailPage.tsx");
    expect(page).toContain("MessageTemplatePicker");
    expect(page).toContain("replyMailConversation");
    expect(page).toContain("ExternalLink");
  });

  it("detail route registered in App", () => {
    const app = read("App.tsx");
    expect(app).toContain("korespondencja/:conversationId");
    expect(app).toContain("MailConversationDetailPage");
  });

  it("mail API exposes conversation endpoints", () => {
    const api = read("modules/poczta/services/mailApi.ts");
    expect(api).toContain("/mail/conversations");
    expect(api).toContain("sidebar-counts");
    expect(api).toContain("mark-read");
  });
});

describe("Poczta Google OAuth UI", () => {
  it("accounts page exposes connect with Google", () => {
    const page = read("pages/poczta/MailAccountsPage.tsx");
    expect(page).toContain("Połącz z Google");
    expect(page).toContain("startGoogleMailConnect");
    expect(page).toContain('"connected"');
    expect(page).toContain("Konto Google zostało połączone.");
  });

  it("mail API exposes google connect and disconnect", () => {
    const api = read("modules/poczta/services/mailApi.ts");
    expect(api).toContain("/mail/google/connect");
    expect(api).toContain("google/disconnect");
    expect(api).toContain("provider_type");
  });

  it("google account form hides imap smtp fields", () => {
    const modal = read("pages/poczta/MailAccountFormModal.tsx");
    expect(modal).toContain("googleNameOnly");
    expect(modal).toContain("Konto Google:");
  });
});
