/**
 * Full passage configuration panel (Layout world only).
 * INHERITED → banner + „Otwórz szablon”; LOCAL → corridor-aware CAD edits.
 * Primary inspector for selected passage — replaces PassageQuickEditor.
 */

import type { LayoutState, RackPassageState } from "../../types/warehouse";
import { normalizePassageSource, PassageSource } from "../../types/warehouse";
import type { SelectedPassage } from "./interactions/usePassageInteraction";
import {
  deletePassageGroup,
  findPassageGroup,
  isInheritedPassage,
  resizeCorridorWidth,
} from "./passages/rackPassageGeometry";
import { PASSAGE_FIELD_HINTS, passageFieldLabel } from "../../components/warehouse/passageFieldCopy";
import { Card, DangerButton, GhostButton, Input, SecondaryButton, StatusText } from "../../design-system";

type Props = {
  layout: LayoutState;
  selectedPassage: SelectedPassage;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedPassage: React.Dispatch<React.SetStateAction<SelectedPassage | null>>;
  onClose?: () => void;
  /** Opens TemplateCreator for the rack's template (INHERITED). */
  onOpenTemplate?: () => void;
};

function patchPassageGroup(
  layout: LayoutState,
  selected: SelectedPassage,
  patch: Partial<Pick<RackPassageState, "offset_along_cm" | "width_cm" | "enabled" | "clearance_height_cm">>
): LayoutState {
  const members = findPassageGroup(layout, selected.rackUuid, selected.passageUuid);
  if (members.length === 0) return layout;
  const uuids = new Set(members.map((m) => m.passage.uuid));
  return {
    ...layout,
    racks: layout.racks.map((r) => ({
      ...r,
      passages: (r.passages ?? []).map((p) =>
        uuids.has(p.uuid)
          ? {
              ...p,
              ...patch,
              // Local inspector writes always LOCAL (INHERITED is read-only here).
              passage_source: PassageSource.LOCAL,
            }
          : p
      ),
    })),
  };
}

