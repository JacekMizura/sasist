import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Search } from "lucide-react";

import { PanelStatusWmsIconColumn } from "../../panel/PanelStatusWmsIconColumn";
import { panelTreeStatusBarClass } from "../../panel/panelStatusTreeStyles";
import { getPanelStatusWmsMarkers } from "../panelStatusWmsChips";
import { ORDERS_PANEL_GROUP_LABELS } from "../OrdersPanelStatusSidebar";
import { buildPanelSidebarLayout } from "../../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../../utils/orderPanelMainGroupOrder";
import { sidebarSubStatusHex } from "../../../utils/panelSidebarHierarchy";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../../types/orderUiStatus";

export type AutomationStatusPickerProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  selectedStatusIds?: readonly number[];
  onSelectedIdsChange?: (ids: number[]) => void;
  selectedStatusId?: number | null;
  onPick?: (statusId: number | null) => void;
  /** Single-select only: show a clear row (e.g. „— brak —”). */
  allowClear?: boolean;
  clearLabel?: string;
  focusStatusId?: number | null;
  onFocusStatusHandled?: () => void;
  className?: string;
  listMaxHeightClass?: string;
};

function statusMatchesSearch(name: string, query: string): boolean {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

type FlatHit = {
  status: OrderUiStatusWithCount;
  mainGroup: OrderUiMainGroup;
  groupLabel: string;
};

function StatusRow({
  status,
  mainGroup,
  selected,
  highlighted,
  rowRef,
  onPick,
}: {
  status: OrderUiStatusWithCount;
  mainGroup: OrderUiMainGroup;
  selected: boolean;
  highlighted: boolean;
  rowRef?: (el: HTMLButtonElement | null) => void;
  onPick: () => void;
}) {
  const stripeColor = sidebarSubStatusHex(status.badge_color ?? status.color, mainGroup);
  const markers = getPanelStatusWmsMarkers(status, mainGroup);

  return (
    <button
      ref={rowRef}
      type="button"
      id={`auto-st-${status.id}`}
      aria-pressed={selected}
      className={`flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
        selected
          ? "border-orange-200 bg-orange-50 font-medium text-slate-900"
          : "border-transparent font-normal text-slate-700 hover:bg-slate-50"
      } ${highlighted ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
      onClick={onPick}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          selected ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"
        }`}
        aria-hidden
      >
        {selected ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
      <PanelStatusWmsIconColumn markers={markers} />
      <span className={panelTreeStatusBarClass(selected)} style={{ backgroundColor: stripeColor }} aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">{status.name}</span>
      {status.image_url ? (
        <img src={status.image_url} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded object-contain" />
      ) : null}
    </button>
  );
}

const EMPTY_IDS: readonly number[] = [];

export function AutomationStatusPicker({
  panelSummary,
  panelSubgroups,
  selectedStatusIds,
  onSelectedIdsChange,
  selectedStatusId,
  onPick,
  allowClear = false,
  clearLabel = "— brak —",
  focusStatusId = null,
  onFocusStatusHandled,
  className = "",
  listMaxHeightClass = "max-h-52",
}: AutomationStatusPickerProps) {
  const multi = typeof onSelectedIdsChange === "function";
  const selectedIds = selectedStatusIds ?? EMPTY_IDS;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const openGroupsBeforeSearch = useRef<Record<string, boolean> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [flashId, setFlashId] = useState<number | null>(null);

  const groupBlocks = useMemo(() => {
    const sgDefs = panelSubgroups ?? [];
    return MAIN_PANEL_GROUP_ORDER.map((mg) => {
      const block = panelSummary?.groups.find((g) => g.main_group === mg);
      if (!block) return null;
      const groupLabel = ORDERS_PANEL_GROUP_LABELS[block.main_group];
      const layout = buildPanelSidebarLayout(block.main_group, block.sub_statuses, sgDefs);
      return { block, groupLabel, layout };
    }).filter((x): x is NonNullable<typeof x> => x != null);
  }, [panelSummary?.groups, panelSubgroups]);

  const searchHits = useMemo((): FlatHit[] => {
    if (!normalizedSearch) return [];
    const out: FlatHit[] = [];
    for (const { block, groupLabel, layout } of groupBlocks) {
      const push = (s: OrderUiStatusWithCount) => {
        if (statusMatchesSearch(s.name ?? "", normalizedSearch)) {
          out.push({ status: s, mainGroup: block.main_group, groupLabel });
        }
      };
      layout.ungrouped.forEach(push);
      for (const sec of layout.subgroupSections) {
        if (sec.title.toLowerCase().includes(normalizedSearch)) {
          sec.rows.forEach((s) => out.push({ status: s, mainGroup: block.main_group, groupLabel }));
        } else {
          sec.rows.forEach(push);
        }
      }
    }
    return out;
  }, [groupBlocks, normalizedSearch]);

  const setSearch = (next: string) => {
    const prev = searchQuery.trim();
    const trimmed = next.trim();
    if (!prev && trimmed) {
      openGroupsBeforeSearch.current = { ...openGroups };
    }
    if (prev && !trimmed) {
      setOpenGroups(openGroupsBeforeSearch.current ?? {});
      openGroupsBeforeSearch.current = null;
    }
    setSearchQuery(next);
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isGroupOpen = (key: string) => Boolean(openGroups[key]);

  const isSelected = (id: number) => (multi ? selectedIdSet.has(id) : selectedStatusId === id);

  const activate = (id: number) => {
    if (multi) {
      const next = selectedIdSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
      onSelectedIdsChange!(next);
      return;
    }
    onPick?.(id);
  };

  useEffect(() => {
    if (focusStatusId == null || !panelSummary) return;
    let mainGroup: OrderUiMainGroup | null = null;
    for (const block of panelSummary.groups) {
      if (block.sub_statuses.some((s) => s.id === focusStatusId)) {
        mainGroup = block.main_group;
        break;
      }
    }
    if (mainGroup) {
      setOpenGroups((prev) => ({ ...prev, [mainGroup!]: true }));
      if (normalizedSearch) {
        setSearchQuery("");
        openGroupsBeforeSearch.current = null;
      }
    }
    const t = window.setTimeout(() => {
      rowRefs.current.get(focusStatusId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setFlashId(focusStatusId);
      onFocusStatusHandled?.();
    }, 40);
    const t2 = window.setTimeout(() => setFlashId(null), 280);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to focusStatusId pulses
  }, [focusStatusId]);

  const bindRow = (id: number) => (el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  return (
    <div className={`flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="shrink-0 border-b border-slate-100 p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj statusu…"
            aria-label="Szukaj statusu"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 py-0 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200"
          />
        </div>
      </div>

      <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5 ${listMaxHeightClass}`}>
        {!multi && allowClear && !normalizedSearch ? (
          <button
            type="button"
            className={`mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
              selectedStatusId == null
                ? "border-orange-200 bg-orange-50 font-medium text-slate-900"
                : "border-transparent font-normal text-slate-600 hover:bg-slate-50"
            }`}
            aria-pressed={selectedStatusId == null}
            onClick={() => onPick?.(null)}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                selectedStatusId == null ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"
              }`}
              aria-hidden
            >
              {selectedStatusId == null ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{clearLabel}</span>
          </button>
        ) : null}
        {normalizedSearch ? (
          searchHits.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">Brak statusów pasujących do wyszukiwania.</p>
          ) : (
            <ul className="space-y-0.5">
              {searchHits.map(({ status, mainGroup, groupLabel }) => (
                <li key={status.id}>
                  <StatusRow
                    status={status}
                    mainGroup={mainGroup}
                    selected={isSelected(status.id)}
                    highlighted={flashId === status.id}
                    rowRef={bindRow(status.id)}
                    onPick={() => activate(status.id)}
                  />
                  <p className="px-2 pb-1 text-[10px] text-slate-400">{groupLabel}</p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-1">
            {groupBlocks.map(({ block, groupLabel, layout }) => {
              const key = block.main_group;
              const open = isGroupOpen(key);
              const statusCount =
                layout.ungrouped.length + layout.subgroupSections.reduce((n, s) => n + s.rows.length, 0);
              if (statusCount === 0) return null;
              return (
                <li key={key} className="rounded-md bg-slate-50/80">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left hover:bg-slate-100/80"
                    aria-expanded={open}
                    onClick={() => toggleGroup(key)}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-150 ${
                        open ? "rotate-90" : ""
                      }`}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {groupLabel}
                    </span>
                  </button>
                  {open ? (
                    <div className="space-y-0.5 bg-white px-1.5 pb-1.5 pt-0.5">
                      {layout.ungrouped.map((s) => (
                        <StatusRow
                          key={s.id}
                          status={s}
                          mainGroup={block.main_group}
                          selected={isSelected(s.id)}
                          highlighted={flashId === s.id}
                          rowRef={bindRow(s.id)}
                          onPick={() => activate(s.id)}
                        />
                      ))}
                      {layout.subgroupSections.map((sec) => (
                        <div key={sec.key} className="pt-0.5">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {sec.title}
                          </p>
                          {sec.rows.map((s) => (
                            <StatusRow
                              key={s.id}
                              status={s}
                              mainGroup={block.main_group}
                              selected={isSelected(s.id)}
                              highlighted={flashId === s.id}
                              rowRef={bindRow(s.id)}
                              onPick={() => activate(s.id)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
