import { describe, expect, it } from "vitest";

import {
  pickShippingMethodLogoSrc,
  resolveShippingMethodLogoUrl,
} from "./shippingMethodLogoUrl";

describe("pickShippingMethodLogoSrc", () => {
  const customPath = "/uploads/9140a284753f4b788bb773a6b1e357f6.png";

  it("uses custom logo when present and not failed", () => {
    const pick = pickShippingMethodLogoSrc(customPath, "TEMU");
    expect(pick.source).toBe("custom");
    expect(pick.src).toBe(resolveShippingMethodLogoUrl(customPath));
  });

  it("falls back to carrier SVG when custom failed — once, no flip back", () => {
    const afterCustomFail = pickShippingMethodLogoSrc(customPath, "TEMU", {
      customFailed: true,
    });
    expect(afterCustomFail).toEqual({
      src: "/assets/carriers/temu.svg",
      source: "heuristic",
    });

    // Simulating heuristic onError must NOT revive custom /uploads (old loop).
    const afterHeuristicFail = pickShippingMethodLogoSrc(customPath, "TEMU", {
      customFailed: true,
      heuristicFailed: true,
    });
    expect(afterHeuristicFail).toEqual({ src: null, source: "none" });

    // Still failed custom → still heuristic, never custom again
    const stillFailed = pickShippingMethodLogoSrc(customPath, "TEMU", {
      customFailed: true,
      heuristicFailed: false,
    });
    expect(stillFailed.source).toBe("heuristic");
    expect(stillFailed.src).toBe("/assets/carriers/temu.svg");
  });

  it("does not change src across identical picks (stable for parent rerenders)", () => {
    const a = pickShippingMethodLogoSrc(customPath, "DPD");
    const b = pickShippingMethodLogoSrc(customPath, "DPD");
    expect(a).toEqual(b);
    expect(a.src).toBe(b.src);
  });

  it("uses heuristic only when no custom logo_url", () => {
    expect(pickShippingMethodLogoSrc(null, "InPost")).toEqual({
      src: "/assets/carriers/inpost.svg",
      source: "heuristic",
    });
  });

  it("never oscillates custom ↔ heuristic across repeated failure flags", () => {
    const sequence: string[] = [];
    let customFailed = false;
    let heuristicFailed = false;

    for (let i = 0; i < 10; i++) {
      const pick = pickShippingMethodLogoSrc(customPath, "TEMU", {
        customFailed,
        heuristicFailed,
      });
      sequence.push(`${pick.source}:${pick.src ?? "-"}`);
      if (pick.source === "custom") customFailed = true;
      else if (pick.source === "heuristic") heuristicFailed = true;
    }

    expect(sequence).toEqual([
      `custom:${resolveShippingMethodLogoUrl(customPath)}`,
      "heuristic:/assets/carriers/temu.svg",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
      "none:-",
    ]);
  });
});
