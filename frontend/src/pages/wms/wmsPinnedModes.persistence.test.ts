/**
 * @vitest-environment jsdom
 * WMS topbar pin mutations + shared store persist (real handler → state → save → re-read).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn(async (pins: unknown) => pins);

vi.mock("../../api/authApi", () => ({
  putWmsTopbarPins: (pins: unknown) => putMock(pins),
}));

import {
  applyMovePinned,
  applyTogglePin,
  pinnedKeysInOrder,
} from "./wmsPinnedModesMutations";
import {
  applyWmsPinnedModesUserMutation,
  configureWmsPinnedModesPersist,
  getWmsPinnedModesSnapshot,
  resetWmsPinnedModesStoreForTests,
  setWmsPinnedModesSnapshot,
  subscribeWmsPinnedModes,
} from "./wmsPinnedModesStore";
import {
  defaultWmsPinnedModes,
  normalizeWmsPinnedModes,
  type WmsPinnedMode,
} from "./wmsPinnedModesStorage";
import { WMS_TAB_ITEMS } from "./wmsTabConfig";
import { resolveWmsNavTabs } from "./wmsNavTabs";

const catalog = WMS_TAB_ITEMS.map((t) => t.id);

function modesWithPins(pinnedKeys: string[]): WmsPinnedMode[] {
  return normalizeWmsPinnedModes(
    catalog.map((key) => {
      const idx = pinnedKeys.indexOf(key);
      return { key, pinned: idx >= 0, order: idx >= 0 ? idx : 0 };
    }),
    catalog,
  );
}

describe("wmsPinnedModesMutations", () => {
  it("1. pinned → unpinned", () => {
    const before = modesWithPins(["packing", "picking", "receiving"]);
    const after = applyTogglePin(before, "picking");
    expect(pinnedKeysInOrder(after)).toEqual(["packing", "receiving"]);
    expect(after.find((m) => m.key === "picking")?.pinned).toBe(false);
  });

  it("2. unpinned → pinned (append at end)", () => {
    const before = modesWithPins(["packing", "picking"]);
    const after = applyTogglePin(before, "receiving");
    expect(pinnedKeysInOrder(after)).toEqual(["packing", "picking", "receiving"]);
  });

  it("3. move pinned up", () => {
    const start = modesWithPins(["packing", "picking", "receiving"]);
    const after = applyMovePinned(start, "picking", -1);
    expect(pinnedKeysInOrder(after)).toEqual(["picking", "packing", "receiving"]);
  });

  it("4. move pinned down", () => {
    const start = modesWithPins(["packing", "picking", "receiving"]);
    const after = applyMovePinned(start, "packing", 1);
    expect(pinnedKeysInOrder(after)).toEqual(["picking", "packing", "receiving"]);
  });

  it("5. first cannot move up", () => {
    const start = modesWithPins(["packing", "picking", "receiving"]);
    const after = applyMovePinned(start, "packing", -1);
    expect(after).toBe(start);
    expect(pinnedKeysInOrder(after)).toEqual(["packing", "picking", "receiving"]);
  });

  it("6. last pinned cannot move down", () => {
    const start = modesWithPins(["packing", "picking", "receiving"]);
    const after = applyMovePinned(start, "receiving", 1);
    expect(after).toBe(start);
  });

  it("7. unpinned does not participate in reorder", () => {
    const start = modesWithPins(["packing", "picking"]);
    const after = applyMovePinned(start, "receiving", -1);
    expect(after).toBe(start);
    expect(pinnedKeysInOrder(after)).toEqual(["packing", "picking"]);
  });
});

describe("wmsPinnedModesStore persist + shared subscribers", () => {
  beforeEach(() => {
    resetWmsPinnedModesStoreForTests();
    putMock.mockClear();
    putMock.mockImplementation(async (pins: unknown) => pins);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetWmsPinnedModesStoreForTests();
  });

  it("8. unpin → persist → re-hydrate still unpinned (mutation + save + re-read)", async () => {
    const authPins: { current: WmsPinnedMode[] | null } = { current: null };
    configureWmsPinnedModesPersist({
      patchAuthPins: (pins) => {
        authPins.current = pins as WmsPinnedMode[];
      },
    });

    const initial = modesWithPins(["packing", "picking", "receiving"]);
    setWmsPinnedModesSnapshot(initial, { hydrateKey: "1|init", skipPersist: true });

    applyWmsPinnedModesUserMutation(applyTogglePin(getWmsPinnedModesSnapshot(), "picking"));
    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["packing", "receiving"]);

    await vi.advanceTimersByTimeAsync(400);
    expect(putMock).toHaveBeenCalledTimes(1);
    const payload = putMock.mock.calls[0][0] as WmsPinnedMode[];
    expect(pinnedKeysInOrder(payload)).toEqual(["packing", "receiving"]);
    expect(authPins.current).not.toBeNull();
    expect(pinnedKeysInOrder(authPins.current!)).toEqual(["packing", "receiving"]);

    resetWmsPinnedModesStoreForTests();
    configureWmsPinnedModesPersist({ patchAuthPins: () => undefined });
    setWmsPinnedModesSnapshot(normalizeWmsPinnedModes(authPins.current!, catalog), {
      hydrateKey: "1|reload",
      skipPersist: true,
    });
    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["packing", "receiving"]);
  });

  it("9. reorder → persist → refresh keeps order", async () => {
    const authPins: { current: WmsPinnedMode[] | null } = { current: null };
    configureWmsPinnedModesPersist({
      patchAuthPins: (pins) => {
        authPins.current = pins as WmsPinnedMode[];
      },
    });

    setWmsPinnedModesSnapshot(modesWithPins(["packing", "picking", "receiving"]), {
      hydrateKey: "1|init",
      skipPersist: true,
    });
    applyWmsPinnedModesUserMutation(applyMovePinned(getWmsPinnedModesSnapshot(), "picking", -1));
    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["picking", "packing", "receiving"]);

    await vi.advanceTimersByTimeAsync(400);
    expect(pinnedKeysInOrder(putMock.mock.calls[0][0] as WmsPinnedMode[])).toEqual([
      "picking",
      "packing",
      "receiving",
    ]);

    resetWmsPinnedModesStoreForTests();
    setWmsPinnedModesSnapshot(normalizeWmsPinnedModes(authPins.current!, catalog), {
      hydrateKey: "1|reload",
      skipPersist: true,
    });
    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["picking", "packing", "receiving"]);
  });

  it("10. topbar resolution uses same pinned order; two subscribers stay in sync", () => {
    const unsubA = subscribeWmsPinnedModes(() => undefined);
    const unsubB = subscribeWmsPinnedModes(() => undefined);

    setWmsPinnedModesSnapshot(modesWithPins(["receiving", "putaway", "picking"]), {
      hydrateKey: "1|x",
      skipPersist: true,
    });
    applyWmsPinnedModesUserMutation(applyTogglePin(getWmsPinnedModesSnapshot(), "putaway"));
    applyWmsPinnedModesUserMutation(applyMovePinned(getWmsPinnedModesSnapshot(), "picking", -1));

    const modes = getWmsPinnedModesSnapshot();
    const nav = resolveWmsNavTabs(modes, null);
    expect(nav.pinnedTabs.map((t) => t.id)).toEqual(["picking", "receiving"]);
    expect(pinnedKeysInOrder(modes)).toEqual(["picking", "receiving"]);

    unsubA();
    unsubB();
  });

  it("dual instance race regression: PUT payload is shared snapshot not stale copy", async () => {
    configureWmsPinnedModesPersist({ patchAuthPins: () => undefined });
    setWmsPinnedModesSnapshot(modesWithPins(["packing", "picking"]), {
      hydrateKey: "1|init",
      skipPersist: true,
    });

    applyWmsPinnedModesUserMutation(applyTogglePin(getWmsPinnedModesSnapshot(), "packing"));
    await vi.advanceTimersByTimeAsync(400);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(pinnedKeysInOrder(putMock.mock.calls[0][0] as WmsPinnedMode[])).toEqual(["picking"]);
    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["picking"]);
  });
});

describe("default catalog sanity", () => {
  it("default modes are non-empty pinned subset", () => {
    const d = defaultWmsPinnedModes();
    expect(d.some((m) => m.pinned)).toBe(true);
  });
});
