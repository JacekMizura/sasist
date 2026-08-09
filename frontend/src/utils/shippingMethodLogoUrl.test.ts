import { afterEach, describe, expect, it } from "vitest";

import {
  clearShippingMethodCustomLogoFailuresForTests,
  isShippingMethodCustomLogoFailed,
  markShippingMethodCustomLogoFailed,
  pickShippingMethodLogoSrc,
  resolveShippingMethodLogoUrl,
  shippingMethodCustomLogoKey,
  shippingMethodsShouldUnmountList,
} from "./shippingMethodLogoUrl";

describe("shipping method logo lifecycle", () => {
  const customPath = "/uploads/e300d686885740df8bdb9b5861fe0e2a.webp";

  afterEach(() => {
    clearShippingMethodCustomLogoFailuresForTests();
  });

  it("keeps /uploads src relative on same-origin (stable across rerenders)", () => {
    const a = resolveShippingMethodLogoUrl(customPath);
    const b = resolveShippingMethodLogoUrl(customPath);
    expect(a).toBe(customPath);
    expect(b).toBe(customPath);
    expect(a).toBe(b);
  });

  it("normalizes absolute upload URLs to the same failure key as relative", () => {
    expect(shippingMethodCustomLogoKey(`https://api.example.com${customPath}`)).toBe(customPath);
    expect(shippingMethodCustomLogoKey(customPath)).toBe(customPath);
  });

  it("does not unmount list when soft-refreshing with existing rows", () => {
    expect(shippingMethodsShouldUnmountList(true, 0)).toBe(true);
    expect(shippingMethodsShouldUnmountList(true, 7)).toBe(false);
    expect(shippingMethodsShouldUnmountList(false, 7)).toBe(false);
  });

  it("uses custom logo when present and not failed", () => {
    const pick = pickShippingMethodLogoSrc(customPath, "TEMU");
    expect(pick.source).toBe("custom");
    expect(pick.src).toBe(customPath);
  });

  it("remembers failed custom logo across remounts (no re-GET of dead /uploads)", () => {
    markShippingMethodCustomLogoFailed(customPath);
    expect(isShippingMethodCustomLogoFailed(customPath)).toBe(true);

    const afterRemount = pickShippingMethodLogoSrc(customPath, "TEMU");
    expect(afterRemount).toEqual({
      src: "/assets/carriers/temu.svg",
      source: "heuristic",
    });

    // Absolute form of same file must also stay failed
    const abs = `https://cdn.example${customPath}`;
    expect(pickShippingMethodLogoSrc(abs, "TEMU").source).toBe("heuristic");
  });

  it("falls back once and never flips back to custom", () => {
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
        markShippingMethodCustomLogoFailed(customPath);
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

  it("uses heuristic when no custom logo_url", () => {
    expect(pickShippingMethodLogoSrc(null, "InPost")).toEqual({
      src: "/assets/carriers/inpost.svg",
      source: "heuristic",
    });
  });
});
