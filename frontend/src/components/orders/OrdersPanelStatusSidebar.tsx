import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";
import { getPanelStatusWmsMarkers, panelStatusCollapsedTitle } from "./panelStatusWmsChips";
import { PanelStatusWmsIconColumn } from "../panel/PanelStatusWmsIconColumn";
import { PanelSidebarSubgroupCollapsible } from "../panel/PanelSidebarSubgroupCollapsible";
import { PanelTreeCount } from "../panel/PanelTreeCount";
import { PanelTreeGroupRow } from "../panel/PanelTreeGroupRow";
import { PanelStatusSidebarHeader } from "../panel/PanelStatusSidebarHeader";
import {
  PANEL_SIDEBAR_WIDTH_LG_CLASS,
  PANEL_TREE_CHILDREN_CLASS,
  PANEL_TREE_GROUP_SECTION_CLASS,
  PANEL_TREE_GROUP_STATUS_LIST_CLASS,
  PANEL_TREE_OPERATIONAL_LIST_CLASS,
  PANEL_TREE_OPERATIONAL_SECTION_HEADER_CLASS,
  PANEL_TREE_OPERATIONAL_TITLE_CLASS,
  PANEL_TREE_SUBGROUP_LINE_CLASS,
  panelTreeMetaRowClass,
  panelTreeStatusBarClass,
  panelTreeStatusRowClass,
} from "../panel/panelStatusTreeStyles";
import { sidebarSubStatusHex } from "../../utils/panelSidebarHierarchy";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { panelListStatusSidebarWidthLg } from "../listPage/listSellasistTokens";
import { panelStatusCounterColorResolver } from "../../hooks/usePanelStatusCounterColor";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import type { PanelStatusCounterColorModule } from "../../utils/panelStatusCounterColorStore";

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
  onToggleCollapsed?: () => void;
  /** Moduł localStorage dla kolorów licznika (zamówienia vs zwroty). */
  counterColorModule?: PanelStatusCounterColorModule;
  /** Opcjonalny override lookupu koloru licznika per status. */
  statusCounterColorForId?: (statusId: number) => string | null;
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
  onToggleCollapsed,
  counterColorModule = "orders",
  statusCounterColorForId: statusCounterColorForIdProp,
}: OrdersPanelStatusSidebarProps) {
  const statusCounterColorForIdFromStore = useMemo(() => {
    if (warehouseId == null || warehouseId <= 0) return undefined;
    return panelStatusCounterColorResolver(counterColorModule, DAMAGE_TENANT_ID, warehouseId);
  }, [warehouseId, counterColorModule]);

  const counterColorForId = statusCounterColorForIdProp ?? statusCounterColorForIdFromStore;
  const totalPanelOrders =
    panelSummary != null
      ? panelSummary.unassigned_count + panelSummary.groups.reduce((acc, g) => acc + g.total_count, 0)
      : null;

  const sgDefs = panelSubgroups ?? [];
  const sellasist = chromeVariant === "sellasist";
  const embedded = parentScrollContainer;
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

  const stickySelf = embedded ? "" : "lg:sticky lg:top-4";

  const renderStatusButton = (block: { main_group: OrderUiMainGroup }, s: OrderUiStatusWithCount) => {
    const active = isSubFilterActive(panelFilter, s.id);
    const markers = getPanelStatusWmsMarkers(s, block.main_group);
    const titleDetail = panelStatusCollapsedTitle(s, block.main_group);
    const stripeColor = sidebarSubStatusHex(s.badge_color ?? s.color, block.main_group);

    return (
      <button
        key={s.id}
        type="button"
        className={panelTreeStatusRowClass(active)}
        title={titleDetail || undefined}
        onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
      >
        <PanelStatusWmsIconColumn markers={markers} />
        <span className={panelTreeStatusBarClass(active)} style={{ backgroundColor: stripeColor }} aria-hidden />
        <span className="min-w-0 flex-1 leading-snug">{s.name}</span>
        {s.image_url ? (
          <img src={s.image_url} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded object-contain" />
        ) : null}
        <PanelTreeCount value={s.count} active={active} colorHex={counterColorForId?.(s.id)} />
      </button>
    );
  };

  const renderOperationalSection = (slot: ReactNode, compact: boolean) => {
    if (slot == null) return null;
    return (
      <section className={compact ? "border-t border-slate-200/80 pt-1" : "border-t border-slate-100 pt-3"}>
        {!compact ? (
          <div className={PANEL_TREE_OPERATIONAL_SECTION_HEADER_CLASS}>
            <span className={PANEL_TREE_OPERATIONAL_TITLE_CLASS}>Operacyjne</span>
            <span className={PANEL_TREE_SUBGROUP_LINE_CLASS} aria-hidden />
          </div>
        ) : null}
        <div className={compact ? "space-y-0.5" : PANEL_TREE_OPERATIONAL_LIST_CLASS}>{slot}</div>
      </section>
    );
  };

  if (collapsed) {
    const collapsedRootClass = embedded
      ? "w-full min-w-0 max-w-full shrink-0 space-y-1 overflow-x-hidden"
      : `w-full max-w-full min-w-0 shrink-0 space-y-1 overflow-x-hidden rounded-md border border-slate-200/90 bg-slate-50 p-1 ${stickySelf} lg:w-14 lg:max-w-[3.5rem]`;

    return (
      <div className={collapsedRootClass}>
        <PanelStatusSidebarHeader
          title="Status panelu"
          collapsed
          titleTrailing={titleTrailing}
          onToggleCollapsed={onToggleCollapsed}
        />
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
          onClick={() => onPanelFilterChange("all")}
          title="Wszystkie"
          aria-label="Wszystkie"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <PanelTreeCount value={totalPanelOrders ?? "—"} />
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
            <PanelTreeCount value={panelSummary?.unassigned_count ?? "—"} />
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
                <PanelTreeCount value={block.total_count} />
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
                  <PanelTreeCount value={s.count} colorHex={counterColorForId?.(s.id)} />
                </button>
              ))}
            </div>,
          ];
        })}
        {renderOperationalSection(returnsOperationalQueuesCollapsedSlot, true)}
      </div>
    );
  }

  const sellasistScroll =
    sellasist && !embedded ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto" : "";

  const expandedRootClass = embedded
    ? "w-full min-w-0 max-w-full shrink-0 overflow-x-hidden"
    : `w-full min-w-0 max-w-full shrink-0 overflow-x-hidden p-2 ${stickySelf} ${
        sellasist ? PANEL_SIDEBAR_WIDTH_LG_CLASS : panelListStatusSidebarWidthLg
      } ${sellasistScroll} rounded-xl border border-slate-200/90 bg-white`;

  const RootTag = embedded ? "div" : "aside";

  return (
    <RootTag className={expandedRootClass}>
      <PanelStatusSidebarHeader
        title="Status panelu"
        titleTrailing={titleTrailing}
        onToggleCollapsed={onToggleCollapsed}
      />

      <div className="relative mb-2">
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

      <div className="space-y-1.5">
        <button
          type="button"
          className={panelTreeMetaRowClass(panelFilter === "all")}
          onClick={() => onPanelFilterChange("all")}
        >
          <span className="min-w-0 flex-1 leading-snug">Wszystkie</span>
          <PanelTreeCount value={totalPanelOrders ?? "—"} active={panelFilter === "all"} />
        </button>

        {(panelSummary?.unassigned_count ?? 0) > 0 ? (
          <button
            type="button"
            className={panelTreeMetaRowClass(panelFilter === "unassigned")}
            onClick={() => onPanelFilterChange("unassigned")}
          >
            <span className="min-w-0 flex-1 leading-snug">Bez etykiety</span>
            <PanelTreeCount value={panelSummary?.unassigned_count ?? "—"} active={panelFilter === "unassigned"} />
          </button>
        ) : null}
      </div>

      <div className="mt-3">
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
              <PanelTreeGroupRow
                label={panelGroupLabels[block.main_group]}
                count={block.total_count}
                mainGroup={block.main_group}
                expanded={isOpen}
                active={groupActive}
                onFilter={() => onPanelFilterChange({ kind: "group", group: block.main_group })}
                onToggle={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey],
                  }))
                }
              />

              {isOpen ? (
                <div className={PANEL_TREE_CHILDREN_CLASS}>
                  {filteredUngrouped.length > 0 ? (
                    <div className={PANEL_TREE_GROUP_STATUS_LIST_CLASS}>
                      {filteredUngrouped.map((s) => renderStatusButton(block, s))}
                    </div>
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
          <p className="py-2 text-xs text-slate-500">Brak statusów pasujących do wyszukiwania.</p>
        ) : null}

        {renderOperationalSection(returnsOperationalQueuesSlot, false)}
      </div>
    </RootTag>
  );
}
