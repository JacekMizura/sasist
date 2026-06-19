import { Pencil, Plus } from "lucide-react";

import type { ReturnUiMainGroup, ReturnUiPanelSubgroupRead, ReturnUiStatusPanelSummary, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { partitionStatusesBySubgroupForSettings } from "../../../utils/panelUiStatusSettingsTree";
import { LIST_LABEL_CARD_TITLE, RETURN_MAIN_GROUP_DOT, RETURN_MAIN_GROUP_ORDER } from "./constants";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";

type Props = {
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  onAddSubgroup: (mainGroup: ReturnUiMainGroup) => void;
  onAddStatus: (mainGroup: ReturnUiMainGroup) => void;
  onEditStatus: (status: ReturnUiStatusWithCount) => void;
};

export function ListLabelsSection({ summary, panelSubgroups, onAddSubgroup, onAddStatus, onEditStatus }: Props) {
  return (
    <ConfiguratorSectionShell
      id="etykiety-listy"
      eyebrow=""
      title="Etykiety listy"
      description="Jak grupujesz zwroty w panelu biurowym (Nowe / W toku / Zakończone) — to nie jest status magazynowy ani decyzja produktowa."
      action={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => onAddSubgroup("NEW")}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Dodaj podgrupę
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {RETURN_MAIN_GROUP_ORDER.map((mg) => (
          <ListLabelGroupCard
            key={mg}
            mainGroup={mg}
            summary={summary}
            panelSubgroups={panelSubgroups}
            onAddStatus={() => onAddStatus(mg)}
            onEditStatus={onEditStatus}
          />
        ))}
      </div>
    </ConfiguratorSectionShell>
  );
}

function ListLabelGroupCard({
  mainGroup,
  summary,
  panelSubgroups,
  onAddStatus,
  onEditStatus,
}: {
  mainGroup: ReturnUiMainGroup;
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  onAddStatus: () => void;
  onEditStatus: (status: ReturnUiStatusWithCount) => void;
}) {
  const block = summary?.groups.find((g) => g.main_group === mainGroup);
  const statuses = block?.sub_statuses ?? [];
  const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(statuses);
  const subgroupsInGroup = panelSubgroups.filter((s) => s.main_group === mainGroup).sort((a, b) => a.sort_order - b.sort_order);

  const subgroupNamesWithStatuses = new Set(subgroupBuckets.map((b) => b.subgroupKey));
  const emptySubgroups = subgroupsInGroup.filter((sg) => !subgroupNamesWithStatuses.has(sg.name));

  return (
    <article className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/30">
      <header className="border-b border-slate-200/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RETURN_MAIN_GROUP_DOT[mainGroup]}`} aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800">{LIST_LABEL_CARD_TITLE[mainGroup]}</h3>
        </div>
        {block?.total_count != null ? (
          <p className="mt-1 text-xs text-slate-500">{block.total_count} zwrotów na liście</p>
        ) : null}
      </header>

      <div className="min-h-[8rem] flex-1 space-y-4 px-4 py-4">
        {subgroupBuckets.map((bucket) => (
          <div key={bucket.subgroupKey}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bucket.subgroupKey}</p>
            <ul className="mt-2 space-y-1.5">
              {bucket.rows.map((s) => (
                <StatusLabelRow key={s.id} status={s} onEdit={() => onEditStatus(s)} />
              ))}
            </ul>
          </div>
        ))}

        {emptySubgroups.map((sg) => (
          <div key={sg.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sg.name}</p>
            <p className="mt-2 text-xs italic text-slate-400">Brak etykiet w tej podgrupie</p>
          </div>
        ))}

        {ungrouped.length > 0 ? (
          <div>
            {subgroupBuckets.length > 0 ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bez podgrupy</p>
            ) : null}
            <ul className={`space-y-1.5 ${subgroupBuckets.length > 0 ? "mt-2" : ""}`}>
              {ungrouped.map((s) => (
                <StatusLabelRow key={s.id} status={s} onEdit={() => onEditStatus(s)} />
              ))}
            </ul>
          </div>
        ) : null}

        {statuses.length === 0 && subgroupsInGroup.length === 0 ? (
          <p className="text-sm text-slate-400">Brak etykiet — dodaj pierwszą.</p>
        ) : null}
      </div>

      <footer className="border-t border-slate-200/60 px-4 py-3">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          onClick={onAddStatus}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Dodaj etykietę
        </button>
      </footer>
    </article>
  );
}

function StatusLabelRow({ status, onEdit }: { status: ReturnUiStatusWithCount; onEdit: () => void }) {
  const dot = status.badge_color?.startsWith("#") ? status.badge_color : status.color?.startsWith("#") ? status.color : "#94a3b8";
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2">
      <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: dot }} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${status.is_active === false ? "text-slate-400 line-through" : "text-slate-900"}`}>
        {status.name}
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
        {status.count}
      </span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
        Edytuj
      </button>
    </li>
  );
}
