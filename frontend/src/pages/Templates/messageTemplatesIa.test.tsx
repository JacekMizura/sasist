/**
 * Regression: message templates API paths + Templates module IA (not Poczta).
 */
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNavFlyoutCategories } from "../../layout/mainNavConfig";
import MessageTemplatesModule from "../admin/MessageTemplatesModule";
import { TEMPLATES_MESSAGES_BASE } from "./templatesPaths";
import { POCZTA_TABS } from "../../modules/poczta/pocztaTabs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "admin", id: 1 },
    hasPermission: () => true,
  }),
}));

vi.mock("../../api/messageTemplatesApi", () => ({
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

afterEach(() => {
  cleanup();
});

describe("messageTemplatesApi paths (no double /api)", () => {
  it("uses paths relative to axios baseURL", () => {
    const api = read("api/messageTemplatesApi.ts");
    expect(api).not.toContain('"/api/message-templates');
    expect(api).not.toContain("'/api/message-templates");
    expect(api).not.toContain("`/api/message-templates");
    expect(api).toContain('const BASE = "/message-templates"');
    expect(api).toContain("api.get");
    expect(api).toContain("api.post");
    expect(api).toContain("api.patch");
  });

  it("source file never builds /api/api/message-templates", () => {
    const api = read("api/messageTemplatesApi.ts");
    expect(api).not.toMatch(/\/api\/api\/message-templates/);
  });
});

describe("Poczta does not own message templates", () => {
  it("top tabs exclude Szablony", () => {
    expect(POCZTA_TABS.map((t) => t.label)).toEqual(["Korespondencja", "Konta pocztowe"]);
    expect(POCZTA_TABS.some((t) => t.path.includes("szablony"))).toBe(false);
  });

  it("poczta flyout excludes Szablony", () => {
    const poczta = buildNavFlyoutCategories().find((c) => c.id === "poczta")!;
    const labels = poczta.flyoutSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(["Korespondencja", "Konta pocztowe"]);
    expect(labels).not.toContain("Szablony");
  });
});

describe("Templates module owns Szablony wiadomości", () => {
  it("flyout includes Szablony wiadomości at canonical path", () => {
    const templates = buildNavFlyoutCategories().find((c) => c.id === "templates")!;
    const entries = templates.flyoutSections.flatMap((s) =>
      s.items.map((i) => ({ path: i.path, label: i.label })),
    );
    expect(entries).toContainEqual({
      path: "/templates/messages",
      label: "Szablony wiadomości",
    });
    expect(TEMPLATES_MESSAGES_BASE).toBe("/templates/messages");
  });

  it("renders MessageTemplatesModule without Poczta layout chrome", async () => {
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
    expect(screen.getByRole("button", { name: "+ Dodaj szablon" })).toBeTruthy();
    expect(screen.getByText("Nazwa")).toBeTruthy();
    expect(screen.getByText("Temat")).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Poczta" })).toBeNull();
    expect(screen.queryByText("Konta pocztowe")).toBeNull();
  });

  it("legacy /poczta/szablony redirects to /templates/messages", async () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/poczta/szablony"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/poczta/szablony/*",
            element: createElement(Navigate, { to: "/templates/messages", replace: true }),
          }),
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
  });
});

describe("App route wiring", () => {
  it("mounts module at templates/messages and redirects poczta/szablony", () => {
    const app = read("App.tsx");
    expect(app).toContain('path="templates/messages/*" element={<MessageTemplatesModule />}');
    expect(app).toContain("RedirectPocztaSzablonyToMessages");
    expect(app).toMatch(/RedirectPocztaSzablonyToMessages[\s\S]*?\/templates\/messages/);
    expect(app).not.toContain("<MessageTemplatesModule embedded");
  });
});
