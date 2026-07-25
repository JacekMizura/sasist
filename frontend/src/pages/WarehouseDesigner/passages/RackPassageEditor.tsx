import type { RackPassageState, RackState, LayoutState } from "../../../types/warehouse";
import { defaultPassageForRack, rackAlongLengthCm } from "./rackPassageGeometry";
import { PASSAGE_FIELD_HINTS, passageFieldLabel } from "../../../components/warehouse/passageFieldCopy";

type Props = {
  selectedRack: RackState;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
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

/** Simple passage CRUD in rack properties sidebar. */
export function RackPassageEditor({ selectedRack, setLayout }: Props) {
  const passages = selectedRack.passages ?? [];
  const along = rackAlongLengthCm(selectedRack);

  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Przejazd pod regałem</p>
      <p className="mb-2 text-[10px] text-slate-500">
        Jeden przejazd na regał (pełna głębokość). Przesuwa się razem z regałem.
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
          const endCm = Number(p.offset_along_cm) + Number(p.width_cm);
          const geometryInvalid = endCm > along + 0.01;
          return (
          <li
            key={p.uuid}
            className={`rounded-lg border bg-slate-50/80 p-2 ${
              geometryInvalid ? "border-red-400 ring-1 ring-red-300" : "border-slate-200"
            }`}
          >
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
              Włączony
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
                min={10}
                max={along}
                step={5}
                value={Math.round(p.width_cm)}
                aria-invalid={geometryInvalid}
                onChange={(e) => {
                  const width_cm = Math.max(10, Number(e.target.value) || 10);
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
            {geometryInvalid ? (
              <p className="mt-1 text-[10px] font-semibold text-red-700">
                Przejazd wychodzi poza głębokość regału ({Math.round(along)} cm).
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
