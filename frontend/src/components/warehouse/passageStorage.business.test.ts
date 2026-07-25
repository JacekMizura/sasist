import { describe, expect, it } from "vitest";
import {
  buildRemovalImpact,
  countPassageVoidLevels,
  getPassageVoidHeightCm,
  getStructuralPassage,
  hasMultipleEnabledPassages,
  planBinRebuild,
  rackBinPositionsDiffer,
  storageLevelConfigAfterVoid,
} from "./passageStorage";
import { activeBinsForRack, createBinsForRack, isBinActive } from "./warehouseUtils";
import type { BinState } from "../../types/warehouse";

/** Business scenarios: structural levels × clearance → storage locations. */
describe("passage storage — business scenarios", () => {
  const H = 200;
  const L = 5;
  const W = 100;
  const D = 80;

  function gen(clearanceCm: number | null) {
    return createBinsForRack(
      "A",
      1,
      L,
      1,
      100,
      "M1",
      undefined,
      W,
      D,
      H,
      undefined,
      "{Row}{Section}-{Bin}-{Level}",
      "A1",
      1,
      "alpha",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      clearanceCm == null
        ? undefined
        : [{ enabled: true, clearance_height_cm: clearanceCm }]
    );
  }

  it("5 poziomów → 5 lokalizacji (bez przejazdu)", () => {
    const bins = gen(null);
    expect(bins).toHaveLength(5);
    expect(bins.map((b) => b.level_index)).toEqual([0, 1, 2, 3, 4]);
    expect(bins.every((b) => b.label.endsWith("-1") || b.label.match(/-[1-5]$/))).toBe(true);
    // numeracja od 1
    expect(bins.map((b) => b.label.replace(/^.*-/, ""))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("5 poziomów + 80 cm → 3 lokalizacje, numeracja konstrukcyjna 3..5", () => {
    // równy podział 40 cm; void 80 → 2 poziomy void
    expect(countPassageVoidLevels(H, L, 80)).toBe(2);
    const bins = gen(80);
    expect(bins).toHaveLength(3);
    expect(bins.map((b) => b.label.replace(/^.*-/, ""))).toEqual(["3", "4", "5"]);
    // construction level_index (void = 2 → first storage at 2)
    expect(bins.map((b) => b.level_index)).toEqual([2, 3, 4]);
    expect(bins[0]!.level_index).toBe(2);
  });

  it("5 poziomów + 120 cm → 2 lokalizacje, numeracja konstrukcyjna 4..5", () => {
    expect(countPassageVoidLevels(H, L, 120)).toBe(3);
    const bins = gen(120);
    expect(bins).toHaveLength(2);
    expect(bins.map((b) => b.label.replace(/^.*-/, ""))).toEqual(["4", "5"]);
    expect(bins.map((b) => b.level_index)).toEqual([3, 4]);
  });

  it("pojemność zgodna z liczbą lokalizacji (nie z void)", () => {
    const full = gen(null);
    const withVoid = gen(80);
    const cap = (bins: BinState[]) => bins.reduce((s, b) => s + Number(b.volume_dm3 || 0), 0);
    expect(withVoid).toHaveLength(3);
    expect(full).toHaveLength(5);
    // każda lokalizacja ma objętość z wysokości poziomu magazynowego (~40 cm)
    const expectedPer = (W * D * 40) / 1000;
    expect(withVoid.every((b) => Math.abs(Number(b.volume_dm3) - expectedPer) < 0.01)).toBe(true);
    expect(cap(withVoid)).toBeCloseTo(3 * expectedPer, 5);
    expect(cap(withVoid)).toBeLessThan(cap(full));
  });

  it("WMS nie widzi usuniętych lokalizacji (tylko active bins)", () => {
    const structural = gen(null);
    const next = gen(80);
    const plan = planBinRebuild(structural, next, 5, 2);
    const afterSave: BinState[] = [
      ...plan.merged.map((b) => ({ ...b, is_active: true })),
      ...plan.removed.map((b) => ({ ...b, is_active: false })),
    ];
    const visible = activeBinsForRack({ bins: afterSave });
    expect(visible).toHaveLength(3);
    expect(visible.every(isBinActive)).toBe(true);
    expect(visible.map((b) => b.label.replace(/^.*-/, ""))).toEqual(["3", "4", "5"]);
    // usunięte locationUUID nie są w puli aktywnej (etykiety mogą się pokrywać po renumeracji)
    const removedUuids = new Set(plan.removed.map((b) => b.locationUUID).filter(Boolean));
    expect(visible.some((b) => b.locationUUID && removedUuids.has(b.locationUUID))).toBe(false);
    expect(plan.removed).toHaveLength(2);
  });

  it("jeden przejazd strukturalny — odrzuca wiele aktywnych", () => {
    expect(() =>
      getPassageVoidHeightCm([
        { enabled: true, clearance_height_cm: 80 },
        { enabled: true, clearance_height_cm: 160 },
      ])
    ).toThrow("Regał może posiadać tylko jeden przejazd pod regałem.");
    expect(
      getStructuralPassage([
        { enabled: false, clearance_height_cm: 200 },
        { enabled: true, clearance_height_cm: 80 },
      ])?.clearance_height_cm
    ).toBe(80);
    expect(
      hasMultipleEnabledPassages([
        { enabled: true, clearance_height_cm: 80 },
        { enabled: true, clearance_height_cm: 40 },
      ])
    ).toBe(true);
  });

  it("blokada przebudowy przy stocku — impact.hasStock", () => {
    const removed: BinState[] = [
      {
        label: "A11-A-1",
        level_index: 0,
        segment_index: 0,
        volume_dm3: 10,
        locationUUID: "u0",
        current_load_dm3: 5,
      },
    ];
    const impact = buildRemovalImpact("A1", "a1", removed);
    expect(impact.hasStock).toBe(true);
    expect(impact.removed[0]!.hasStock).toBe(true);
  });

  it("storageLevelConfigAfterVoid keeps construction level numbers", () => {
    const structural = Array.from({ length: 5 }, (_, i) => ({ level: i + 1, locations: 1 }));
    expect(storageLevelConfigAfterVoid(structural, 2).map((r) => r.level)).toEqual([3, 4, 5]);
  });

  it("rackBinPositionsDiffer detects void application", () => {
    expect(rackBinPositionsDiffer(gen(null), gen(80))).toBe(true);
    expect(rackBinPositionsDiffer(gen(80), gen(80))).toBe(false);
  });
});