export function PassageInspector({
  layout,
  selectedPassage,
  setLayout,
  setSelectedPassage,
  onClose,
  onOpenTemplate,
}: Props) {
  const members = findPassageGroup(layout, selectedPassage.rackUuid, selectedPassage.passageUuid);
  if (members.length === 0) return null;

  const primary = members.find((m) => m.passage.uuid === selectedPassage.passageUuid) ?? members[0];
  const { passage, rack } = primary;
  const inherited = isInheritedPassage(passage);
  const source = normalizePassageSource(passage.passage_source);
  const corridorUuid = passage.corridor_uuid ?? null;
  const rackNames = [...new Set(members.map((m) => m.rack.name || m.rack.aisle_letter || "?").filter(Boolean))];
  const allEnabled = members.every((m) => m.passage.enabled !== false);
  const clearanceDisplay = members.map((m) => m.passage.clearance_height_cm).find((v) => v != null && Number(v) > 0);
  const along = Math.max(1, Number(rack.length_cm ?? rack.width_cm ?? 100));
  const endCm = Number(passage.offset_along_cm) + Number(passage.width_cm);
  const geometryInvalid = members.length === 1 && endCm > along + 0.01;

  return (
    <Card
      variant="section"
      density="compact"
      className="space-y-2 text-[12px] text-slate-700 shadow-lg shadow-slate-900/10"
      data-testid="passage-inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Przejazd</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Regał{rackNames.length > 1 ? "y" : ""}:{" "}
            <span className="font-semibold text-slate-800">{rackNames.join(", ") || rack.name || "—"}</span>
            {members.length > 1 ? (
              <span className="ml-1 text-slate-400">({members.length} otworów · jedna grupa)</span>
            ) : null}
          </p>
          <p className="text-[10px] text-slate-500">
            Źródło:{" "}
            <span className="font-semibold">
              {source === PassageSource.INHERITED ? "Ze szablonu" : "Lokalny"}
            </span>
          </p>
        </div>
        {onClose && (
          <GhostButton density="compact" onClick={onClose} aria-label="Zamknij">
            ✕
          </GhostButton>
        )}
      </div>

      {inherited ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
          Ten przejazd pochodzi z szablonu — lokalna edycja jest wyłączona. Zmieniaj przejazd w
          szablonie, potem „Aktualizuj regały z szablonu”.
          <p className="mt-1 text-[10px] text-amber-900/90">
            Wysokość wolnej przestrzeni:{" "}
            {clearanceDisplay != null ? `${Math.round(Number(clearanceDisplay))} cm` : "— (bez wpływu na lokalizacje)"}
          </p>
          {onOpenTemplate ? (
            <SecondaryButton
              data-testid="passage-open-template"
              density="compact"
              className="mt-2 w-full"
              onClick={onOpenTemplate}
            >
              Otwórz szablon
            </SecondaryButton>
          ) : (
            <p className="mt-2 text-[10px] text-amber-800/80">
              Brak powiązanego szablonu na tym regale — otwórz szablon z katalogu.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500">
            Status: <StatusText tone={allEnabled ? "success" : "warning"}>{allEnabled ? "Włączony" : "Wyłączony"}</StatusText>
          </p>
          <p className="text-[10px] text-slate-500">
            Przeciągnij na planie — przesuwa cały korytarz naraz.
          </p>
          {members.length === 1 && (
            <label className={`block text-[11px] ${geometryInvalid ? "text-red-700" : ""}`}>
              {passageFieldLabel("offset")}
              <Input
                type="number"
                min={0}
                density="compact"
                className={`mt-0.5 ${geometryInvalid ? "border-red-400 bg-red-50" : ""}`}
                value={Math.round(passage.offset_along_cm)}
                aria-invalid={geometryInvalid}
                onChange={(e) => {
                  const offset_along_cm = Math.max(0, Number(e.target.value) || 0);
                  setLayout((prev) => patchPassageGroup(prev, selectedPassage, { offset_along_cm }));
                }}
              />
              <span className="mt-0.5 block text-[10px] text-slate-500">{PASSAGE_FIELD_HINTS.offset}</span>
            </label>
          )}
          <label className={`block text-[11px] ${geometryInvalid ? "text-red-700" : ""}`}>
            {passageFieldLabel("width")}
            <input
              type="range"
              min={40}
              max={200}
              step={5}
              value={Math.round(passage.width_cm)}
              onChange={(e) => {
                const width_cm = Number(e.target.value) || 90;
                setLayout((prev) =>
                  resizeCorridorWidth(prev, corridorUuid, width_cm, {
                    rackUuid: selectedPassage.rackUuid,
                    passageUuid: selectedPassage.passageUuid,
                  })
                );
              }}
              className="mt-1 w-full accent-indigo-600"
            />
            <span className={`mt-0.5 block text-right font-mono text-[11px] ${geometryInvalid ? "text-red-700" : "text-slate-800"}`}>
              {Math.round(passage.width_cm)} cm
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">{PASSAGE_FIELD_HINTS.width}</span>
          </label>
          <label className="block text-[11px]">
            {passageFieldLabel("clearance")}
            <Input
              type="number"
              min={0}
              step={10}
              density="compact"
              className="mt-0.5"
              value={passage.clearance_height_cm ?? ""}
              placeholder="np. 80"
              onChange={(e) => {
                const raw = e.target.value.trim();
                const clearance_height_cm = raw === "" ? null : Math.max(0, Number(raw) || 0);
                setLayout((prev) => patchPassageGroup(prev, selectedPassage, { clearance_height_cm }));
              }}
            />
            <span className="mt-0.5 block text-[10px] text-slate-500">{PASSAGE_FIELD_HINTS.clearance}</span>
          </label>
          {geometryInvalid ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-800">
              Przejazd wychodzi poza głębokość regału ({Math.round(along)} cm). Popraw początek lub szerokość.
            </p>
          ) : null}
          <label className="inline-flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={allEnabled}
              onChange={(e) => {
                setLayout((prev) => patchPassageGroup(prev, selectedPassage, { enabled: e.target.checked }));
              }}
            />
            Włączony
          </label>
          <DangerButton
            density="compact"
            className="w-full"
            onClick={() => {
              setLayout((prev) =>
                deletePassageGroup(prev, selectedPassage.rackUuid, selectedPassage.passageUuid)
              );
              setSelectedPassage(null);
            }}
          >
            Usuń przejazd
          </DangerButton>
        </div>
      )}
    </Card>
  );
}