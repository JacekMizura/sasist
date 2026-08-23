/**
 * Settings UI handlers must mutate shared pin state (not badge-only).
 */
import { useReducer, useEffect } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/authApi", () => ({
  putWmsTopbarPins: vi.fn(async (pins: unknown) => pins),
}));

import { WmsTopbarPinSettings } from "./launcher/WmsTopbarPinSettings";
import { getWmsModule } from "./wmsTabConfig";
import {
  applyMovePinned,
  applyTogglePin,
  pinnedKeysInOrder,
} from "./wmsPinnedModesMutations";
import {
  applyWmsPinnedModesUserMutation,
  getWmsPinnedModesSnapshot,
  resetWmsPinnedModesStoreForTests,
  setWmsPinnedModesSnapshot,
  subscribeWmsPinnedModes,
} from "./wmsPinnedModesStore";
import { normalizeWmsPinnedModes, type WmsPinnedMode } from "./wmsPinnedModesStorage";
import { WMS_TAB_ITEMS } from "./wmsTabConfig";

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

function SettingsHost({ moduleIds }: { moduleIds: string[] }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeWmsPinnedModes(() => force()), []);

  const modules = moduleIds
    .map((id) => getWmsModule(id as "packing"))
    .filter(Boolean) as NonNullable<ReturnType<typeof getWmsModule>>[];
  const modes = getWmsPinnedModesSnapshot();

  return (
    <WmsTopbarPinSettings
      modules={modules}
      isPinned={(id) => modes.some((m) => m.key === id && m.pinned)}
      pinOrder={(id) => modes.find((m) => m.key === id)?.order ?? 0}
      pinnedCount={pinnedKeysInOrder(modes).length}
      onTogglePin={(id) =>
        applyWmsPinnedModesUserMutation(applyTogglePin(getWmsPinnedModesSnapshot(), id))
      }
      onMoveUp={(id) =>
        applyWmsPinnedModesUserMutation(applyMovePinned(getWmsPinnedModesSnapshot(), id, -1))
      }
      onMoveDown={(id) =>
        applyWmsPinnedModesUserMutation(applyMovePinned(getWmsPinnedModesSnapshot(), id, 1))
      }
    />
  );
}

describe("WmsTopbarPinSettings handlers", () => {
  beforeEach(() => {
    resetWmsPinnedModesStoreForTests();
    setWmsPinnedModesSnapshot(modesWithPins(["packing", "picking", "receiving"]), {
      hydrateKey: "1|t",
      skipPersist: true,
    });
  });

  afterEach(() => {
    cleanup();
    resetWmsPinnedModesStoreForTests();
  });

  it("click W pasku unpins via real toggle handler + shared snapshot", () => {
    render(<SettingsHost moduleIds={["packing", "picking", "receiving"]} />);
    fireEvent.click(screen.getByText(/Konfiguracja górnego paska/));

    fireEvent.click(screen.getByRole("switch", { name: /Odepnij Pakowanie/i }));

    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual(["picking", "receiving"]);
    expect(screen.getByRole("switch", { name: /Przypnij Pakowanie/i })).toBeTruthy();
    expect(screen.getByText(/\(2 przypiętych\)/)).toBeTruthy();
  });

  it("click move up reorders pinned rows in settings list", () => {
    render(<SettingsHost moduleIds={["packing", "picking", "receiving"]} />);
    fireEvent.click(screen.getByText(/Konfiguracja górnego paska/));

    fireEvent.click(screen.getByRole("button", { name: /Przenieś w górę: Zbieranie/i }));

    expect(pinnedKeysInOrder(getWmsPinnedModesSnapshot())).toEqual([
      "picking",
      "packing",
      "receiving",
    ]);

    const list = screen.getByRole("list");
    const labels = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    const pickingIdx = labels.findIndex((t) => t.includes("Zbieranie"));
    const packingIdx = labels.findIndex((t) => t.includes("Pakowanie"));
    expect(pickingIdx).toBeGreaterThanOrEqual(0);
    expect(packingIdx).toBeGreaterThan(pickingIdx);
  });
});
