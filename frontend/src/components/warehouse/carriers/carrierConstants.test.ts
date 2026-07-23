import { describe, expect, it } from "vitest";

import {
  CARRIER_PREFIXES,
  CARRIER_PREFIX_META,
  CARRIER_VISUAL,
  carrierPrefixMeta,
  carrierVisualStyle,
} from "./carrierConstants";

describe("CARRIER_VISUAL — global purple carrier token", () => {
  it("exposes a single purple palette", () => {
    expect(CARRIER_VISUAL.bg).toBe("#f5f3ff");
    expect(CARRIER_VISUAL.border).toBe("#c4b5fd");
    expect(CARRIER_VISUAL.fg).toBe("#6d28d9");
  });

  it("applies the same colors to every carrier prefix", () => {
    for (const prefix of CARRIER_PREFIXES) {
      const meta = CARRIER_PREFIX_META[prefix];
      expect(meta.bg).toBe(CARRIER_VISUAL.bg);
      expect(meta.border).toBe(CARRIER_VISUAL.border);
      expect(meta.fg).toBe(CARRIER_VISUAL.fg);
    }
  });

  it("carrierVisualStyle ignores unknown prefixes (still purple)", () => {
    expect(carrierVisualStyle()).toEqual({
      bg: CARRIER_VISUAL.bg,
      border: CARRIER_VISUAL.border,
      fg: CARRIER_VISUAL.fg,
    });
    expect(carrierPrefixMeta("PAL")?.icon).toBe("PL");
    expect(carrierPrefixMeta("UNKNOWN")).toBeNull();
  });

  it("does not use legacy blue/amber/green carrier colors", () => {
    const banned = ["#eff6ff", "#bfdbfe", "#1d4ed8", "#fef3c7", "#fcd34d", "#b45309", "#ecfdf5", "#6ee7b7", "#047857"];
    for (const prefix of CARRIER_PREFIXES) {
      const meta = CARRIER_PREFIX_META[prefix];
      for (const hex of banned) {
        expect(meta.bg).not.toBe(hex);
        expect(meta.border).not.toBe(hex);
        expect(meta.fg).not.toBe(hex);
      }
    }
  });
});
