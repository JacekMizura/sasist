import { useMemo, useState } from "react";
import type { LocationAccessBinding } from "../../../api/warehouseRoutingApi";
import type { RackState } from "../../../types/warehouse";
import {
  buildAccessProblemItems,
  groupAccessProblemsByRack,
  type AccessProblemItem,
} from "./locationAccessProblems";
import { Card, CardButton, GhostButton } from "../../../design-system";

type Props = {
  locationAccess: LocationAccessBinding[];
  locations: { id: number; name: string; location_type?: string | null }[];
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
    <Card variant="section" density="compact" className="space-y-2">
      <div className="font-semibold text-slate-700">Dostęp lokalizacji</div>
      <p className="text-[10px] text-slate-500">
        Lokalizacje z dostępem do trasy: <strong className="text-slate-700">{okCount}</strong>
        {" · "}
        Lokalizacje bez dostępu: <strong className="text-rose-800">{problems.length}</strong>
      </p>

      {problems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <CardButton density="compact" active={listOpen} onClick={() => setListOpen((v) => !v)}>
            {listOpen ? "Ukryj bez dostępu" : "Pokaż bez dostępu"}
          </CardButton>
          <CardButton
            density="compact"
            tone="rose"
            active={showAllProblems}
            onClick={onToggleShowAll}
          >
            {showAllProblems ? "Wyłącz oznaczenia" : "Pokaż wszystkie problemy"}
          </CardButton>
          {(selectedLocationId != null || showAllProblems) && (
            <GhostButton density="compact" onClick={onClearSelection}>
              Wyczyść wybór
            </GhostButton>
          )}
        </div>
      )}

      {listOpen && problems.length > 0 && (
        <div className="max-h-52 space-y-2 overflow-auto rounded-md border border-slate-200 bg-white p-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-rose-800">Bez dostępu</div>
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
    </Card>
  );
}
