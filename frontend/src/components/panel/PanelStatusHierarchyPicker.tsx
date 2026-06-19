import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { PanelSubgroupLineHeader } from "./PanelSubgroupLineHeader";
import {
  PANEL_TREE_CHILDREN_CLASS,
  PANEL_TREE_GROUP_BAR_CLASS,
  PANEL_TREE_GROUP_SECTION_CLASS,
  PANEL_TREE_PICKER_GROUP_HEAD_CLASS,
  PANEL_TREE_STATUS_BAR_ACTIVE_CLASS,
  PANEL_TREE_STATUS_BAR_CLASS,
  PANEL_TREE_STATUS_BAR_IDLE_CLASS,
  PANEL_TREE_STATUS_ROW_ACTIVE_CLASS,
  PANEL_TREE_STATUS_ROW_CLASS,
  PANEL_TREE_STATUS_ROW_IDLE_CLASS,
  PANEL_TREE_SUBGROUP_CHILDREN_CLASS,
  panelTreeGroupAccentClass,
} from "./panelStatusTreeStyles";
import { getPanelStatusWmsMarkers } from "../orders/panelStatusWmsChips";
import { ORDERS_PANEL_GROUP_LABELS } from "../orders/OrdersPanelStatusSidebar";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { sidebarSubStatusHex } from "../../utils/panelSidebarHierarchy";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";

export type PanelStatusHierarchyPickerProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  /** Podświetlenie aktualnie wybranego statusu (np. w modalu). */
  selectedStatusId?: number | null;
  disabled?: boolean;
  showClearOption?: boolean;
  clearLabel?: string;
  /** Wywołane po wyborze statusu; `null` = wyczyść etykietę. */
  onPick: (statusId: number | null) => void;
  className?: string;
  listMaxHeightClass?: string;
};

function normalizeSearchQuery(q: string): string {
  return q.trim().toLowerCase();
}

