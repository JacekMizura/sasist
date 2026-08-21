import { Plus } from "lucide-react";

import type { StatusActionOverviewEffectDto } from "../../../api/automationsApi";
import { FlatColumnHeader } from "../../../components/layout/FlatPageSection";
import { StatusActionsMatrix } from "../../../components/settings/statusActionsMatrix/StatusActionsMatrix";
import type { ReturnUiMainGroup, ReturnUiPanelSubgroupRead, ReturnUiStatusPanelSummary, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { partitionStatusesBySubgroupForSettings } from "../../../utils/panelUiStatusSettingsTree";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { LIST_LABEL_CARD_TITLE, RETURN_MAIN_GROUP_ORDER } from "./constants";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";

type Props = {
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  actionsByStatusId?: Record<string, Record<string, StatusActionOverviewEffectDto>>;
  warehouseId: number;
  onAddSubgroup: (mainGroup: ReturnUiMainGroup) => void;
  onAddStatus: (mainGroup: ReturnUiMainGroup) => void;
  onEditStatus: (status: ReturnUiStatusWithCount) => void;
  onDeleteStatus?: (id: number) => void;
  onActionsOverviewChanged: () => void | Promise<void>;
};

export function ListLabelsSection({
  summary,
  panelSubgroups,
  actionsByStatusId = {},
  warehouseId,
  onAddSubgroup,
  onAddStatus,
  onEditStatus,
  onDeleteStatus,
  onActionsOverviewChanged,
}: Props) {
  const findStatus = (id: number): ReturnUiStatusWithCount | undefined =>
    (summary?.groups ?? []).flatMap((g) => g.sub_statuses ?? []).find((s) => s.id === id);

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
      <div className="space-y-10">
        {RETURN_MAIN_GROUP_ORDER.map((mg) => (
          <ListLabelGroupBlock
            key={mg}
            mainGroup={mg}
            summary={summary}
            panelSubgroups={panelSubgroups}
            actionsByStatusId={actionsByStatusId}
            warehouseId={warehouseId}
            onAddStatus={() => onAddStatus(mg)}
            onEditStatusId={(id) => {
              const s = findStatus(id);
              if (s) onEditStatus(s);
            }}
            onDeleteStatus={onDeleteStatus}
            onActionsOverviewChanged={onActionsOverviewChanged}
          />
        ))}
      </div>
    </ConfiguratorSectionShell>
  );
}

function ListLabelGroupBlock({
  mainGroup,
  summary,
  panelSubgroups,
  actionsByStatusId,
  warehouseId,
  onAddStatus,
  onEditStatusId,
  onDeleteStatus,
  onActionsOverviewChanged,
}: {
  mainGroup: ReturnUiMainGroup;
  summary: ReturnUiStatusPanelSummary | null;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  actionsByStatusId: Record<string, Record<string, StatusActionOverviewEffectDto>>;
  warehouseId: number;
  onAddStatus: () => void;
  onEditStatusId: (id: number) => void;
  onDeleteStatus?: (id: number) => void;
  onActionsOverviewChanged: () => void | Promise<void>;
}) {
  const block = summary?.groups.find((g) => g.main_group === mainGroup);
  const statuses = block?.sub_statuses ?? [];
  const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(statuses);
  const subgroupsInGroup = panelSubgroups
    .filter((s) => s.main_group === mainGroup)
    .sort((a, b) => a.sort_order - b.sort_order);
  const subgroupNamesWithStatuses = new Set(subgroupBuckets.map((b) => b.subgroupKey));
  const emptySubgroups = subgroupsInGroup.filter((sg) => !subgroupNamesWithStatuses.has(sg.name));

  return (
    <section className="space-y-4">
      <FlatColumnHeader
        title={LIST_LABEL_CARD_TITLE[mainGroup]}
        action={
          block?.total_count != null ? (
            <span className="text-xs tabular-nums text-slate-400">{block.total_count}</span>
          ) : null
        }
      />

      {subgroupBuckets.map((bucket) => (
        <div key={bucket.subgroupKey} className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">{bucket.subgroupKey}</p>
          <StatusActionsMatrix
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouseId}
            entityType="RETURN"
            statuses={bucket.rows}
            actionsByStatusId={actionsByStatusId}
            onEditStatus={onEditStatusId}
            onDeleteStatus={onDeleteStatus}
            onOverviewChanged={onActionsOverviewChanged}
          />
        </div>
      ))}

      {emptySubgroups.map((sg) => (
        <div key={sg.id} className="space-y-1">
          <p className="text-xs font-semibold text-slate-500">{sg.name}</p>
          <p className="text-xs italic text-slate-400">Brak etykiet</p>
        </div>
      ))}

      {ungrouped.length > 0 ? (
        <div className="space-y-2">
          {subgroupBuckets.length > 0 ? (
            <p className="text-xs font-semibold text-slate-500">Bez podgrupy</p>
          ) : null}
          <StatusActionsMatrix
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouseId}
            entityType="RETURN"
            statuses={ungrouped}
            actionsByStatusId={actionsByStatusId}
            onEditStatus={onEditStatusId}
            onDeleteStatus={onDeleteStatus}
            onOverviewChanged={onActionsOverviewChanged}
          />
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
    </section>
  );
}
