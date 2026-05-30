import { useMemo, useState, type ReactNode } from "react";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";
import { getPanelStatusWmsMarkers, panelStatusCollapsedTitle } from "./panelStatusWmsChips";
import { PanelSidebarSubgroupCollapsible } from "../panel/PanelSidebarSubgroupCollapsible";
import {
  panelSidebarFilterRowClass,
  panelSidebarMainGroupCountBadgeClass,
  panelSidebarSubCountBadgeClass,
  panelSidebarSubRowStyleRich,
} from "../../utils/panelSidebarHierarchy";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { panelListStatusSidebarWidthLg } from "../listPage/listSellasistTokens";
import { getStatusClass } from "./orderList/OrderListPanelStatusBadge";

// === IKONY SVG DLA NOWEGO WYGLĄDU ===
const IconChevronDown = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
);
const IconChevronRight = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
);

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

// === FUNKCJA POMOCNICZA DO CZYSZCZENIA NAZW PODGRUP ===
function cleanSubgroupName(name: string): string {
  if (!name) return '';
  return name.replace(/-/g, '').trim();
}

type OrdersPanelStatusSidebarProps = {
  warehouseId: number;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  panelFilter: OrderPanelFilter;
  onPanelFilterChange: (next: OrderPanelFilter) => void;
  chromeVariant?: "default" | "sellasist";
  collapsed?: boolean;
  manageStatusesHref?: string; // Pozostawione w typach z uwagi na ewentualną wsteczną kompatybilność, ale nieużywane w renderze
  titleTrailing?: ReactNode;
  panelGroupLabels?: Record<OrderUiMainGroup, string>;
  returnsOperationalQueuesSlot?: ReactNode;
  returnsOperationalQueuesCollapsedSlot?: ReactNode;
  parentScrollContainer?: boolean;
};

function statusDotClass(name: string): string {
  const n = name.toLowerCase();
  if (n === "nowe") return "bg-blue-500";
  if (n === "w toku") return "bg-yellow-500";
  if (n === "zakończone") return "bg-green-500";
  if (n === "pilne") return "bg-red-500";
  return "bg-slate-400";
}

