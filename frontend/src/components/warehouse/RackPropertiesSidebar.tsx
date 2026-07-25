import type { Dispatch, SetStateAction, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import type { RackState, LayoutState } from "./warehouseTypes";
import {
  getLevelConfig,
  getTotalLocations,
  getRackDisplayId,
  validateRackName,
  effectiveRackDisplayName,
  rackMatchesSlotRackId,
  rackPrimaryId,
  binUsedVolumeDm3,
  binVolumeDm3,
  formatVolume,
  isBinActive,
} from "./warehouseUtils";
import { UI_STRINGS } from "../../constants/uiStrings";
import { logRackRename } from "./rackRenameLog";
import { syncRackBinsDisplayFields } from "../../utils/resolvedWarehouseLocation";
import { appLayoutTokens } from "../../layout/appLayoutTokens";
import { RackPassageEditor } from "../../pages/WarehouseDesigner/passages/RackPassageEditor";
import { RackLocationsSection } from "./RackLocationsSection";

export type RackPropertiesSidebarProps = {
  layout: LayoutState;
  selectedRack: RackState | null;
  selectedRacks: RackState[];
  isMultiSelect: boolean;
  selectedRackIds: Array<number | string>;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  onClose: () => void;
  editingRackId?: number | string | null;
  onEditingRackIdChange?: (id: number | string | null) => void;
  onSaveLayout?: () => void;
  saving?: boolean;
  lastSavedAt?: number | null;
  warehouseLabel?: string;
  /** Display name of the rack template (if any). */
  templateName?: string | null;
  /** Opens rack template editor (for inherited passages). */
  onOpenRackTemplate?: (templateId: string) => void;
};

function racksMatchIdentity(a: RackState, b: RackState): boolean {
  if (a.uuid != null && b.uuid != null && String(a.uuid) === String(b.uuid)) return true;
  return String(a.id ?? a.rack_index) === String(b.id ?? b.rack_index);
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{children}</p>
  );
}

