import type { PanelSidebarMainGroup } from "../../utils/panelSidebarHierarchy";
import { partitionStatusesBySubgroupForSettings } from "../../utils/panelUiStatusSettingsTree";

export type PanelStatusStructureTreeStatus = {
  id?: number;
  name: string;
  main_group: PanelSidebarMainGroup;
  subgroup_name?: string | null;
  is_active?: boolean;
};

export type PanelStatusStructureTreeGroup = {
  main_group: PanelSidebarMainGroup;
  sub_statuses: PanelStatusStructureTreeStatus[];
};

type Props = {
  groups: PanelStatusStructureTreeGroup[];
  mainGroupLabels: Record<PanelSidebarMainGroup, string>;
  mainGroupOrder: PanelSidebarMainGroup[];
  /** Podświetl istniejący status po ID. */
  highlightStatusId?: number | null;
  /** Podświetl szkic (tryb tworzenia). */
  highlightDraft?: {
    name: string;
    main_group: PanelSidebarMainGroup;
    subgroup_name?: string | null;
  } | null;
  className?: string;
};

function isHighlighted(
  row: PanelStatusStructureTreeStatus,
  highlightStatusId?: number | null,
  highlightDraft?: Props["highlightDraft"],
): boolean {
  if (highlightStatusId != null && row.id === highlightStatusId) return true;
  if (!highlightDraft) return false;
  const draftName = highlightDraft.name.trim().toLowerCase();
  const rowName = row.name.trim().toLowerCase();
  if (!draftName || draftName !== rowName) return false;
  if (row.main_group !== highlightDraft.main_group) return false;
  const draftSub = (highlightDraft.subgroup_name ?? "").trim();
  const rowSub = (row.subgroup_name ?? "").trim();
  return draftSub === rowSub;
}

export function PanelStatusStructureTree({
  groups,
  mainGroupLabels,
  mainGroupOrder,
  highlightStatusId,
  highlightDraft,
  className,
}: Props) {
  const blocksByGroup = new Map(mainGroupOrder.map((g) => [g, groups.find((b) => b.main_group === g)]));

  const draftInTree =
    highlightDraft?.name.trim() &&
    highlightStatusId == null &&
    !groups.some((b) =>
      b.sub_statuses.some((s) => isHighlighted(s, null, highlightDraft)),
    );

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Struktura panelu</p>
      <div className="rounded-lg border border-slate-200/90 bg-white p-3">
        <ul className="space-y-3 text-sm">
          {mainGroupOrder.map((mg) => {
            const block = blocksByGroup.get(mg);
            const statuses = (block?.sub_statuses ?? []).filter((s) => s.is_active !== false);
            const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(statuses);
            const showDraftHere = draftInTree && highlightDraft?.main_group === mg;

            return (
              <li key={mg}>
                <p className="font-semibold text-slate-800">{mainGroupLabels[mg]}</p>
                <ul className="mt-1 space-y-0.5 pl-3 text-slate-600">
                  {subgroupBuckets.map((bucket) => (
                    <li key={bucket.key}>
                      <p className="text-xs font-medium text-slate-400">{bucket.title}</p>
                      <ul className="mt-0.5 space-y-0.5 pl-3">
                        {bucket.rows.map((row) => {
                          const active = isHighlighted(row, highlightStatusId, highlightDraft);
                          return (
                            <li
                              key={row.id ?? `${row.name}-${bucket.key}`}
                              className={`truncate ${active ? "rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-900 ring-1 ring-sky-200/80" : ""}`}
                            >
                              └ {row.name}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                  {ungrouped.map((row) => {
                    const active = isHighlighted(row, highlightStatusId, highlightDraft);
                    return (
                      <li
                        key={row.id ?? row.name}
                        className={`truncate ${active ? "rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-900 ring-1 ring-sky-200/80" : ""}`}
                      >
                        └ {row.name}
                      </li>
                    );
                  })}
                  {showDraftHere ? (
                    <li className="truncate rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-900 ring-1 ring-sky-200/80">
                      └ {highlightDraft!.name.trim()}
                      {(highlightDraft!.subgroup_name ?? "").trim() ? (
                        <span className="ml-1 text-xs font-normal text-sky-700/80">
                          ({highlightDraft!.subgroup_name!.trim()})
                        </span>
                      ) : null}
                    </li>
                  ) : null}
                  {statuses.length === 0 && !showDraftHere ? (
                    <li className="text-xs italic text-slate-400">Brak statusów</li>
                  ) : null}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
