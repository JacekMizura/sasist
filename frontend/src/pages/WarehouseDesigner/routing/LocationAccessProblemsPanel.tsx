import { useMemo, useState } from "react";
import type { LocationAccessBinding } from "../../../api/warehouseRoutingApi";
import type { RackState } from "../../../types/warehouse";
import {
  buildAccessProblemItems,
  groupAccessProblemsByRack,
  type AccessProblemItem,
} from "./locationAccessProblems";

type Props = {
  locationAccess: LocationAccessBinding[];
  locations: { id: number; name: string }[];
  racks: RackState[];
  selectedLocationId: number | null;
  showAllProblems: boolean;
  onSelectProblem: (item: AccessProblemItem) => void;
  onToggleShowAll: () => void;
  onClearSelection: () => void;
};

/**
 * Interactive diagnostics: list locations without access, locate on canvas.
 * Does not change Location Access resolver — read-only projection.
 */
export function LocationAccessProblemsPanel({
  locationAccess,
  locations,
  racks,
  selectedLocationId,
  showAllProblems,
  onSelectProblem,
  onToggleShowAll,
  onClearSelection,
}: Props) {
  const [listOpen, setListOpen] = useState(false);

  const problems = useMemo(
    () => buildAccessProblemItems(locationAccess, locations, racks),
    [locationAccess, locations, racks]
  );
  const groups = useMemo(() => groupAccessProblemsByRack(problems), [problems]);
  const okCount = useMemo(
    () =>
      locationAccess.filter((a) => {
        const s = String(a.status || "").toUpperCase();
        return s === "OK" || s === "RESOLVED" || s === "LEGACY_NODE";
      }).length,
    [locationAccess]
  );

  if (locationAccess.length === 0 && problems.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
      <div className="font-semibold text-slate-700">Dostęp lokalizacji</div>
      <p className="text-[10px] text-slate-500">
        Lokalizacje z dostępem do trasy: <strong className="text-slate-700">{okCount}</strong>
        {" · "}
        Lokalizacje bez dostępu: <strong className="text-rose-800">{problems.length}</strong>
      </p>

      {problems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setListOpen((v) => !v)}
          >
            {listOpen ? "Ukryj lokalizacje" : "Pokaż lokalizacje"}
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
              showAllProblems
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            onClick={onToggleShowAll}
          >
            {showAllProblems ? "Wyłącz oznaczenia" : "Pokaż wszystkie problemy"}
          </button>
          {(selectedLocationId != null || showAllProblems) && (
            <button
              type="button"
              className="rounded border border-transparent px-2 py-0.5 text-[10px] text-slate-500 underline"
              onClick={onClearSelection}
            >
              Wyczyść wybór
            </button>
          )}
        </div>
      )}

      {listOpen && problems.length > 0 && (
        <div className="max-h-52 space-y-2 overflow-auto rounded-md border border-slate-200 bg-white p-2">
          {groups.map((g) => (
            <div key={g.rackKey}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {g.rackLabel}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {g.items.map((it) => {
                  const active = selectedLocationId === it.locationId;
                  return (
                    <li key={it.locationId}>
                      <button
                        type="button"
                        className={`flex w-full items-start gap-1 rounded px-1.5 py-1 text-left text-[11px] ${
                          active
                            ? "bg-rose-50 text-rose-950 ring-1 ring-rose-200"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => onSelectProblem(it)}
                      >
                        <span className="mt-0.5 text-rose-500">•</span>
                        <span>
                          <span className="font-semibold">{it.locationName}</span>
                          <span className="text-slate-500"> — {it.reason}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
