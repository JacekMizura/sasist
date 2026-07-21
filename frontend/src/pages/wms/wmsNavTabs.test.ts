/**
 * WMS launcher / topbar resolution — permissions ∩ pinning ∩ order.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_WMS_TOPBAR_PIN_IDS, resolveWmsModuleAccent, WMS_MODULES } from "./wmsTabConfig";
import { resolveWmsNavTabs } from "./wmsNavTabs";
import { defaultWmsPinnedModes, normalizeWmsPinnedModes } from "./wmsPinnedModesStorage";

describe("resolveWmsNavTabs", () => {
  it("A: empty modes → all dashboard modules", () => {
    const modes = defaultWmsPinnedModes();
    const r = resolveWmsNavTabs(modes, []);
    expect(r.dashboardTiles.length).toBe(WMS_MODULES.filter((m) => m.dashboard).length);
  });

  it("B: without production → no production on dashboard/topbar/config", () => {
    const modes = defaultWmsPinnedModes().map((m) =>
      m.key === "production" ? { ...m, pinned: true, order: 0 } : m,
    );
    const r = resolveWmsNavTabs(modes, ["receiving", "putaway", "product_preview"]);
    expect(r.dashboardTiles.some((t) => t.id === "production")).toBe(false);
    expect(r.pinnedTabs.some((t) => t.id === "production")).toBe(false);
    expect(r.pinnableModules.some((m) => m.id === "production")).toBe(false);
    expect(r.dashboardTiles.map((t) => t.id).sort()).toEqual(
      ["receiving", "putaway", "product_preview"].sort(),
    );
  });

  it("C: unpin returns → gone from topbar, still on dashboard", () => {
    const modes = defaultWmsPinnedModes().map((m) =>
      m.key === "returns" ? { ...m, pinned: false, order: 0 } : m,
    );
    const r = resolveWmsNavTabs(modes, null);
    expect(r.dashboardTiles.some((t) => t.id === "returns")).toBe(true);
    expect(r.pinnedTabs.some((t) => t.id === "returns")).toBe(false);
  });

  it("D: pin product_preview → appears in topbar", () => {
    const modes = defaultWmsPinnedModes().map((m) =>
      m.key === "product_preview" ? { ...m, pinned: true, order: 99 } : m,
    );
    const r = resolveWmsNavTabs(modes, null);
    expect(r.pinnedTabs.some((t) => t.id === "product_preview")).toBe(true);
  });

  it("E: order packing → picking → receiving", () => {
    const modes = defaultWmsPinnedModes().map((m) => {
      if (m.key === "packing") return { ...m, pinned: true, order: 0 };
      if (m.key === "picking") return { ...m, pinned: true, order: 1 };
      if (m.key === "receiving") return { ...m, pinned: true, order: 2 };
      return { ...m, pinned: false, order: 0 };
    });
    const r = resolveWmsNavTabs(modes, null);
    expect(r.pinnedTabs.map((t) => t.id)).toEqual(["packing", "picking", "receiving"]);
  });

  it("G: permission revoked for pinned module → not rendered", () => {
    const modes = defaultWmsPinnedModes().map((m) =>
      m.key === "production" ? { ...m, pinned: true, order: 0 } : m,
    );
    const r = resolveWmsNavTabs(modes, ["receiving", "picking"]);
    expect(r.pinnedTabs.some((t) => t.id === "production")).toBe(false);
    expect(r.dashboardTiles.some((t) => t.id === "production")).toBe(false);
  });

  it("I: accents shared SSOT for dashboard ids", () => {
    for (const id of ["receiving", "picking", "putaway", "packing", "issues"] as const) {
      const fromRegistry = WMS_MODULES.find((m) => m.id === id)?.accent;
      expect(resolveWmsModuleAccent(id)).toEqual(fromRegistry);
    }
  });

  it("M: default pins are non-empty subset", () => {
    const modes = defaultWmsPinnedModes();
    const r = resolveWmsNavTabs(modes, null);
    expect(r.pinnedTabs.length).toBeGreaterThan(0);
    expect(r.pinnedTabs.map((t) => t.id)).toEqual(
      [...DEFAULT_WMS_TOPBAR_PIN_IDS].filter((id) => r.permissionFilteredIds.includes(id)),
    );
  });

  it("normalize keeps saved pins", () => {
    const catalog = WMS_MODULES.map((m) => m.id);
    const normalized = normalizeWmsPinnedModes(
      [
        { key: "packing", pinned: true, order: 0 },
        { key: "picking", pinned: true, order: 1 },
        { key: "receiving", pinned: false, order: 0 },
        { key: "putaway", pinned: false, order: 0 },
        { key: "issues", pinned: false, order: 0 },
      ],
      catalog,
    );
    expect(normalized.find((m) => m.key === "packing")?.pinned).toBe(true);
    expect(normalized.find((m) => m.key === "picking")?.pinned).toBe(true);
    expect(normalized.find((m) => m.key === "receiving")?.pinned).toBe(false);
    const pinned = normalized.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
    expect(pinned.map((m) => m.key).slice(0, 2)).toEqual(["packing", "picking"]);
  });
});
