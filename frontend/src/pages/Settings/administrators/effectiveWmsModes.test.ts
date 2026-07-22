import { describe, expect, it } from "vitest";

import { effectiveWmsModeKeys } from "./effectiveWmsModes";
import { WMS_OPERATIONAL_MODE_KEYS } from "../../../constants/wmsOperationalModes";

describe("effective WMS mode badges", () => {
  it("empty modes means all launcher modes (same as WmsOperationalModeGate)", () => {
    expect(effectiveWmsModeKeys([])).toEqual([...WMS_OPERATIONAL_MODE_KEYS]);
    expect(effectiveWmsModeKeys(null)).toEqual([...WMS_OPERATIONAL_MODE_KEYS]);
  });

  it("filters to stored modes only and preserves catalog order", () => {
    expect(effectiveWmsModeKeys(["packing", "picking", "unknown_mode"])).toEqual([
      "picking",
      "packing",
    ]);
  });

  it("overflow count excludes visible chips", () => {
    const keys = effectiveWmsModeKeys([
      "receiving",
      "putaway",
      "picking",
      "packing",
      "issues",
      "inventory",
    ]);
    const visible = keys.slice(0, 4);
    const hidden = keys.slice(4);
    expect(visible).toHaveLength(4);
    expect(hidden).toEqual(["issues", "inventory"]);
    expect(hidden.every((k) => !visible.includes(k))).toBe(true);
  });
});
