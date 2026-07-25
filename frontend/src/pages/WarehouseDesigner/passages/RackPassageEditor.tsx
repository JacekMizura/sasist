import type { Dispatch, SetStateAction } from "react";
import type { RackPassageState, RackState, LayoutState } from "../../../types/warehouse";
import { isInheritedPassage, defaultPassageForRack, rackAlongLengthCm } from "./rackPassageGeometry";
import { PASSAGE_FIELD_HINTS, passageFieldLabel } from "../../../components/warehouse/passageFieldCopy";
import { isPassageGeometryValid } from "../../../components/warehouse/TemplatePassageOverlay";

type Props = {
  selectedRack: RackState;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  /** Opens TemplateCreator for inherited passage defaults. */
  onOpenTemplate?: (templateId: string) => void;
};

function matchRack(a: RackState, b: RackState): boolean {
  if (a.uuid && b.uuid && a.uuid === b.uuid) return true;
  return String(a.id ?? a.rack_index) === String(b.id ?? b.rack_index);
}

function updatePassages(
  setLayout: Props["setLayout"],
  selectedRack: RackState,
  next: RackPassageState[]
) {
  setLayout((prev) => ({
    ...prev,
    racks: prev.racks.map((r) => (matchRack(r, selectedRack) ? { ...r, passages: next } : r)),
  }));
}

/** Passage section inside rack properties (not a separate inspector). */
export function RackPassageEditor({ selectedRack, setLayout, onOpenTemplate }: Props) {
  const passages = selectedRack.passages ?? [];
  const along = rackAlongLengthCm(selectedRack);
  const templateId = selectedRack.templateId?.trim() || "";

  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Przejazd</p>
      <p className="mb-2 text-[10px] text-slate-500">
        Cecha regału — pełna głębokość. Konfigurujesz początek i szerokość wzdłuż regału.
      </p>
      {passages.length === 0 ? (
        <button
          type="button"
          className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
          onClick={() => updatePassages(setLayout, selectedRack, [defaultPassageForRack(selectedRack)])}
        >
          Dodaj przejazd pod regałem
        </button>
      ) : (
        <p className="mb-2 text-[10px] text-slate-500">Limit: jeden przejazd. Usuń istniejący, aby dodać inny.</p>
      )}
      <ul className="space-y-2">
        {passages.map((p) => {
          const inherited = isInheritedPassage(p);
          const geometryInvalid = !isPassageGeometryValid(along, Number(p.offset_along_cm), Number(p.width_cm));
          return (
            <li
              key={p.uuid}
              className={`rounded-lg border bg-slate-50/80 p-2 ${
                geometryInvalid ? "border-red-400 ring-1 ring-red-300" : "border-slate-200"
              }`}
            >
              {inherited ? (
                <div className="mb-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-600">
                  Przejazd ze szablonu. Zmiany geometrii zapiszesz lokalnie; domyślne wartości edytuj w szablonie.
                  {templateId && onOpenTemplate ? (
                    <button
                      type="button"
                      className="mt-1.5 block w-full rounded border border-slate-200 bg-slate-50 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                      onClick={() => onOpenTemplate(templateId)}
                    >
                      Otwórz szablon
                    </button>
                  ) : null}
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={p.enabled !== false}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    updatePassages(
                      setLayout,
                      selectedRack,
                      passages.map((x) => (x.uuid === p.uuid ? { ...x, enabled } : x))
                    );
                  }}
                />
                Włącz przejazd
              </label>
              <label className={`mt-1 block text-[10px] ${geometryInvalid ? "text-red-700" : "text-slate-500"}`}>
                {passageFieldLabel("offset")}
                <input
                  type="number"
                  min={0}
                  max={along}
                  step={5}
                  value={Math.round(p.offset_along_cm)}
                  aria-invalid={geometryInvalid}
                  onChange={(e) => {
                    const offset_along_cm = Math.max(0, Number(e.target.value) || 0);
                    updatePassages(
                      setLayout,
                      selectedRack,
                      passages.map((x) => (x.uuid === p.uuid ? { ...x, offset_along_cm } : x))
                    );
                  }}
                  className={`mt-0.5 w-full rounded border px-1.5 py-1 text-sm ${
                    geometryInvalid ? "border-red-400 bg-red-50" : "border-slate-200"
                  }`}
                />
                <span className="mt-0.5 block text-[9px] text-slate-400">{PASSAGE_FIELD_HINTS.offset}</span>
              </label>
              <label className={`mt-1 block text-[10px] ${geometryInvalid ? "text-red-700" : "text-slate-500"}`}>
                {passageFieldLabel("width")}
                <input
                  type="number"
                  min={1}
                  max={along}
                  step={5}
                  value={Math.round(p.width_cm)}
                  aria-invalid={geometryInvalid}
                  onChange={(e) => {
                    const width_cm = Math.max(1, Number(e.target.value) || 1);
                    updatePassages(
                      setLayout,
                      selectedRack,
                      passages.map((x) => (x.uuid === p.uuid ? { ...x, width_cm } : x))
                    );
                  }}
                  className={`mt-0.5 w-full rounded border px-1.5 py-1 text-sm ${
                    geometryInvalid ? "border-red-400 bg-red-50" : "border-slate-200"
                  }`}
                />
                <span className="mt-0.5 block text-[9px] text-slate-400">{PASSAGE_FIELD_HINTS.width}</span>
              </label>
              <label className="mt-1 block text-[10px] text-slate-500">
                {passageFieldLabel("clearance")}
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={p.clearance_height_cm ?? ""}
                  placeholder="np. 80"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const clearance_height_cm = raw === "" ? null : Math.max(0, Number(raw) || 0);
                    updatePassages(
                      setLayout,
                      selectedRack,
                      passages.map((x) => (x.uuid === p.uuid ? { ...x, clearance_height_cm } : x))
                    );
                  }}
                  className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-sm"
                />
                <span className="mt-0.5 block text-[9px] text-slate-400">{PASSAGE_FIELD_HINTS.clearance}</span>
              </label>
              {geometryInvalid ? (
                <p className="mt-1 text-[10px] font-semibold text-red-700">
                  Przejazd wychodzi poza długość osi regału ({Math.round(along)} cm).
                </p>
              ) : null}
              <button
                type="button"
                className="mt-1 text-[10px] font-semibold text-rose-700 underline"
                onClick={() =>
                  updatePassages(
                    setLayout,
                    selectedRack,
                    passages.filter((x) => x.uuid !== p.uuid)
                  )
                }
              >
                Usuń przejazd
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
