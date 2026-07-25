import type { LayoutState } from "../../../types/warehouse";
import { normalizePassageSource, PassageSource as PassageSourceEnum } from "../../../types/warehouse";
import {
  deletePassageGroup,
  findPassageGroup,
  resizeCorridorWidth,
} from "./rackPassageGeometry";
import type { SelectedPassage } from "../interactions/usePassageInteraction";

type Props = {
  layout: LayoutState;
  selectedPassage: SelectedPassage;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedPassage: React.Dispatch<React.SetStateAction<SelectedPassage | null>>;
  onClose?: () => void;
  onOpenTemplate?: () => void;
};

/** Compact corridor editor — multi-rack passages edit as one logical opening. */
export function PassageQuickEditor({ layout, selectedPassage, setLayout, setSelectedPassage, onClose, onOpenTemplate }: Props) {
  const members = findPassageGroup(layout, selectedPassage.rackUuid, selectedPassage.passageUuid);
  if (members.length === 0) return null;

  const primary = members.find((m) => m.passage.uuid === selectedPassage.passageUuid) ?? members[0];
  const { passage } = primary;
  const inherited = normalizePassageSource(passage.passage_source) === PassageSourceEnum.INHERITED;
  const corridorUuid = passage.corridor_uuid ?? null;
  const rackNames = members
    .map((m) => m.rack.name || m.rack.aisle_letter || "?")
    .filter(Boolean);
  const uniqueRacks = [...new Set(rackNames)];
  const clearance = members
    .map((m) => m.passage.clearance_height_cm)
    .find((v) => v != null && Number(v) > 0);
  const allEnabled = members.every((m) => m.passage.enabled !== false);
  const statusLabel = allEnabled ? "Drożny" : "Wyłączony";

  if (inherited) {
    return (
      <div className="rounded-lg border border-amber-200/90 bg-amber-50/95 p-2.5 shadow-lg shadow-slate-900/10 ring-1 ring-amber-100">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Przejazd z szablonu (INHERITED)
          </p>
          {onClose && (
            <button
              type="button"
              className="text-[10px] font-semibold text-slate-500 hover:text-slate-800"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
        <p className="mb-2 text-[10px] text-amber-950">
          Lokalna edycja CAD jest wyłączona. Zmieniaj przejazd w szablonie, potem „Aktualizuj instancje”.
        </p>
        {onOpenTemplate && (
          <button
            type="button"
            className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
            onClick={onOpenTemplate}
          >
            Otwórz szablon
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200/90 bg-white/95 p-2.5 shadow-lg shadow-slate-900/10 ring-1 ring-indigo-100">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
          Przejazd pod regałem
        </p>
        {onClose && (
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-500 hover:text-slate-800"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
      <p className="mb-1.5 text-[10px] text-slate-600">
        Regały: <span className="font-semibold text-slate-800">{uniqueRacks.join(", ")}</span>
        {members.length > 1 ? (
          <span className="ml-1 text-slate-400">({members.length} otworów · jedna grupa)</span>
        ) : null}
      </p>
      <p className="mb-2 text-[10px] text-slate-500">
        Status: <span className={allEnabled ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{statusLabel}</span>
        {clearance != null ? (
          <span className="ml-2">Prześwit: {Math.round(Number(clearance))} cm</span>
        ) : (
          <span className="ml-2 text-slate-400">Prześwit: —</span>
        )}
      </p>
      <p className="mb-2 text-[10px] text-slate-500">
        Przeciągnij na canvasie — przesuwa cały korytarz naraz.
      </p>
      <label className="block text-[10px] text-slate-600">
        Szerokość (cm)
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
        <span className="mt-0.5 block text-right font-mono text-[11px] text-slate-800">
          {Math.round(passage.width_cm)} cm
        </span>
      </label>
      <button
        type="button"
        className="mt-2 w-full rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
        onClick={() => {
          setLayout((prev) =>
            deletePassageGroup(prev, selectedPassage.rackUuid, selectedPassage.passageUuid)
          );
          setSelectedPassage(null);
        }}
      >
        Usuń przejazd
      </button>
    </div>
  );
}
