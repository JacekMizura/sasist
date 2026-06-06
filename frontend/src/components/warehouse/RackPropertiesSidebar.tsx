import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import type { RackState, LayoutState } from "./warehouseTypes";
import {
  getLevelConfig,
  getTotalLocations,
  getRackDisplayId,
  binsToLevels,
  getDisplayLocationLabel,
  validateRackName,
  effectiveRackDisplayName,
  rackMatchesSlotRackId,
  rackPrimaryId,
} from "./warehouseUtils";
import { UI_STRINGS } from "../../constants/uiStrings";
import { logRackRename } from "./rackRenameLog";

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 480;
const WIDTH_STORAGE_KEY = "wms.rackPropertiesSidebarWidth";

export type RackPropertiesSidebarProps = {
  layout: LayoutState;
  selectedRack: RackState | null;
  selectedRacks: RackState[];
  isMultiSelect: boolean;
  selectedRackIds: Array<number | string>;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setShowElevationForRackId: (id: number | string | null) => void;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  routeRackIds: string[];
  routeRackLabels: string[];
  routeLengthMeters: number;
  routeLegMeters?: number;
  routeStepIndex?: number;
  routeStepCount?: number;
  onRouteStepNext?: () => void;
  isRouteActive: boolean;
  clearRoute: () => void;
  optimizeRoute: () => void;
  finishRoute: () => void;
  onClose: () => void;
  editingRackId?: number | string | null;
  onEditingRackIdChange?: (id: number | string | null) => void;
  onSaveLayout?: () => void;
  saving?: boolean;
  lastSavedAt?: number | null;
  warehouseLabel?: string;
};

function racksMatchIdentity(a: RackState, b: RackState): boolean {
  if (a.uuid != null && b.uuid != null && String(a.uuid) === String(b.uuid)) return true;
  return String(a.id ?? a.rack_index) === String(b.id ?? b.rack_index);
}

function readStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

