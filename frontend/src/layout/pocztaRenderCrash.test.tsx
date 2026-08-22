/**
 * Regression: React #130 — render undefined component in Poczta nav/routes.
 */
import { createElement, type ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Mail, MessageSquare } from "lucide-react";

import { AppEmptyState } from "../components/app-shell";
import { buildNavFlyoutCategories } from "./mainNavConfig";
import NavFlyoutPanel from "./NavFlyoutPanel";
import ErpSidebar from "./ErpSidebar";
import { ErpSidebarUiProvider } from "./ErpSidebarUiContext";
import MailAccountsPage from "../pages/poczta/MailAccountsPage";
import MailCorrespondencePage from "../pages/poczta/MailCorrespondencePage";
import MessageTemplatesModule from "../pages/admin/MessageTemplatesModule";
import { PocztaModuleProvider } from "../modules/poczta/context/PocztaModuleContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "admin", id: 1 },
    hasPermission: () => true,
  }),
}));

vi.mock("../labels", () => ({
  useLabels: () => undefined,
}));

vi.mock("../labels/labelStore", () => ({
  getLabel: (_key: string, fallback: string) => fallback,
}));

vi.mock("../api/tenantsApi", () => ({
  fetchTenantsList: vi.fn().mockResolvedValue([{ id: 1, name: "Test" }]),
}));

vi.mock("../modules/poczta/services/mailApi", () => ({
  listMailAccounts: vi.fn().mockResolvedValue([]),
  deactivateMailAccount: vi.fn(),
  testMailAccountConnection: vi.fn(),
  fetchMailSetupStatus: vi.fn().mockResolvedValue({ has_accounts: false }),
  fetchMailSidebarCounts: vi.fn().mockResolvedValue({}),
  listMailConversations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

vi.mock("../api/messageTemplatesApi", () => ({
  listMessageTemplates: vi.fn().mockResolvedValue([]),
  archiveMessageTemplate: vi.fn(),
  createMessageTemplate: vi.fn(),
  getMessageTemplate: vi.fn(),
  updateMessageTemplate: vi.fn(),
  listMessageTemplateVariables: vi.fn().mockResolvedValue([]),
  previewMessageTemplate: vi.fn().mockResolvedValue({
    subject: "",
    body_html: "",
    used_live_context: false,
    missing_variables: [],
    unknown_variables: [],
  }),
  supportedContextsFromModules: () => ["ORDER", "RETURN", "COMPLAINT"],
  modulesFromSupportedContexts: () => ({ order: true, returns: true, complaints: true }),
  formatSupportedContextsLabel: () => "Wszystkie moduły",
}));

function isRenderableIcon(Icon: unknown): boolean {
  expect(Icon).toBeTruthy();
  const html = renderToString(createElement(Icon as React.ElementType, { size: 16 }));
  expect(html).toContain("svg");
  return true;
}

function pocztaShell(ui: ReactElement, path = "/poczta/konta") {
  return createElement(
    MemoryRouter,
    { initialEntries: [path] },
    createElement(ErpSidebarUiProvider, null, createElement(PocztaModuleProvider, null, ui)),
  );
}

afterEach(() => {
  cleanup();
});

describe("Poczta runtime render — React #130 regression", () => {
  it("nav poczta category and flyout icons are renderable components", () => {
    const poczta = buildNavFlyoutCategories().find((c) => c.id === "poczta");
    expect(poczta).toBeTruthy();
    isRenderableIcon(poczta!.Icon);

    for (const section of poczta!.flyoutSections) {
      for (const item of section.items) {
        isRenderableIcon(item.Icon);
      }
    }
  });

  it("Mail and MessageSquare lucide exports are truthy", () => {
    expect(Mail).toBeTruthy();
    expect(MessageSquare).toBeTruthy();
    isRenderableIcon(Mail);
  });

  it("A. renders sidebar with Poczta category", () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/dashboard"] },
        createElement(ErpSidebarUiProvider, null, createElement(ErpSidebar)),
      ),
    );
    expect(screen.getByLabelText("Menu główne")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Poczta" })).toBeTruthy();
  });

  it("B. renders Poczta flyout panel without crash", () => {
    const poczta = buildNavFlyoutCategories().find((c) => c.id === "poczta")!;
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/poczta/korespondencja"] },
        createElement(NavFlyoutPanel, {
          category: poczta,
          anchorTop: 80,
          pathname: "/poczta/korespondencja",
          onMouseEnter: () => {},
          onMouseLeave: () => {},
        }),
      ),
    );
    expect(screen.getByText("Korespondencja")).toBeTruthy();
    expect(screen.getByText("Konta pocztowe")).toBeTruthy();
    expect(screen.queryByText("Szablony")).toBeNull();
  });

  it("C. renders /poczta/korespondencja without crash", async () => {
    render(pocztaShell(createElement(MailCorrespondencePage), "/poczta/korespondencja?tenant_id=1"));
    await waitFor(() => {
      expect(screen.getByText("Nie masz skonfigurowanego konta pocztowego.")).toBeTruthy();
    });
  });

  it("D. renders /poczta/konta (empty accounts) without crash after load", async () => {
    render(pocztaShell(createElement(MailAccountsPage), "/poczta/konta?tenant_id=1"));
    await waitFor(() => {
      expect(screen.getByText("Brak kont pocztowych")).toBeTruthy();
    });
  });

  it("E. renders /templates/messages without Poczta chrome", async () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/templates/messages"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/templates/messages/*",
            element: createElement(MessageTemplatesModule),
          }),
        ),
      ),
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Szablony wiadomości" })).toBeTruthy();
    });
    expect(screen.queryByRole("tablist", { name: "Poczta" })).toBeNull();
  });

  it("AppEmptyState without icon throws invalid element type (bug shape)", () => {
    expect(() =>
      renderToString(
        createElement(AppEmptyState, {
          title: "Test",
          description: "Test",
        } as never),
      ),
    ).toThrow(/Element type is invalid|got: undefined/);
  });
});
