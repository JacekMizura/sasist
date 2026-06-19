import { Pencil, Plus } from "lucide-react";

import { FlatColumnHeader } from "../../../components/layout/FlatPageSection";
import type { ReturnUiMainGroup, ReturnUiPanelSubgroupRead, ReturnUiStatusPanelSummary, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { partitionStatusesBySubgroupForSettings } from "../../../utils/panelUiStatusSettingsTree";
import { LIST_LABEL_CARD_TITLE, RETURN_MAIN_GROUP_ORDER } from "./constants";
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
      title="Etykiety listy"
      action={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
          onClick={() => onAddSubgroup("NEW")}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Dodaj podgrupę
        </button>
      }
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {RETURN_MAIN_GROUP_ORDER.map((mg) => (
          <ListLabelGroupColumn
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

function ListLabelGroupColumn({
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
    <div className="space-y-4">
      <FlatColumnHeader
        title={LIST_LABEL_CARD_TITLE[mainGroup]}
        action={
          block?.total_count != null ? (
            <span className="text-xs tabular-nums text-slate-400">{block.total_count}</span>
          ) : null
        }
      />

      <div className="space-y-4 pt-1">
      {subgroupBuckets.map((bucket) => (
        <div key={bucket.subgroupKey}>
          <p className="text-xs font-semibold text-slate-500">{bucket.subgroupKey}</p>
          <ul className="mt-1.5 space-y-1">
            {bucket.rows.map((s) => (
              <StatusLabelRow key={s.id} status={s} onEdit={() => onEditStatus(s)} />
            ))}
          </ul>
        </div>
      ))}

      {emptySubgroups.map((sg) => (
        <div key={sg.id}>
          <p className="text-xs font-semibold text-slate-500">{sg.name}</p>
          <p className="mt-1 text-xs italic text-slate-400">Brak etykiet</p>
        </div>
      ))}

      {ungrouped.length > 0 ? (
        <div>
          {subgroupBuckets.length > 0 ? <p className="text-xs font-semibold text-slate-500">Bez podgrupy</p> : null}
          <ul className={`space-y-1 ${subgroupBuckets.length > 0 ? "mt-1.5" : ""}`}>
            {ungrouped.map((s) => (
              <StatusLabelRow key={s.id} status={s} onEdit={() => onEditStatus(s)} />
            ))}
          </ul>
        </div>
      ) : null}

      {statuses.length === 0 && subgroupsInGroup.length === 0 ? (
        <p className="text-sm text-slate-400">Brak etykiet</p>
      ) : null}

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        onClick={onAddStatus}
      >
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        Dodaj etykietę
      </button>
      </div>
    </div>
  );
}

function StatusLabelRow({ status, onEdit }: { status: ReturnUiStatusWithCount; onEdit: () => void }) {
  const dot = status.badge_color?.startsWith("#") ? status.badge_color : status.color?.startsWith("#") ? status.color : "#94a3b8";
  return (
    <li className="group flex items-center gap-2 rounded-md py-1.5 hover:bg-slate-50">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-sm ${status.is_active === false ? "text-slate-400 line-through" : "text-slate-800"}`}>
        {status.name}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-slate-400">{status.count}</span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 opacity-0 hover:text-slate-800 group-hover:opacity-100"
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
        Edytuj
      </button>
    </li>
  );
}