export function RackPropertiesSidebar({
  layout,
  selectedRack,
  selectedRacks,
  isMultiSelect,
  selectedRackIds,
  setLayout,
  setInternalLayoutRackId,
  setSelectedRackId,
  setSelectedRackIds,
  onClose,
  editingRackId = null,
  onEditingRackIdChange,
  onSaveLayout,
  saving = false,
  lastSavedAt = null,
  warehouseLabel,
  templateName = null,
  onOpenRackTemplate,
}: RackPropertiesSidebarProps) {
  void editingRackId;
  void setSelectedRackId;
  const asideScrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${selectedRack?.id ?? selectedRack?.rack_index ?? ""}-${selectedRackIds.join(",")}`;
  useWheelScrollBoundaryContain(asideScrollRef, true, scrollKey);

  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaveHint, setNameSaveHint] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  const [compact, setCompact] = useState(false);
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
      setLayout((prev) => {
        const renamedRacks = prev.racks.map((rack) =>
          racksMatchIdentity(rack, selectedRack) ? { ...rack, name: nextName } : rack
        );
        const layoutDraft = { ...prev, racks: renamedRacks };
        return {
          ...prev,
          racks: renamedRacks.map((rack) =>
            racksMatchIdentity(rack, selectedRack)
              ? { ...rack, bins: syncRackBinsDisplayFields(rack, layoutDraft) }
              : rack
          ),
        };
      });
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

  const requestClose = useCallback(() => {
    if (
      nameSaveHint === "dirty" &&
      !window.confirm("Masz niezapisane zmiany nazwy regału. Zamknąć panel bez zapisu układu?")
    ) {
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

  const stats = useMemo(() => {
    if (!selectedRack) return null;
    const activeBins = (selectedRack.bins ?? []).filter(isBinActive);
    const used =
      selectedRack.used_dm3 ?? activeBins.reduce((s, b) => s + binUsedVolumeDm3(b), 0);
    const total =
      selectedRack.total_capacity_dm3 ??
      activeBins.reduce((s, b) => s + binVolumeDm3(b, selectedRack), 0);
    const occupied = activeBins.filter((b) => binUsedVolumeDm3(b) > 0.001).length;
    const lc = getLevelConfig(selectedRack);
    return {
      used,
      total,
      occupancyPct: total > 0 ? (used / total) * 100 : 0,
      locations: activeBins.length || getTotalLocations(lc),
      activeLocations: activeBins.length,
      occupied,
      levels: lc.length,
      locsPerLevel: lc.every((r) => r.locations === lc[0]?.locations)
        ? (lc[0]?.locations ?? selectedRack.bins_per_level)
        : null,
    };
  }, [selectedRack]);

  return (
    <div
      ref={asideScrollRef}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${appLayoutTokens.appPanelBackground} ${
        compact ? "text-[11px]" : ""
      }`}
    >
      <header className={`flex shrink-0 items-start justify-between gap-2 border-b ${appLayoutTokens.appBorder} px-3 py-2`}>
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
        ) : !selectedRack ? (
          <p className="text-sm font-medium text-slate-600">Wybierz regał na planie lub zamknij panel.</p>
        ) : (
          <div className="space-y-4">
            {/* —— Informacje —— */}
            <section>
              <SectionTitle>Informacje</SectionTitle>
              <label className="block text-[10px] font-semibold text-slate-500">Nazwa</label>
              <input
                type="text"
                value={nameDraft}
                onFocus={() => {
                  onEditingRackIdChange?.(rackPrimaryId(selectedRack));
                }}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setNameSaveHint("dirty");
                  const v = e.target.value;
                  const id = {
                    id: selectedRack.id,
                    rack_index: selectedRack.rack_index,
                    uuid: selectedRack.uuid,
                  };
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
                className={`mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm text-slate-800 ${
                  nameError ? "border-red-400 ring-1 ring-red-200" : "border-slate-200"
                }`}
              />
              {nameError ? <p className="mt-0.5 text-[11px] text-red-600">{nameError}</p> : null}

              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-slate-500">Typ</dt>
                <dd>
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
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-800"
                  >
                    <option value="warehouse">Magazyn</option>
                    <option value="store">Sklep</option>
                  </select>
                </dd>
                <dt className="text-slate-500">Szablon</dt>
                <dd className="text-slate-800">
                  {templateName?.trim() ||
                    (selectedRack.templateId ? String(selectedRack.templateId) : "—")}
                </dd>
                <dt className="text-slate-500">Wymiary</dt>
                <dd className="text-slate-800">
                  {selectedRack.width_cm} × {selectedRack.length_cm} × {selectedRack.height_cm} cm
                </dd>
                <dt className="text-slate-500">Liczba poziomów</dt>
                <dd className="text-slate-800">{stats?.levels ?? selectedRack.levels}</dd>
                <dt className="text-slate-500">Lokalizacji na poziom</dt>
                <dd className="text-slate-800">
                  {stats?.locsPerLevel != null
                    ? stats.locsPerLevel
                    : (() => {
                        const lc = getLevelConfig(selectedRack);
                        return lc.map((r) => r.locations).join(", ");
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
            </section>

            {/* —— Przejazd —— */}
            <section className="border-t border-slate-100 pt-3">
              <RackPassageEditor
                selectedRack={selectedRack}
                setLayout={setLayout}
                onOpenTemplate={onOpenRackTemplate}
              />
            </section>

            {/* —— Statystyki —— */}
            {stats ? (
              <section className="border-t border-slate-100 pt-3">
                <SectionTitle>Statystyki</SectionTitle>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Pojemność / zajętość</p>
                  <p className="font-mono text-sm text-slate-800">
                    {formatVolume(stats.used)} / {formatVolume(stats.total)} dm³
                  </p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stats.occupancyPct <= 50
                          ? "bg-emerald-500"
                          : stats.occupancyPct <= 80
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, stats.occupancyPct)}%` }}
                    />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div>
                      <dt className="text-slate-500">Lokalizacji</dt>
                      <dd className="font-semibold text-slate-800">{stats.locations}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Aktywnych</dt>
                      <dd className="font-semibold text-slate-800">{stats.activeLocations}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Zajętych</dt>
                      <dd className="font-semibold text-slate-800">{stats.occupied}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Wolnych</dt>
                      <dd className="font-semibold text-slate-800">
                        {Math.max(0, stats.activeLocations - stats.occupied)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            ) : null}

            {/* —— Lokalizacje (karty z widoku z boku) —— */}
            <section className="border-t border-slate-100 pt-3">
              <SectionTitle>Lokalizacje</SectionTitle>
              <RackLocationsSection layout={layout} rack={selectedRack} />
            </section>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-1.5 border-t border-slate-100 bg-slate-50/90 px-3 py-2">
        {selectedRack ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
            >
              Układ wewnętrzny
            </button>
            {onSaveLayout ? (
              <button
                type="button"
                disabled={saving || Boolean(nameError)}
                onClick={() => {
                  commitRackName(nameDraft, "save");
                  onSaveLayout();
                }}
                className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            ) : null}
          </div>
        ) : null}
        {selectedRack && !isMultiSelect ? (
          <button
            type="button"
            onClick={() => {
              const ids = new Set(selectedRackIds);
              setLayout((prev) => ({
                ...prev,
                racks: prev.racks.filter((r) => !ids.has(r.id ?? r.rack_index)),
              }));
              setSelectedRackIds([]);
              onClose();
            }}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
          >
            Usuń
          </button>
        ) : null}
      </footer>
    </div>
  );
}

/** Flush pending rack name edits before layout PUT (called from parent save). */
export function flushRackNameFromLayoutRack(rack: RackState | null, layout: LayoutState): RackState | null {
  if (!rack) return rack;
  const found = layout.racks.find((r) => rackMatchesSlotRackId(r, rack.id ?? rack.rack_index));
  return found ?? rack;
}
