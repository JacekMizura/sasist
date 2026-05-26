import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
  panelSidebarMainGroupRowClass,
  panelSidebarSubCountBadgeClass,
  panelSidebarSubRowClass,
  panelSidebarSubRowStyleRich,
} from "../../utils/panelSidebarHierarchy";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { panelListStatusSidebarWidthLg } from "../listPage/listSellasistTokens";
import { getStatusClass } from "./orderList/OrderListPanelStatusBadge";

/** Pasek przy nagłówku grupy (sellasist). */
const ACCENT_W = "w-1 shrink-0 rounded-full";

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

type OrdersPanelStatusSidebarProps = {
  warehouseId: number;
  panelSummary: OrderUiStatusPanelSummary | null;
  /** Z API `/office/order-ui/panel-subgroups` — kolejność i nazwy sekcji w sidebarze. */
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  panelFilter: OrderPanelFilter;
  onPanelFilterChange: (next: OrderPanelFilter) => void;
  /** Gęstszy układ listy zamówień: neutralna skorupa, przewijany panel. */
  chromeVariant?: "default" | "sellasist";
  collapsed?: boolean;
  /** Domyślnie ustawienia statusów zamówień; zwroty: `/orders/returns/panel-statuses`. */
  manageStatusesHref?: string;
  /** Opcjonalny element w tym samym rzędzie co tytuł „Status panelu” (np. przycisk zwijania). */
  titleTrailing?: ReactNode;
  /** Etykiety kubełków (np. zwroty: „Nowe zwroty”). Domyślnie {@link ORDERS_PANEL_GROUP_LABELS}. */
  panelGroupLabels?: Record<OrderUiMainGroup, string>;
  /**
   * Zwroty: kolejki operacyjne (między „W toku” a „Zakończone”) — zamiast osobnego paska nad tabelą.
   * Rozwinięty panel.
   */
  returnsOperationalQueuesSlot?: ReactNode;
  /** Zwroty: ta sama nawigacja w zwiniętym sidebarze (ikony / liczniki). */
  returnsOperationalQueuesCollapsedSlot?: ReactNode;
  /**
   * Gdy rodzic (np. kolumna na szczegółach zamówienia) jest `sticky` + `max-h` + `overflow-y-auto`,
   * wyłącz wewnętrzne `sticky` / limit wysokości na tym `aside` — unikamy złego zachowania w `overflow-x-hidden` i zagnieżdżonego scrolla.
   */
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
  return "bg-emerald-600";
}

