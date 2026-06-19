import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";
import { getPanelStatusWmsMarkers, panelStatusCollapsedTitle } from "./panelStatusWmsChips";
import { PanelSidebarSubgroupCollapsible } from "../panel/PanelSidebarSubgroupCollapsible";
import {
  PANEL_TREE_CHILDREN_CLASS,
  PANEL_TREE_COUNT_CLASS,
  PANEL_TREE_GROUP_BAR_CLASS,
  PANEL_TREE_GROUP_ROW_ACTIVE_CLASS,
  PANEL_TREE_GROUP_ROW_CLASS,
  PANEL_TREE_GROUP_ROW_IDLE_CLASS,
  PANEL_TREE_GROUP_SECTION_CLASS,
  PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS,
  PANEL_TREE_GROUP_TOGGLE_CLASS,
  PANEL_TREE_STATUS_BAR_ACTIVE_CLASS,
  PANEL_TREE_STATUS_BAR_CLASS,
  PANEL_TREE_STATUS_BAR_IDLE_CLASS,
  PANEL_TREE_STATUS_ROW_ACTIVE_CLASS,
  PANEL_TREE_STATUS_ROW_CLASS,
  PANEL_TREE_STATUS_ROW_IDLE_CLASS,
  panelTreeGroupAccentClass,
} from "../panel/panelStatusTreeStyles";
import { panelSidebarFilterRowClass, sidebarSubStatusHex } from "../../utils/panelSidebarHierarchy";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { panelListStatusSidebarWidthLg } from "../listPage/listSellasistTokens";

export type OrderPanelFilter =
  | "all"
  | "unassigned"
  | { kind: "group"; group: OrderUiMainGroup }
  | { kind: "sub"; id: number };

export const ORDERS_PANEL_GROUP_LABELS: Record<OrderUiMainGroup, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

function isGroupFilterActive(panelFilter: OrderPanelFilter, g: OrderUiMainGroup): boolean {
  return typeof panelFilter === "object" && panelFilter.kind === "group" && panelFilter.group === g;
}

function isSubFilterActive(panelFilter: OrderPanelFilter, id: number): boolean {
  return typeof panelFilter === "object" && panelFilter.kind === "sub" && panelFilter.id === id;
}

function sectionKeyForGroup(g: OrderUiMainGroup): "nowe" | "wtoku" | "zakonczone" {
  if (g === "NEW") return "nowe";
  if (g === "IN_PROGRESS") return "wtoku";
  return "zakonczone";
}

function statusDotClass(name: string): string {
  const n = name.toLowerCase();
  if (n === "nowe") return "bg-blue-500";
  if (n === "w toku") return "bg-amber-500";
  if (n === "zakończone") return "bg-emerald-500";
  if (n === "pilne") return "bg-red-500";
  return "bg-slate-400";
}

function normalizeSearchQuery(q: string): string {
  return q.trim().toLowerCase();
}

function statusMatchesSearch(s: OrderUiStatusWithCount, query: string): boolean {
  if (!query) return true;
  return (s.name ?? "").toLowerCase().includes(query);
}

function subgroupMatchesSearch(title: string, rows: OrderUiStatusWithCount[], query: string): boolean {
  if (!query) return true;
  const t = title.toLowerCase();
  return t.includes(query) || rows.some((s) => statusMatchesSearch(s, query));
}

type OrdersPanelStatusSidebarProps = {
  warehouseId?: number | null;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  panelFilter: OrderPanelFilter;
  onPanelFilterChange: (next: OrderPanelFilter) => void;
  chromeVariant?: "default" | "sellasist";
  collapsed?: boolean;
  manageStatusesHref?: string;
  titleTrailing?: ReactNode;
  panelGroupLabels?: Record<OrderUiMainGroup, string>;
  returnsOperationalQueuesSlot?: ReactNode;
  returnsOperationalQueuesCollapsedSlot?: ReactNode;
  parentScrollContainer?: boolean;
};