export function RackPropertiesSidebar({
  layout,
  selectedRack,
  selectedRacks,
  isMultiSelect,
  selectedRackIds,
  setLayout,
  setShowElevationForRackId,
  setInternalLayoutRackId,
  setSelectedRackId,
  setSelectedRackIds,
  routeRackIds,
  routeRackLabels,
  routeLengthMeters,
  routeLegMeters = 0,
  routeStepIndex = 0,
  routeStepCount = 0,
  onRouteStepNext,
  isRouteActive,
  clearRoute,
  optimizeRoute,
  finishRoute,
  onClose,
  editingRackId = null,
  onEditingRackIdChange,
  onSaveLayout,
  saving = false,
  lastSavedAt = null,
  warehouseLabel,
}: RackPropertiesSidebarProps) {
  const asideScrollRef = useRef<HTMLElement>(null);
  const scrollKey = `${selectedRack?.id ?? selectedRack?.rack_index ?? ""}-${routeStepIndex}-${isRouteActive}-${selectedRackIds.join(",")}`;
  useWheelScrollBoundaryContain(asideScrollRef, true, scrollKey);

  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaveHint, setNameSaveHint] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  const [compact, setCompact] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readStoredWidth);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const lastCommittedNameRef = useRef<string | null>(null);

  const rackSelKey = selectedRack ? `${selectedRack.uuid ?? ""}-${selectedRack.id ?? selectedRack.rack_index}` : "";
  const nameSaved = (selectedRack?.name ?? "").trim();
  const effectiveRackLabel = selectedRack ? effectiveRackDisplayName(selectedRack, layout) : "";
  const rackDraftSyncKey = selectedRack ? `${rackSelKey}|${nameSaved}|${nameSaved ? "" : effectiveRackLabel}` : "";

  useEffect(() => {
    if (!selectedRack) {
      setNameDraft("");
      lastCommittedNameRef.current = null;
    } else {
      const label = effectiveRackDisplayName(selectedRack, layout);
      setNameDraft(label);
      lastCommittedNameRef.current = (selectedRack.name ?? "").trim() || null;
    }
    setNameError(null);
    setNameSaveHint("idle");
  }, [rackDraftSyncKey, selectedRack, layout]);

  const commitRackName = useCallback(
    (raw: string, _source: "blur" | "enter" | "save") => {
      if (!selectedRack) return true;
      const trimmed = raw.trim();
      const nextName = trimmed === "" ? undefined : trimmed;
      const id = { id: selectedRack.id, rack_index: selectedRack.rack_index, uuid: selectedRack.uuid };
      const vr = validateRackName(raw, layout, id);
      const oldName = lastCommittedNameRef.current;
      const newName = nextName ?? null;

      if (!vr.valid) {
        setNameError(vr.error ?? `Regał o nazwie '${trimmed || "?"}' już istnieje`);
        setNameSaveHint("error");
        logRackRename({
          rack_id: selectedRack.id ?? selectedRack.rack_index,
          old_name: oldName,
          new_name: newName,
          persisted: false,
        });
        return false;
      }

      setNameError(null);
      setLayout((prev) => ({
        ...prev,
        racks: prev.racks.map((rack) =>
          racksMatchIdentity(rack, selectedRack) ? { ...rack, name: nextName } : rack
        ),
      }));
      lastCommittedNameRef.current = newName;
      const changed = (oldName ?? "") !== (newName ?? "");
      if (changed) {
        setNameSaveHint("saved");
        logRackRename({
          rack_id: selectedRack.id ?? selectedRack.rack_index,
          old_name: oldName,
          new_name: newName,
          persisted: false,
        });
      } else {
        setNameSaveHint("idle");
      }
      return true;
    },
    [layout, selectedRack, setLayout]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startW + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      try {
        localStorage.setItem(WIDTH_STORAGE_KEY, String(panelWidth));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panelWidth]);

  const requestClose = useCallback(() => {
    if (nameSaveHint === "dirty" && !window.confirm("Masz niezapisane zmiany nazwy regału. Zamknąć panel bez zapisu układu?")) {
      return;
    }
    onEditingRackIdChange?.(null);
    onClose();
  }, [nameSaveHint, onClose, onEditingRackIdChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const rackTitle = selectedRack ? effectiveRackDisplayName(selectedRack, layout) : "Regał";
  const saveStatusLabel = saving
    ? "Zapisywanie…"
    : nameSaveHint === "error"
      ? "Błąd zapisu nazwy"
      : nameSaveHint === "saved" && lastSavedAt == null
        ? "Zmiany lokalne — zapisz układ"
        : lastSavedAt != null
          ? "Zapisano"
          : null;

  return (
    <aside
      ref={asideScrollRef}
      className={`fixed right-0 top-0 z-[40] flex h-screen min-h-0 w-full max-w-[100vw] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl md:max-w-none ${
        compact ? "text-[11px]" : ""
      }`}
      style={{ width: `min(100vw, ${panelWidth}px)`, overscrollBehavior: "contain" }}
      role="dialog"
      aria-label="Właściwości regału"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-200/60"
        onMouseDown={(e) => {
          e.preventDefault();
          resizeRef.current = { startX: e.clientX, startW: panelWidth };
        }}
      />
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0 pl-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {warehouseLabel ? `Magazyn / ${warehouseLabel}` : "Magazyn"} / {rackTitle}
          </p>
          <h2 className="truncate text-xs font-bold uppercase text-slate-700">
            {UI_STRINGS.warehouse.rackProperties.title}
          </h2>
          {saveStatusLabel ? (
            <p
              className={`mt-0.5 text-[10px] ${
                saving || nameSaveHint === "error" ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {saveStatusLabel}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={compact ? "Tryb normalny" : "Tryb kompaktowy"}
            onClick={() => setCompact((v) => !v)}
            className="rounded-md border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
          >
            {compact ? "▣" : "▢"}
          </button>
          <button
            type="button"
            aria-label="Zamknij panel"
            onClick={requestClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2">
        {selectedRack && isMultiSelect ? (
          <>
            <p className="text-sm font-semibold text-slate-800">Wybrano: {selectedRacks.length} regałów</p>
            <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
              <p>
                Wysokość:{" "}
                {(() => {
                  const heights = selectedRacks.map((r) => r.height_cm);
                  return heights.every((h) => h === heights[0]) ? heights[0] : "różne";
                })()}
              </p>
              <p>
                Poziomy:{" "}
                {(() => {
                  const levels = selectedRacks.map((r) => r.levels);
                  return levels.every((l) => l === levels[0]) ? levels[0] : "różne";
                })()}
              </p>
            </div>
          </>
        ) : (
          <>
            {selectedRack ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase text-slate-500">Nazwa regału</label>
                <input
                  type="text"
                  value={nameDraft}
                  onFocus={() => {
                    if (selectedRack) onEditingRackIdChange?.(rackPrimaryId(selectedRack));
                  }}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setNameSaveHint("dirty");
                    const v = e.target.value;
                    if (!selectedRack) return;
                    const id = { id: selectedRack.id, rack_index: selectedRack.rack_index, uuid: selectedRack.uuid };
                    const vr = validateRackName(v, layout, id);
                    setNameError(vr.valid ? null : vr.error ?? "Nieprawidłowa nazwa");
                    const nextName = v.trim() === "" ? undefined : v.trim();
                    setLayout((prev) => ({
                      ...prev,
                      racks: prev.racks.map((rack) =>
                        racksMatchIdentity(rack, selectedRack) ? { ...rack, name: nextName } : rack
                      ),
                    }));
                  }}
                  onBlur={() => {
                    void commitRackName(nameDraft, "blur");
                    onEditingRackIdChange?.(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRackName(nameDraft, "enter");
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      requestClose();
                    }
                  }}
                  placeholder={getRackDisplayId(selectedRack, layout)}
                  className={`w-full rounded-lg border px-2 py-1.5 text-sm text-slate-800 ${
                    nameError ? "border-red-400 ring-1 ring-red-200" : "border-slate-200"
                  }`}
                />
                {nameError ? <p className="text-[11px] text-red-600">{nameError}</p> : null}
                <div className="mt-2">
                  <label className="block text-[10px] font-semibold uppercase text-slate-500">Typ regału</label>
                  <select
                    value={selectedRack.rack_type === "store" ? "store" : "warehouse"}
                    onChange={(e) => {
                      const rack_type = e.target.value === "store" ? "store" : "warehouse";
                      setLayout((prev) => ({
                        ...prev,
                        racks: prev.racks.map((rack) =>
                          racksMatchIdentity(rack, selectedRack) ? { ...rack, rack_type } : rack
                        ),
                      }));
                    }}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                  >
                    <option value="warehouse">Magazyn</option>
                    <option value="store">Sklep</option>
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-600">Wybierz regał na planie lub zamknij panel.</p>
            )}
            {selectedRack && (
              <>
                <dl className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                  <dt>Wymiary</dt>
                  <dd className="text-slate-700">
                    {selectedRack.width_cm} × {selectedRack.length_cm} × {selectedRack.height_cm} cm
                  </dd>
                  <dt>{UI_STRINGS.warehouse.rackProperties.levelsBins}</dt>
                  <dd className="text-slate-700">
                    {(() => {
                      const lc = getLevelConfig(selectedRack);
                      const total = getTotalLocations(lc);
                      return lc.every((r) => r.locations === lc[0].locations)
                        ? `${lc.length} / ${lc[0]?.locations ?? 0}`
                        : `${lc.length} poz., Suma: ${total} lok.`;
                    })()}
                  </dd>
                </dl>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={selectedRack.show_label !== false}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setLayout((prev) => ({
                        ...prev,
                        racks: prev.racks.map((rack) =>
                          racksMatchIdentity(rack, selectedRack) ? { ...rack, show_label: v } : rack
                        ),
                      }));
                    }}
                    className="rounded"
                  />
                  Pokaż etykietę na mapie
                </label>
                {(() => {
                  const levels =
                    selectedRack.rackLevels ?? (selectedRack.bins?.length ? binsToLevels(selectedRack.bins) : []);
                  if (levels.length === 0) return null;
                  return (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Lokalizacje</p>
                      <div className="max-h-36 space-y-1.5 overflow-y-auto">
                        {levels.map((lev) => (
                          <div key={lev.levelIndex} className="text-[10px]">
                            <p className="font-semibold text-slate-600">Poziom {lev.levelIndex}</p>
                            <div className="space-y-0.5 pl-2">
                              {lev.positions.map((pos, posIndex) => {
                                const bin = selectedRack.bins?.find(
                                  (b) => (b.locationUUID ?? "").trim() === (pos.locationUUID ?? "").trim()
                                );
                                const line =
                                  bin != null
                                    ? getDisplayLocationLabel(selectedRack, bin, layout)
                                    : pos.locationAddress || pos.locationUUID || `Pozycja ${posIndex + 1}`;
                                return (
                                  <div key={pos.locationUUID} className="truncate font-mono text-slate-700" title={pos.locationUUID}>
                                    {line}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Trasa kompletacji</p>
              {routeRackIds.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  {isRouteActive ? "Tryb aktywny — kliknij pierwszy regał" : "Włącz „Planuj trasę” w pasku narzędzi."}
                </p>
              ) : (
                <>
                  {routeRackIds.length >= 2 && (
                    <p className="mb-1 text-[11px] text-slate-600">
                      Krok {routeStepIndex + 1}/{routeStepCount} · Odcinek {routeLegMeters.toFixed(1)} m · Całość{" "}
                      {routeLengthMeters.toFixed(1)} m
                    </p>
                  )}
                  <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                    {routeRackLabels.map((label, idx) => (
                      <li
                        key={`${label}-${idx}`}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          routeRackIds.length >= 2 && idx === routeStepIndex
                            ? "bg-blue-50 font-semibold text-blue-900 ring-1 ring-blue-200"
                            : "text-slate-700"
                        }`}
                      >
                        {idx + 1}. {label}
                      </li>
                    ))}
                  </ul>
                  {routeRackIds.length >= 2 && onRouteStepNext != null && (
                    <button
                      type="button"
                      onClick={onRouteStepNext}
                      disabled={routeStepIndex >= routeStepCount - 1}
                      className="mt-1.5 w-full rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                      Następny krok
                    </button>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button type="button" onClick={optimizeRoute} className="rounded border border-slate-300 px-2 py-0.5 text-[10px] hover:bg-slate-50">
                      Optymalizuj
                    </button>
                    <button type="button" onClick={clearRoute} className="rounded border border-slate-300 px-2 py-0.5 text-[10px] hover:bg-slate-50">
                      Wyczyść
                    </button>
                    <button type="button" onClick={finishRoute} className="rounded border border-slate-300 px-2 py-0.5 text-[10px] hover:bg-slate-50">
                      Zakończ
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="flex shrink-0 gap-2 border-t border-slate-100 bg-slate-50/90 px-3 py-2">
        {selectedRack && (
          <>
            <button
              type="button"
              onClick={() => setShowElevationForRackId(selectedRack.id ?? selectedRack.rack_index)}
              className="flex-1 rounded-lg bg-cyan-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500"
            >
              Widok z boku
            </button>
            <button
              type="button"
              onClick={() => setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
            >
              Układ wewn.
            </button>
          </>
        )}
        {onSaveLayout ? (
          <button
            type="button"
            disabled={saving || Boolean(nameError)}
            onClick={() => {
              if (selectedRack) commitRackName(nameDraft, "save");
              onSaveLayout();
            }}
            className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Zamknij
        </button>
      </footer>
      {selectedRack && !isMultiSelect && (
        <div className="border-t border-slate-100 px-3 py-1.5">
          <button
            type="button"
            onClick={() => {
              const ids = new Set(selectedRackIds);
              setLayout((prev) => ({ ...prev, racks: prev.racks.filter((r) => !ids.has(r.id ?? r.rack_index)) }));
              onClose();
            }}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
          >
            Usuń wybrane
          </button>
        </div>
      )}
    </aside>
  );
}

/** Flush pending rack name edits before layout PUT (called from parent save). */
export function flushRackNameFromLayoutRack(rack: RackState | null, layout: LayoutState): RackState | null {
  if (!rack) return rack;
  const found = layout.racks.find((r) => rackMatchesSlotRackId(r, rack.id ?? rack.rack_index));
  return found ?? rack;
}