function accentBarFromMainGroup(g: OrderUiMainGroup): string {
  if (g === "NEW") return "bg-blue-500";
  if (g === "IN_PROGRESS") return "bg-amber-500";
  return "bg-emerald-500";
}

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

  // === RENDER POJEDYNCZEGO STATUSU Z NOWYM WYGLĄDEM ===
  const renderStatusButton = (block: { main_group: OrderUiMainGroup }, s: OrderUiStatusWithCount) => {
    const active = isSubFilterActive(panelFilter, s.id);
    const style = panelSidebarSubRowStyleRich(s, block.main_group, active, { barWidthPx: sellasist ? 4 : 6 });
    const markers = getPanelStatusWmsMarkers(s, block.main_group);
    const titleDetail = panelStatusCollapsedTitle(s, block.main_group);
    
    return (
      <button
        key={s.id}
        type="button"
        className={`flex w-full items-center justify-between p-2 rounded-md cursor-pointer relative overflow-hidden mb-1 transition-all hover:scale-[1.01] hover:shadow-sm ${
          active ? "ring-1 ring-blue-400 font-medium" : ""
        }`}
        style={style}
        title={titleDetail || undefined}
        onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5">
          {s.image_url ? (
            <img src={s.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-left text-[13px] tracking-normal">
            {s.name}
          </span>
          {/* LOGIKA WMS MARKERS ZACHOWANA */}
          {markers.length > 0 ? (
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
              {markers.map((m) => {
                const MIcon = m.Icon;
                return (
                  <span
                    key={m.id}
                    title={m.title}
                    className={`inline-flex items-center justify-center rounded p-0.5 ring-inset ${m.wrapClass}`}
                  >
                    <MIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                );
              })}
            </span>
          ) : null}
        </span>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/70 shadow-sm ml-2 shrink-0 text-slate-700">
          {s.count}
        </span>
      </button>
    );
  };

  const stickySelf = parentScrollContainer ? "" : "lg:sticky lg:top-4";

  // === WIDOK ZWINIĘTY (Pozostawiony zgodnie z poprzednią logiką z kosmetyką klas) ===
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
          <span className={panelSidebarSubCountBadgeClass()}>{totalPanelOrders ?? "—"}</span>
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
            <span className={panelSidebarSubCountBadgeClass()}>{panelSummary?.unassigned_count ?? "—"}</span>
          </button>
        ) : null}
        {MAIN_PANEL_GROUP_ORDER.flatMap((mg) => {
          const block = blocksByMainGroup.get(mg);
          if (!block) return [];
          const chunk: ReactNode[] = [
            <div key={mg} className="space-y-1 border-t border-slate-200/80 pt-1 first:border-t-0 first:pt-0">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
                onClick={() => onPanelFilterChange({ kind: "group", group: block.main_group })}
                title={panelGroupLabels[block.main_group]}
                aria-label={panelGroupLabels[block.main_group]}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(panelGroupLabels[block.main_group])}`} />
                <span className={panelSidebarMainGroupCountBadgeClass()}>{block.total_count}</span>
              </button>
              {block.sub_statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
                  onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
                  title={panelStatusCollapsedTitle(s, block.main_group)}
                  aria-label={panelStatusCollapsedTitle(s, block.main_group)}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(s.name ?? "")}`} />
                  <span className={panelSidebarSubCountBadgeClass()}>{s.count}</span>
                </button>
              ))}
            </div>,
          ];
          if (mg === "IN_PROGRESS" && returnsOperationalQueuesCollapsedSlot != null) {
            chunk.push(
              <div
                key={`${mg}-op`}
                className="space-y-1 border-t border-slate-200/80 pt-1"
                aria-label="Operacyjne widoki"
              >
                {returnsOperationalQueuesCollapsedSlot}
              </div>,
            );
          }
          return chunk;
        })}
      </aside>
    );
  }

  // === WIDOK ROZWINIĘTY (GŁÓWNY Z NOWYM DESIGNEM) ===
  const sellasistScroll =
    sellasist && !parentScrollContainer
      ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto"
      : "";

  return (
    <aside
      className={`w-full min-w-0 max-w-full shrink-0 space-y-2 overflow-x-hidden p-2 ${stickySelf} ${
        sellasist ? "" : panelListStatusSidebarWidthLg
      } ${
        sellasist
          ? `${sellasistScroll} rounded-xl border border-slate-200 bg-white shadow-sm`
          : "rounded-xl border border-slate-200 bg-white shadow-sm"
      }`}
    >
      <div className="p-2 mb-2 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2
            className={`text-xs font-bold uppercase tracking-wide ${
            sellasist ? "text-slate-600" : "text-slate-500"
          }`}
        >
          Status panelu
        </h2>

        {titleTrailing != null ? (
          <div className="shrink-0">
            {titleTrailing}
          </div>
        ) : null}
      </div>
    </div>

      <div className="px-1 space-y-2">
        <button
          type="button"
          className={`flex w-full items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors group ${
            panelFilter === "all" ? "bg-slate-100" : "hover:bg-slate-50"
          }`}
          onClick={() => onPanelFilterChange("all")}
        >
          <span className={panelFilter === "all" ? "font-semibold text-slate-800" : "font-semibold text-slate-700"}>
            Wszystkie
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-sm font-medium transition-colors ${
            panelFilter === "all" ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
          }`}>
            {totalPanelOrders ?? "—"}
          </span>
        </button>

        {(panelSummary?.unassigned_count ?? 0) > 0 ? (
          <button
            type="button"
            className={`flex w-full items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors group ${
              panelFilter === "unassigned" ? "bg-slate-100" : "hover:bg-slate-50"
            }`}
            onClick={() => onPanelFilterChange("unassigned")}
          >
            <span className={panelFilter === "unassigned" ? "font-semibold text-slate-800" : "font-semibold text-slate-700"}>
              Bez etykiety
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-sm font-medium transition-colors ${
              panelFilter === "unassigned" ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
            }`}>
              {panelSummary?.unassigned_count ?? "—"}
            </span>
          </button>
        ) : null}

        {MAIN_PANEL_GROUP_ORDER.flatMap((mainGroup, groupIdx) => {
          const block = blocksByMainGroup.get(mainGroup);
          if (!block) return [];
          const { ungrouped, subgroupSections } = buildPanelSidebarLayout(block.main_group, block.sub_statuses, sgDefs);
          
          const sectionKey =
            block.main_group === "NEW"
              ? "nowe"
              : block.main_group === "IN_PROGRESS"
                ? "wtoku"
                : "zakonczone";
          const isOpen = openSections[sectionKey];
          
          const chunk: ReactNode[] = [
            <div
              key={block.main_group}
              className={`space-y-1 ${sellasist && groupIdx > 0 ? "mt-4 pt-2" : "mt-2"}`}
            >
              <button
                type="button"
                className={`flex w-full items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors border shadow-sm relative overflow-hidden ${
                  isGroupFilterActive(panelFilter, block.main_group)
                    ? "bg-slate-100 border-slate-200 shadow-md"
                    : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                }`}
                onClick={() => {
                  onPanelFilterChange({ kind: "group", group: block.main_group });
                  setOpenSections((prev) => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey],
                  }));
                }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentBarFromMainGroup(block.main_group)}`}></div>
                <div className="flex items-center gap-2 pl-2 text-slate-400">
                  {isOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                  <span className="font-semibold text-slate-800 tracking-tight">
                    {panelGroupLabels[block.main_group]}
                  </span>
                </div>
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full text-sm font-bold shadow-sm">
                  {block.total_count}
                </span>
              </button>

              <div
                className={
                  isOpen
                    ? "ml-0 space-y-0.5 border-l-2 border-slate-50 pl-3 pr-1 pt-1 pb-2"
                    : "hidden"
                }
              >
                <div className="space-y-0.5">
                  {ungrouped.length ? (
                    <div className="space-y-1">{ungrouped.map((s) => renderStatusButton(block, s))}</div>
                  ) : null}
                  
                  {subgroupSections.map((sec) => {
                    const sectionTotal = sec.rows.reduce((acc, r) => acc + (r.count ?? 0), 0);
                    return (
                      <div key={sec.key} className="mt-2 mb-1">
                        <PanelSidebarSubgroupCollapsible
                          storageKey={`panel-sg:orders:${warehouseId}:${block.main_group}:${sec.key}`}
                          title={
                            <div className="flex items-center gap-2 w-full pt-1 pb-1 opacity-80 hover:opacity-100 transition-opacity">
                              <div className="h-px bg-slate-200 flex-1"></div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {cleanSubgroupName(sec.title)}
                              </span>
                              <div className="h-px bg-slate-200 flex-1"></div>
                            </div>
                          }
                          totalCount={sectionTotal}
                        >
                          {sec.rows.map((s) => renderStatusButton(block, s))}
                        </PanelSidebarSubgroupCollapsible>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
          ];

          if (mainGroup === "IN_PROGRESS" && returnsOperationalQueuesSlot != null) {
            chunk.push(
              <div
                key={`${mainGroup}-op`}
                className={`space-y-2 ${sellasist ? "mt-4 border-t border-slate-100 pt-4" : "mt-3 border-t border-slate-100 pt-3"}`}
              >
                <p className={`text-[10px] font-semibold uppercase tracking-wide px-2 ${sellasist ? "text-slate-600" : "text-slate-500"}`}>
                  Operacyjne widoki
                </p>
                <div className="space-y-1">{returnsOperationalQueuesSlot}</div>
              </div>,
            );
          }
          return chunk;
        })}
      </div>
    </aside>
  );
}