function statusMatchesSearch(name: string, query: string): boolean {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

function groupMatchesSearch(groupLabel: string, query: string): boolean {
  if (!query) return true;
  return groupLabel.toLowerCase().includes(query);
}

function subgroupMatchesSearch(title: string, query: string): boolean {
  if (!query) return true;
  return title.toLowerCase().includes(query);
}

function StatusPickRow({
  status,
  mainGroup,
  selected,
  disabled,
  onPick,
}: {
  status: OrderUiStatusWithCount;
  mainGroup: OrderUiMainGroup;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const stripeColor = sidebarSubStatusHex(status.badge_color ?? status.color, mainGroup);
  const markers = getPanelStatusWmsMarkers(status, mainGroup);

  return (
    <button
      type="button"
      disabled={disabled}
      className={`${PANEL_TREE_STATUS_ROW_CLASS} ${
        selected ? PANEL_TREE_STATUS_ROW_ACTIVE_CLASS : PANEL_TREE_STATUS_ROW_IDLE_CLASS
      } disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={onPick}
    >
      <span
        className={`${PANEL_TREE_STATUS_BAR_CLASS} ${
          selected ? PANEL_TREE_STATUS_BAR_ACTIVE_CLASS : PANEL_TREE_STATUS_BAR_IDLE_CLASS
        }`}
        style={{ backgroundColor: stripeColor }}
        aria-hidden
      />
      {selected ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-slate-600" strokeWidth={2.5} aria-hidden />
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden />
      )}
      {status.image_url ? (
        <img src={status.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{status.name}</span>
      {markers.length > 0 ? (
        <span className="flex shrink-0 items-center gap-0.5">
          {markers.map((m) => {
            const MIcon = m.Icon;
            return (
              <span key={m.id} title={m.title} className="inline-flex text-slate-400">
                <MIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Hierarchiczna lista statusów panelu (grupa → podgrupa → status) ze sticky wyszukiwarką.
 */
export function PanelStatusHierarchyPicker({
  panelSummary,
  panelSubgroups,
  selectedStatusId,
  disabled = false,
  showClearOption = true,
  clearLabel = "Bez etykiety (wyczyść)",
  onPick,
  className = "",
  listMaxHeightClass = "max-h-[min(60vh,22rem)]",
}: PanelStatusHierarchyPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = normalizeSearchQuery(searchQuery);
  const sgDefs = panelSubgroups ?? [];

  const [openSubgroups, setOpenSubgroups] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => {
    return MAIN_PANEL_GROUP_ORDER.map((mg) => {
      const block = panelSummary?.groups.find((g) => g.main_group === mg);
      if (!block) return null;
      const groupLabel = ORDERS_PANEL_GROUP_LABELS[block.main_group];
      const layout = buildPanelSidebarLayout(block.main_group, block.sub_statuses, sgDefs);

      const filteredUngrouped = layout.ungrouped.filter((s) => {
        if (groupMatchesSearch(groupLabel, normalizedSearch)) return true;
        return statusMatchesSearch(s.name ?? "", normalizedSearch);
      });

      const filteredSections = layout.subgroupSections
        .map((sec) => {
          const subgroupHit = subgroupMatchesSearch(sec.title, normalizedSearch);
          const rows = sec.rows.filter((s) => {
            if (subgroupHit || groupMatchesSearch(groupLabel, normalizedSearch)) return true;
            return statusMatchesSearch(s.name ?? "", normalizedSearch);
          });
          return { ...sec, rows };
        })
        .filter((sec) => sec.rows.length > 0);

      const hasContent = filteredUngrouped.length > 0 || filteredSections.length > 0;
      if (normalizedSearch && !hasContent && !groupMatchesSearch(groupLabel, normalizedSearch)) {
        return null;
      }

      return { block, groupLabel, filteredUngrouped, filteredSections };
    }).filter((x): x is NonNullable<typeof x> => x != null);
  }, [panelSummary?.groups, normalizedSearch, sgDefs]);

  const toggleSubgroup = (key: string) => {
    if (normalizedSearch) return;
    setOpenSubgroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const isSubgroupOpen = (key: string) => normalizedSearch || (openSubgroups[key] ?? true);

  const nothingFound =
    normalizedSearch.length > 0 &&
    sections.every((s) => s.filteredUngrouped.length === 0 && s.filteredSections.length === 0);

  const selectedStatusInfo = useMemo(() => {
    if (selectedStatusId == null || typeof selectedStatusId !== "number") return null;
    for (const block of panelSummary?.groups ?? []) {
      const hit = block.sub_statuses.find((s) => s.id === selectedStatusId);
      if (hit) return { status: hit, mainGroup: block.main_group };
    }
    return null;
  }, [panelSummary?.groups, selectedStatusId]);

  const selectedVisibleWhenFiltered = useMemo(() => {
    if (!selectedStatusInfo || !normalizedSearch) return true;
    const { status, mainGroup } = selectedStatusInfo;
    const groupLabel = ORDERS_PANEL_GROUP_LABELS[mainGroup];
    if (groupMatchesSearch(groupLabel, normalizedSearch)) return true;
    const layout = buildPanelSidebarLayout(
      mainGroup,
      panelSummary!.groups.find((g) => g.main_group === mainGroup)!.sub_statuses,
      sgDefs,
    );
    const inUngrouped = layout.ungrouped.some((s) => s.id === status.id);
    if (inUngrouped && statusMatchesSearch(status.name ?? "", normalizedSearch)) return true;
    for (const sec of layout.subgroupSections) {
      if (!sec.rows.some((s) => s.id === status.id)) continue;
      if (subgroupMatchesSearch(sec.title, normalizedSearch)) return true;
      if (statusMatchesSearch(status.name ?? "", normalizedSearch)) return true;
    }
    return false;
  }, [normalizedSearch, selectedStatusInfo, panelSummary, sgDefs]);

  return (
    <div className={`flex min-h-0 flex-col px-2 ${className}`}>
      <div className="sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white pb-2 pt-0.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj statusu…"
            aria-label="Szukaj statusu"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
          />
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-1 ${listMaxHeightClass}`}>
        {showClearOption ? (
          <button
            type="button"
            disabled={disabled}
            className={`${PANEL_TREE_STATUS_ROW_CLASS} mb-1 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
              selectedStatusId === null ? PANEL_TREE_STATUS_ROW_ACTIVE_CLASS : ""
            }`}
            onClick={() => onPick(null)}
          >
            {selectedStatusId === null ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-slate-600" strokeWidth={2.5} aria-hidden />
            ) : (
              <span className="w-3.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
          </button>
        ) : null}

        {selectedStatusInfo && normalizedSearch && !selectedVisibleWhenFiltered ? (
          <div className="mb-2 border-b border-slate-100 pb-2">
            <div className="px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Wybrany</div>
            <StatusPickRow
              status={selectedStatusInfo.status}
              mainGroup={selectedStatusInfo.mainGroup}
              selected
              disabled={disabled}
              onPick={() => onPick(selectedStatusInfo.status.id)}
            />
          </div>
        ) : null}

        {nothingFound ? (
          <p className="px-2 py-3 text-xs text-slate-500">Brak statusów pasujących do wyszukiwania.</p>
        ) : (
          sections.map(({ block, groupLabel, filteredUngrouped, filteredSections }, idx) => (
            <section key={block.main_group} className={idx > 0 ? `${PANEL_TREE_GROUP_SECTION_CLASS} border-t border-slate-100` : ""}>
              <div className={`${PANEL_TREE_PICKER_GROUP_HEAD_CLASS} relative`}>
                <span
                  className={`${PANEL_TREE_GROUP_BAR_CLASS} ${panelTreeGroupAccentClass(block.main_group)}`}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{groupLabel}</span>
              </div>
              <div className={PANEL_TREE_CHILDREN_CLASS}>
                {filteredUngrouped.map((s) => (
                  <StatusPickRow
                    key={s.id}
                    status={s}
                    mainGroup={block.main_group}
                    selected={selectedStatusId === s.id}
                    disabled={disabled}
                    onPick={() => onPick(s.id)}
                  />
                ))}
                {filteredSections.map((sec) => {
                  const open = isSubgroupOpen(sec.key);
                  return (
                    <div key={sec.key} className="pt-0.5">
                      <PanelSubgroupLineHeader
                        title={sec.title}
                        expanded={open}
                        onToggle={() => toggleSubgroup(sec.key)}
                        showCount={false}
                      />
                      {open ? (
                        <div className={PANEL_TREE_SUBGROUP_CHILDREN_CLASS}>
                          {sec.rows.map((s) => (
                            <StatusPickRow
                              key={s.id}
                              status={s}
                              mainGroup={block.main_group}
                              selected={selectedStatusId === s.id}
                              disabled={disabled}
                              onPick={() => onPick(s.id)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
