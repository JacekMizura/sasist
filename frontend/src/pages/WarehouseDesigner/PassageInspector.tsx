/**
 * Full passage configuration panel (Layout world only).
 * INHERITED → banner + open template; LOCAL → geometry edits.
 */

import type { RackPassageState, RackState } from "../../types/warehouse";
import { normalizePassageSource, PassageSource } from "../../types/warehouse";
import { isInheritedPassage } from "./passages/rackPassageGeometry";

type Props = {
  rack: RackState;
  passage: RackPassageState;
  onChangeLocal: (patch: Partial<Pick<RackPassageState, "offset_along_cm" | "width_cm" | "enabled">>) => void;
  onDeleteLocal: () => void;
  onOpenTemplate?: () => void;
};

export function PassageInspector({ rack, passage, onChangeLocal, onDeleteLocal, onOpenTemplate }: Props) {
  const inherited = isInheritedPassage(passage);
  const source = normalizePassageSource(passage.passage_source);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[12px] text-slate-700">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Przejazd</div>
      <p className="text-[11px] text-slate-500">
        Regał: <span className="font-semibold text-slate-800">{rack.name ?? rack.aisle_letter ?? "—"}</span>
      </p>
      <p className="text-[10px] text-slate-500">
        Źródło:{" "}
        <span className="font-semibold">
          {source === PassageSource.INHERITED ? "INHERITED (szablon)" : "LOCAL"}
        </span>
      </p>
      {inherited ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
          Ten przejazd pochodzi z szablonu — lokalna edycja CAD jest wyłączona.
          {onOpenTemplate && (
            <button
              type="button"
              className="mt-2 block w-full rounded border border-amber-300 bg-white py-1.5 font-semibold"
              onClick={onOpenTemplate}
            >
              Otwórz szablon
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px]">
            Offset (cm)
            <input
              type="number"
              min={0}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1"
              value={Math.round(passage.offset_along_cm)}
              onChange={(e) => onChangeLocal({ offset_along_cm: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="block text-[11px]">
            Szerokość (cm)
            <input
              type="number"
              min={1}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1"
              value={Math.round(passage.width_cm)}
              onChange={(e) => onChangeLocal({ width_cm: Math.max(1, Number(e.target.value) || 100) })}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={passage.enabled !== false}
              onChange={(e) => onChangeLocal({ enabled: e.target.checked })}
            />
            Włączony
          </label>
          <button
            type="button"
            className="w-full rounded border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-semibold text-rose-800"
            onClick={onDeleteLocal}
          >
            Usuń przejazd
          </button>
        </div>
      )}
    </div>
  );
}
