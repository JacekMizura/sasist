import { describe, expect, it } from "vitest";

import type { ShippingMethodDto } from "../api/shippingMethodsApi";
import {
  mergeShippingMethodsRows,
  shippingMethodLogoMountKey,
  shippingMethodsLogoMountStable,
  shippingMethodsShouldUnmountList,
} from "./shippingMethodsListLifecycle";
import {
  pickShippingMethodLogoSrc,
  resolveShippingMethodLogoUrl,
  shippingMethodLogoForDisplay,
} from "./shippingMethodLogoUrl";

function row(partial: Partial<ShippingMethodDto> & Pick<ShippingMethodDto, "id" | "name">): ShippingMethodDto {
  return {
    tenant_id: 1,
    warehouse_id: 1,
    code: partial.code ?? "INPOST",
    aliases: partial.aliases ?? [],
    logo_url: partial.logo_url ?? null,
    is_active: partial.is_active ?? true,
    ...partial,
  };
}

describe("shipping method logo URL", () => {
  const customPath = "/uploads/e300d686885740df8bdb9b5861fe0e2a.webp";

  it("keeps /uploads src relative on same-origin (stable across rerenders)", () => {
    const a = resolveShippingMethodLogoUrl(customPath);
    const b = resolveShippingMethodLogoUrl(customPath);
    expect(a).toBe(customPath);
    expect(b).toBe(customPath);
    expect(a).toBe(b);
  });

  it("uses custom logo when present and not failed", () => {
    const pick = pickShippingMethodLogoSrc(customPath, "TEMU");
    expect(pick.source).toBe("custom");
    expect(pick.src).toBe(customPath);
  });

  it("falls back once locally and never flips back to custom", () => {
    const sequence: string[] = [];
    let customFailed = false;
    let heuristicFailed = false;

    for (let i = 0; i < 8; i++) {
      const pick = pickShippingMethodLogoSrc(customPath, "TEMU", {
        customFailed,
        heuristicFailed,
      });
      sequence.push(`${pick.source}:${pick.src ?? "-"}`);
      if (pick.source === "custom") {
        customFailed = true;
      } else if (pick.source === "heuristic") {
        heuristicFailed = true;
      }
    }

    expect(sequence).toEqual([
      `custom:${customPath}`,
      "heuristic:/assets/carriers/temu.svg",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
    ]);
  });

  it("does not remember failure across fresh pick calls (no module cache)", () => {
    // Simulate remount: previous instance failed; new instance must retry custom src.
    const remount = pickShippingMethodLogoSrc(customPath, "TEMU");
    expect(remount).toEqual({ src: customPath, source: "custom" });
  });

  it("uses heuristic when no custom logo_url", () => {
    expect(pickShippingMethodLogoSrc(null, "InPost")).toEqual({
      src: "/assets/carriers/inpost.svg",
      source: "heuristic",
    });
  });

  it("shippingMethodLogoForDisplay returns stable string for same inputs", () => {
    expect(shippingMethodLogoForDisplay(customPath, "DPD")).toBe(customPath);
    expect(shippingMethodLogoForDisplay(customPath, "DPD")).toBe(
      shippingMethodLogoForDisplay(customPath, "DPD"),
    );
  });
});

describe("shipping methods list lifecycle (remount regression)", () => {
  it("does not unmount list when soft-refreshing with existing rows", () => {
    expect(shippingMethodsShouldUnmountList(true, 0)).toBe(true);
    expect(shippingMethodsShouldUnmountList(true, 7)).toBe(false);
    expect(shippingMethodsShouldUnmountList(false, 7)).toBe(false);
  });

  it("keeps the same array reference when API returns equivalent logo mount keys", () => {
    const prev = [
      row({ id: "a", name: "InPost", logo_url: "/uploads/1.png", aliases: ["inpost"], updated_at: "t1" }),
      row({ id: "b", name: "DPD", logo_url: "/uploads/2.png", code: "DPD", aliases: ["dpd"] }),
    ];
    const next = [
      row({
        id: "a",
        name: "InPost",
        logo_url: "/uploads/1.png",
        aliases: ["inpost", "kurier inpost"],
        updated_at: "t2",
      }),
      row({ id: "b", name: "DPD", logo_url: "/uploads/2.png", code: "DPD", aliases: ["dpd", "kurier dpd"] }),
    ];

    expect(shippingMethodsLogoMountStable(prev, next)).toBe(true);
    expect(shippingMethodLogoMountKey(prev[0]!)).toBe(shippingMethodLogoMountKey(next[0]!));

    const merged = mergeShippingMethodsRows(prev, next);
    // Must not replace with a brand-new API payload identity when only aliases changed —
    // keep id/logo_url/name so memoized <ShippingMethodLogo> props stay referentially stable strings.
    expect(merged[0]!.id).toBe(prev[0]!.id);
    expect(merged[0]!.logo_url).toBe(prev[0]!.logo_url);
    expect(merged[0]!.name).toBe(prev[0]!.name);
    expect(merged[0]!.aliases).toEqual(["inpost", "kurier inpost"]);
    expect(merged).not.toBe(next);
  });

  it("returns previous array ref when nothing changed (React setState bail-out)", () => {
    const prev = [row({ id: "a", name: "InPost", logo_url: "/uploads/1.png", aliases: ["inpost"] })];
    const next = [row({ id: "a", name: "InPost", logo_url: "/uploads/1.png", aliases: ["inpost"] })];
    expect(mergeShippingMethodsRows(prev, next)).toBe(prev);
  });

  it("replaces rows when logo_url changes (intentional remount of that logo only)", () => {
    const prev = [row({ id: "a", name: "InPost", logo_url: "/uploads/1.png" })];
    const next = [row({ id: "a", name: "InPost", logo_url: "/uploads/2.png" })];
    const merged = mergeShippingMethodsRows(prev, next);
    expect(merged).toBe(next);
    expect(merged[0]!.logo_url).toBe("/uploads/2.png");
  });
});