export function OrdersPanelStatusSidebar({
  warehouseId,
  panelSummary,
  panelSubgroups,
  panelFilter,
  onPanelFilterChange,
  chromeVariant = "default",
  collapsed = false,
  manageStatusesHref = "/settings/orders/ui-statuses",
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

  const renderStatusButton = (block: { main_group: OrderUiMainGroup }, s: OrderUiStatusWithCount) => {
    const active = isSubFilterActive(panelFilter, s.id);
    const style = panelSidebarSubRowStyleRich(s, block.main_group, active, { barWidthPx: sellasist ? 4 : 6 });
    const markers = getPanelStatusWmsMarkers(s, block.main_group);
    const titleDetail = panelStatusCollapsedTitle(s, block.main_group);
    return (
      <button
        key={s.id}
        type="button"
        className={panelSidebarSubRowClass(active, { compactLabel: sellasist })}
        style={style}
        title={titleDetail || undefined}
        onClick={() => onPanelFilterChange({ kind: "sub", id: s.id })}
      >
        <span className="flex min-w-0 w-full items-center gap-1.5">
          {s.image_url ? (
            <img src={s.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
          ) : null}
          <span
            className={
              sellasist
                ? "min-w-0 flex-1 truncate text-[12px] font-normal leading-snug tracking-normal"
                : "min-w-0 flex-1 truncate text-[15px] font-semibold tracking-normal"
            }
          >
            {s.name}
          </span>
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
        <span className={panelSidebarSubCountBadgeClass()}>{s.count}</span>
      </button>
    );
  };

  const stickySelf = parentScrollContainer ? "" : "lg:sticky lg:top-4";

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

  const sellasistScroll =
    sellasist && !parentScrollContainer
      ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto"
      : sellasist
        ? ""
        : "";

  return (
    <aside
      className={`w-full min-w-0 max-w-full shrink-0 space-y-2 overflow-x-hidden p-1.5 ${stickySelf} ${
        sellasist ? "" : panelListStatusSidebarWidthLg
      } ${
        sellasist
          ? `${sellasistScroll} rounded-md border border-slate-200/90 bg-slate-50`
          : "rounded-lg border border-slate-200/90 bg-white"
      }`}
    >
      {titleTrailing != null ? (
        <div className="mb-1 flex min-h-[2rem] items-center justify-between gap-2">
          <p
            className={`min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide ${sellasist ? "text-slate-600" : "text-slate-500"}`}
          >
            Status panelu
          </p>
          <div className="shrink-0">{titleTrailing}</div>
        </div>
      ) : (
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${sellasist ? "text-slate-600" : "text-slate-500"}`}>
          Status panelu
        </p>
      )}
      <button
        type="button"
        className={panelSidebarFilterRowClass(panelFilter === "all")}
        onClick={() => onPanelFilterChange("all")}
      >
        <span>Wszystkie</span>
        <span className={panelSidebarSubCountBadgeClass()}>{totalPanelOrders ?? "—"}</span>
      </button>
      {(panelSummary?.unassigned_count ?? 0) > 0 ? (
        <button
          type="button"
          className={panelSidebarFilterRowClass(panelFilter === "unassigned")}
          onClick={() => onPanelFilterChange("unassigned")}
        >
          <span>Bez etykiety</span>
          <span className={panelSidebarSubCountBadgeClass()}>{panelSummary?.unassigned_count ?? "—"}</span>
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
            className={`space-y-2 ${sellasist && groupIdx > 0 ? "mt-4 border-t border-slate-200/85 pt-4" : ""}`}
          >
            <button
              type="button"
              className={
                sellasist
                  ? `flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      isGroupFilterActive(panelFilter, block.main_group)
                        ? "border-slate-300/90 bg-white font-semibold text-slate-900 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.38)]"
                        : "border-slate-200/75 bg-slate-100/95 font-semibold text-slate-900 hover:border-slate-300/85 hover:bg-slate-100"
                    }`
                  : panelSidebarMainGroupRowClass(block.main_group, isGroupFilterActive(panelFilter, block.main_group))
              }
              onClick={() => {
                onPanelFilterChange({ kind: "group", group: block.main_group });
                setOpenSections((prev) => ({
                  ...prev,
                  [sectionKey]: !prev[sectionKey],
                }));
              }}
            >
              {sellasist ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-6 ${ACCENT_W} ${accentBarFromMainGroup(block.main_group)}`} aria-hidden />
                  <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
                    {panelGroupLabels[block.main_group]}
                  </span>
                </span>
              ) : (
                <span
                  className={`inline-flex w-fit rounded-sm border-l-4 px-2 py-0.5 text-xs font-semibold ${                  getStatusClass(
                    panelGroupLabels[block.main_group],
                  )}`}
                >
                  {panelGroupLabels[block.main_group]}
                </span>
              )}
              <span className={panelSidebarMainGroupCountBadgeClass()}>{block.total_count}</span>
            </button>
            <div
              className={
                isOpen
                  ? sellasist
                    ? "ml-0 space-y-0.5 border-l border-slate-200/55 pl-1.5"
                    : "ml-0.5 space-y-0.5 border-l border-slate-200/75 pl-2"
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
                    <PanelSidebarSubgroupCollapsible
                      key={sec.key}
                      storageKey={`panel-sg:orders:${warehouseId}:${block.main_group}:${sec.key}`}
                      title={sec.title}
                      totalCount={sectionTotal}
                    >
                      {sec.rows.map((s) => renderStatusButton(block, s))}
                    </PanelSidebarSubgroupCollapsible>
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
              className={`space-y-2 ${sellasist ? "mt-4 border-t border-slate-200/85 pt-4" : "mt-3 border-t border-slate-200/90 pt-3"}`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide ${sellasist ? "text-slate-600" : "text-slate-500"}`}
              >
                Operacyjne widoki
              </p>
              <div className="space-y-1">{returnsOperationalQueuesSlot}</div>
            </div>,
          );
        }
        return chunk;
      })}
      <Link to={manageStatusesHref} className="mt-1 block text-center text-xs font-medium text-blue-700 hover:underline">
        Zarządzaj statusami…
      </Link>
    </aside>
  );
}
