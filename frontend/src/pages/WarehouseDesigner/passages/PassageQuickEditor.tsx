import type { LayoutState } from "../../../types/warehouse";
import { deleteRackPassage, findRackPassage, updateRackPassage } from "./rackPassageGeometry";
import type { SelectedPassage } from "../interactions/usePassageInteraction";

type Props = {
  layout: LayoutState;
  selectedPassage: SelectedPassage;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedPassage: React.Dispatch<React.SetStateAction<SelectedPassage | null>>;
  onClose?: () => void;
};

/** Compact width/delete editor for canvas-selected passage. */
export function PassageQuickEditor({ layout, selectedPassage, setLayout, setSelectedPassage, onClose }: Props) {
  const hit = findRackPassage(layout, selectedPassage.rackUuid, selectedPassage.passageUuid);
  if (!hit) return null;
  const { rack, passage } = hit;

  return (
    <div className="rounded-lg border border-indigo-200/90 bg-white/95 p-2.5 shadow-lg shadow-slate-900/10 ring-1 ring-indigo-100">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Przejazd</p>
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
      <p className="mb-2 text-[10px] text-slate-500">Przeciągnij przejazd wzdłuż regału, aby zmienić pozycję.</p>
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
              updateRackPassage(prev, selectedPassage.rackUuid, selectedPassage.passageUuid, { width_cm })
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
          setLayout((prev) => deleteRackPassage(prev, selectedPassage.rackUuid, selectedPassage.passageUuid));
          setSelectedPassage(null);
        }}
      >
        Usuń przejazd
      </button>
      <p className="mt-1.5 text-[9px] text-slate-400">Regał: {rack.name ?? rack.aisle_letter}{rack.rack_index}</p>
    </div>
  );
}