export function OrdersPanelStatusSidebar({
  warehouseId,
  panelSummary,
  panelSubgroups,
  panelFilter,
  onPanelFilterChange,
  chromeVariant = "default",
  collapsed = false,
  panelGroupLabels = ORDERS_PANEL_GROUP_LABELS,
  titleTrailing,
  returnsOperationalQueuesSlot,
  returnsOperationalQueuesCollapsedSlot,
  parentScrollContainer = false,
}: OrdersPanelStatusSidebarProps) {
  const totalPanelOrders =
    panelSummary != null
      ? panelSummary.unassigned_count + panelSummary.groups.reduce((acc, g) => acc + g.total_count, 0)
      : null;

  const sgDefs = panelSubgroups ?? [];
  const sellasist = chromeVariant === "sellasist";
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = normalizeSearchQuery(searchQuery);
  const [openSections, setOpenSections] = useState({
    nowe: true,
    wtoku: true,
    zakonczone: true,
  });

  const blocksByMainGroup = useMemo(() => {
    const m = new Map<OrderUiMainGroup, NonNullable<OrderUiStatusPanelSummary["groups"]>[number]>();
    for (const b of panelSummary?.groups ?? []) {
      m.set(b.main_group, b);
    }
    return m;
  }, [panelSummary?.groups]);

  const stickySelf = parentScrollContainer ? "" : "lg:sticky lg:top-4";

  const renderStatusButton = (block: { main_group: OrderUiMainGroup }, s: OrderUiStatusWithCount) => {
    const active = isSubFilterActive(panelFilter, s.id);
    const markers = getPanelStatusWmsMarkers(s, block.main_group);
    const titleDetail = panelStatusCollapsedTitle(s, block.main_group);
    const stripeColor = sidebarSubStatusHex(s.badge_color ?? s.color, block.main_group);

    return (
      <button
        key={s.id}
        type="button"
        className={`${PANEL_TREE_STATUS_ROW_CLASS} ${
          active ? PANEL_TREE_STATUS_ROW_ACTIVE_CLASS : PANEL_TREE_STATUS_ROW_IDLE_CLASS
        }`}
        title={titleDetail || undefined}
        onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
      >
        <span
          className={`${PANEL_TREE_STATUS_BAR_CLASS} ${
            active ? PANEL_TREE_STATUS_BAR_ACTIVE_CLASS : PANEL_TREE_STATUS_BAR_IDLE_CLASS
          }`}
          style={{ backgroundColor: stripeColor }}
          aria-hidden
        />
        {s.image_url ? (
          <img src={s.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{s.name}</span>
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
        <span className={`${PANEL_TREE_COUNT_CLASS} ${active ? "text-slate-700" : ""}`}>{s.count}</span>
      </button>
    );
  };

  const renderOperationalSection = (slot: ReactNode, compact: boolean) => {
    if (slot == null) return null;
    return (
      <div className={compact ? "space-y-0.5 border-t border-slate-200/80 pt-1" : "space-y-1 border-t border-slate-200/90 pt-3"}>
        {!compact ? (
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Operacyjne</p>
        ) : null}
        <div className="space-y-0.5">{slot}</div>
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside
        className={`w-full max-w-full min-w-0 shrink-0 space-y-1 overflow-x-hidden rounded-md border border-slate-200/90 bg-slate-50 p-1 ${stickySelf} lg:w-14 lg:max-w-[3.5rem]`}
      >
        {titleTrailing != null ? (
          <div className="mb-1 flex justify-end">
            <div className="shrink-0">{titleTrailing}</div>
          </div>
        ) : null}
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
          onClick={() => onPanelFilterChange("all")}
          title="Wszystkie"
          aria-label="Wszystkie"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <span className={PANEL_TREE_COUNT_CLASS}>{totalPanelOrders ?? "—"}</span>
        </button>
        {(panelSummary?.unassigned_count ?? 0) > 0 ? (
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
            onClick={() => onPanelFilterChange("unassigned")}
            title="Bez etykiety"
            aria-label="Bez etykiety"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className={PANEL_TREE_COUNT_CLASS}>{panelSummary?.unassigned_count ?? "—"}</span>
          </button>
        ) : null}
        {MAIN_PANEL_GROUP_ORDER.flatMap((mg) => {
          const block = blocksByMainGroup.get(mg);
          if (!block) return [];
          const visibleStatuses = block.sub_statuses.filter((s) => statusMatchesSearch(s, normalizedSearch));
          if (normalizedSearch && visibleStatuses.length === 0) return [];
          return [
            <div key={mg} className="space-y-1 border-t border-slate-200/80 pt-1 first:border-t-0 first:pt-0">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
                onClick={() => onPanelFilterChange({ kind: "group", group: block.main_group })}
                title={panelGroupLabels[block.main_group]}
                aria-label={panelGroupLabels[block.main_group]}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(panelGroupLabels[block.main_group])}`} />
                <span className={PANEL_TREE_COUNT_CLASS}>{block.total_count}</span>
              </button>
              {visibleStatuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
                  onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
                  title={panelStatusCollapsedTitle(s, block.main_group)}
                  aria-label={panelStatusCollapsedTitle(s, block.main_group)}
                >
                  <span
                    className="h-3 w-0.5 shrink-0 rounded-full"
                    style={{ backgroundColor: sidebarSubStatusHex(s.badge_color ?? s.color, block.main_group) }}
                    aria-hidden
                  />
                  <span className={PANEL_TREE_COUNT_CLASS}>{s.count}</span>
                </button>
              ))}
            </div>,
          ];
        })}
        {renderOperationalSection(returnsOperationalQueuesCollapsedSlot, true)}
      </aside>
    );
  }

  const sellasistScroll =
    sellasist && !parentScrollContainer ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto" : "";

  return (
    <aside
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden p-2 ${stickySelf} ${
        sellasist ? "" : panelListStatusSidebarWidthLg
      } ${sellasistScroll} rounded-xl border border-slate-200/90 bg-white`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status panelu</h2>
        {titleTrailing != null ? <div className="shrink-0">{titleTrailing}</div> : null}
      </div>

      <div className="relative mb-2 px-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj statusu…"
          aria-label="Szukaj statusu"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200"
        />
      </div>

      <div className="space-y-0.5 px-1">
        <button
          type="button"
          className={panelSidebarFilterRowClass(panelFilter === "all")}
          onClick={() => onPanelFilterChange("all")}
        >
          <span className={panelFilter === "all" ? "font-semibold" : ""}>Wszystkie</span>
          <span className={PANEL_TREE_COUNT_CLASS}>{totalPanelOrders ?? "—"}</span>
        </button>

        {(panelSummary?.unassigned_count ?? 0) > 0 ? (
          <button
            type="button"
            className={panelSidebarFilterRowClass(panelFilter === "unassigned")}
            onClick={() => onPanelFilterChange("unassigned")}
          >
            <span className={panelFilter === "unassigned" ? "font-semibold" : ""}>Bez etykiety</span>
            <span className={PANEL_TREE_COUNT_CLASS}>{panelSummary?.unassigned_count ?? "—"}</span>
          </button>
        ) : null}
      </div>

      <div className="mt-3 px-1">
        {MAIN_PANEL_GROUP_ORDER.map((mainGroup) => {
          const block = blocksByMainGroup.get(mainGroup);
          if (!block) return null;

          const { ungrouped, subgroupSections } = buildPanelSidebarLayout(block.main_group, block.sub_statuses, sgDefs);
          const filteredUngrouped = ungrouped.filter((s) => statusMatchesSearch(s, normalizedSearch));
          const filteredSections = subgroupSections
            .map((sec) => ({
              ...sec,
              rows: sec.rows.filter((s) => statusMatchesSearch(s, normalizedSearch)),
            }))
            .filter((sec) => sec.rows.length > 0 && subgroupMatchesSearch(sec.title, sec.rows, normalizedSearch));

          const hasVisibleChildren = filteredUngrouped.length > 0 || filteredSections.length > 0;
          if (normalizedSearch && !hasVisibleChildren) return null;

          const sectionKey = sectionKeyForGroup(block.main_group);
          const isOpen = normalizedSearch ? true : openSections[sectionKey];
          const groupActive = isGroupFilterActive(panelFilter, block.main_group);

          return (
            <section key={block.main_group} className={PANEL_TREE_GROUP_SECTION_CLASS}>
              <div
                className={`flex items-stretch gap-0 ${groupActive ? PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS : ""}`}
              >
                <button
                  type="button"
                  className={`${PANEL_TREE_GROUP_ROW_CLASS} ${
                    groupActive ? PANEL_TREE_GROUP_ROW_ACTIVE_CLASS : PANEL_TREE_GROUP_ROW_IDLE_CLASS
                  } ${groupActive ? "border-transparent bg-transparent" : ""}`}
                  onClick={() => onPanelFilterChange({ kind: "group", group: block.main_group })}
                >
                  <span
                    className={`${PANEL_TREE_GROUP_BAR_CLASS} ${panelTreeGroupAccentClass(block.main_group)}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{panelGroupLabels[block.main_group]}</span>
                  <span className={PANEL_TREE_COUNT_CLASS}>{block.total_count}</span>
                </button>
                <button
                  type="button"
                  className={`${PANEL_TREE_GROUP_TOGGLE_CLASS} ${groupActive ? "border-transparent" : ""}`}
                  onClick={() =>
                    setOpenSections((prev) => ({
                      ...prev,
                      [sectionKey]: !prev[sectionKey],
                    }))
                  }
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "Zwiń grupę" : "Rozwiń grupę"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>

              {isOpen ? (
                <div className={PANEL_TREE_CHILDREN_CLASS}>
                  {filteredUngrouped.length > 0 ? (
                    <div className="space-y-1">{filteredUngrouped.map((s) => renderStatusButton(block, s))}</div>
                  ) : null}
                  {filteredSections.map((sec) => {
                    const sectionTotal = sec.rows.reduce((acc, r) => acc + (r.count ?? 0), 0);
                    return (
                      <PanelSidebarSubgroupCollapsible
                        key={sec.key}
                        storageKey={`panel-sg:${warehouseId ?? "tenant"}:${block.main_group}:${sec.key}`}
                        title={sec.title}
                        totalCount={sectionTotal}
                        forceExpanded={Boolean(normalizedSearch)}
                      >
                        {sec.rows.map((s) => renderStatusButton(block, s))}
                      </PanelSidebarSubgroupCollapsible>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}

        {normalizedSearch &&
        MAIN_PANEL_GROUP_ORDER.every((mg) => {
          const block = blocksByMainGroup.get(mg);
          if (!block) return true;
          return !block.sub_statuses.some((s) => statusMatchesSearch(s, normalizedSearch));
        }) ? (
          <p className="px-1 py-2 text-xs text-slate-500">Brak statusów pasujących do wyszukiwania.</p>
        ) : null}

        {renderOperationalSection(returnsOperationalQueuesSlot, false)}
      </div>
    </aside>
  );
}
