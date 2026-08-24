import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_Z } from "./execution/wmsLayoutTokens";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAV = readFileSync(path.join(HERE, "WmsTopBarModuleNav.tsx"), "utf8");
const TOPBAR = readFileSync(path.join(HERE, "../../layout/WmsTopBar.tsx"), "utf8");

describe("WmsTopBar More menu stacking", () => {
  it("portals overflow menu to document.body (escapes nav overflow-x-auto)", () => {
    expect(TOPBAR).toContain("overflow-x-auto");
    expect(NAV).toContain("createPortal");
    expect(NAV).toContain("document.body");
    expect(NAV).toContain("position: \"fixed\"");
    expect(NAV).not.toMatch(/absolute right-0 top-full/);
    // Declaration and JSX must use the same identifier (regression: moreMenuPanel vs moreMenuPortal).
    expect(NAV).toMatch(/const moreMenuPortal\s*=/);
    expect(NAV).toContain("{moreMenuPortal}");
    expect(NAV).not.toMatch(/\bmoreMenuPanel\b/);
  });

  it("uses WMS_Z.dropdown SSOT (above topNav, below modal)", () => {
    expect(WMS_Z.dropdown).toBe(500);
    expect(WMS_Z.dropdown).toBeGreaterThan(WMS_Z.topNav);
    expect(WMS_Z.dropdown).toBeLessThan(WMS_Z.modal);
    expect(NAV).toContain("WMS_Z.dropdown");
  });

  it("closes on outside click and Escape", () => {
    expect(NAV).toContain('e.key === "Escape"');
    expect(NAV).toContain('addEventListener("mousedown"');
    expect(NAV).toContain("moreMenuRef.current?.contains");
  });

  it("keeps More label and visual menu chrome", () => {
    expect(NAV).toContain("Więcej");
    expect(NAV).toContain("min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg");
    expect(NAV).toContain('data-testid="wms-topbar-more-menu"');
  });

  it("topbar uses WMS_Z.topNav instead of local z-40", () => {
    expect(TOPBAR).toContain("WMS_Z.topNav");
    expect(TOPBAR).not.toMatch(/\bz-40\b/);
  });
});
