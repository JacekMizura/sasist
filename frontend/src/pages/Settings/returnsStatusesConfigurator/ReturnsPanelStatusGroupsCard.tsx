import { useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import type { ReturnUiMainGroup, ReturnUiPanelSubgroupRead, ReturnUiStatusPanelSummary, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import {
  RETURN_MAIN_GROUP_CHIP,
  RETURN_MAIN_GROUP_DOT,
  RETURN_MAIN_GROUP_LABELS,
  RETURN_MAIN_GROUP_ORDER,
} from "./constants";

type Props = {
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  onAddSubgroup: (mainGroup: ReturnUiMainGroup) => void;
  onAddStatus: (mainGroup: ReturnUiMainGroup) => void;
  onEditStatus: (status: ReturnUiStatusWithCount) => void;
  onDeleteStatus: (id: number) => void;
};

export function ReturnsPanelStatusGroupsCard({
  summary,
  panelSubgroups,
  onAddSubgroup,
  onAddStatus,
  onEditStatus,
  onDeleteStatus,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Grupy główne statusów</h3>
          <p className="mt-1 text-sm text-slate-500">Trzy etapy procesu zwrotu — statusy przypisujesz do podgrup.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => onAddSubgroup("NEW")}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Dodaj grupę
        </button>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3">
        {RETURN_MAIN_GROUP_ORDER.map((mg) => (
          <GroupTile
            key={mg}
            mainGroup={mg}
            summary={summary}
            panelSubgroups={panelSubgroups}
            onAddSubgroup={() => onAddSubgroup(mg)}
            onAddStatus={() => onAddStatus(mg)}
            onEditStatus={onEditStatus}
            onDeleteStatus={onDeleteStatus}
          />
        ))}
      </div>
    </section>
  );
}

function GroupTile({
  mainGroup,
  summary,
  panelSubgroups,
  onAddSubgroup,
  onAddStatus,
  onEditStatus,
  onDeleteStatus,
}: {
  mainGroup: ReturnUiMainGroup;
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  onAddSubgroup: () => void;
  onAddStatus: () => void;
  onEditStatus: (s: ReturnUiStatusWithCount) => void;
  onDeleteStatus: (id: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const subgroups = useMemo(
    () => panelSubgroups.filter((s) => s.main_group === mainGroup).sort((a, b) => a.sort_order - b.sort_order),
    [panelSubgroups, mainGroup],
  );
  const statuses = summary?.groups.find((g) => g.main_group === mainGroup)?.sub_statuses ?? [];
  const subgroupCount = subgroups.length;

  return (
    <article className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RETURN_MAIN_GROUP_DOT[mainGroup]}`} aria-hidden />
            <h4 className="font-semibold text-slate-900">{RETURN_MAIN_GROUP_LABELS[mainGroup]}</h4>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {subgroupCount} {subgroupCount === 1 ? "podgrupa" : subgroupCount < 5 ? "podgrupy" : "podgrup"}
            {statuses.length ? ` · ${statuses.length} statusów` : null}
          </p>
        </div>
      </div>

      <div className="mt-3 flex min-h-[2rem] flex-wrap gap-1.5">
        {subgroups.length ? (
          subgroups.map((sg) => (
            <span
              key={sg.id}
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${RETURN_MAIN_GROUP_CHIP[mainGroup]}`}
            >
              {sg.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">Brak podgrup — dodaj pierwszą</span>
        )}
      </div>

      {statuses.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-200/60 pt-3">
          {statuses.slice(0, 4).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <button type="button" className="min-w-0 truncate text-left hover:text-slate-900 hover:underline" onClick={() => onEditStatus(s)}>
                {s.name}
              </button>
              {s.is_active === false ? <span className="shrink-0 text-slate-400">wył.</span> : null}
            </li>
          ))}
          {statuses.length > 4 ? <li className="text-xs text-slate-400">+ {statuses.length - 4} więcej</li> : null}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => {
            if (statuses.length > 0) onEditStatus(statuses[0]);
            else onAddStatus();
          }}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Edytuj
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            aria-label="Więcej akcji"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenuOpen(false); onAddStatus(); }}>
                  Dodaj status
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenuOpen(false); onAddSubgroup(); }}>
                  Dodaj podgrupę
                </button>
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={() => { setMenuOpen(false); void onDeleteStatus(s.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Usuń „{s.name}”
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
