import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import type { ComplaintStatusCode } from "../../types/complaint";
import {
  COMPLAINT_SIDEBAR_FILTER_LABELS_PL,
  COMPLAINT_STATUS_FILTER_ORDER,
} from "../../types/complaint";
import { PanelStatusSidebarHeader } from "../panel/PanelStatusSidebarHeader";
import { PanelStatusWmsIconColumn } from "../panel/PanelStatusWmsIconColumn";
import { PanelTreeCount } from "../panel/PanelTreeCount";
import {
  PANEL_SIDEBAR_WIDTH_LG_CLASS,
  PANEL_TREE_SEARCH_ICON_CLASS,
  PANEL_TREE_SEARCH_INPUT_CLASS,
  PANEL_TREE_SEARCH_WRAP_CLASS,
  panelTreeMetaRowClass,
  panelTreeStatusBarClass,
  panelTreeStatusRowClass,
} from "../panel/panelStatusTreeStyles";
import { panelListStatusSidebarWidthLg } from "../listPage/listSellasistTokens";

export type ComplaintPanelFilter = "all" | { kind: "status"; status: ComplaintStatusCode };

type Props = {
  warehouseId: number;
  totalCount: number | null;
  countFor: (code: ComplaintStatusCode) => number | string;
  panelFilter: ComplaintPanelFilter;
  onPanelFilterChange: (next: ComplaintPanelFilter) => void;
  chromeVariant?: "sellasist";
  collapsed?: boolean;
  parentScrollContainer?: boolean;
  onToggleCollapsed?: () => void;
  titleTrailing?: ReactNode;
};

function stripeHexForStatus(code: ComplaintStatusCode): string {
  switch (code) {
    case "NOWE":
      return "#22c55e";
    case "OCZEKIWANIE_NA_PRODUKT":
      return "#f59e0b";
    case "WERYFIKACJA":
      return "#3b82f6";
    case "DECYZJA":
      return "#ea580c";
    case "ZAAKCEPTOWANA":
      return "#15803d";
    case "ODRZUCONA":
      return "#ef4444";
    default:
      return "#64748b";
  }
}

function isStatusActive(panelFilter: ComplaintPanelFilter, code: ComplaintStatusCode): boolean {
  return typeof panelFilter === "object" && panelFilter.kind === "status" && panelFilter.status === code;
}

export function ComplaintsListStatusSidebar({
  warehouseId: _warehouseId,
  totalCount,
  countFor,
  panelFilter,
  onPanelFilterChange,
  chromeVariant = "sellasist",
  collapsed = false,
  parentScrollContainer = false,
  onToggleCollapsed,
  titleTrailing,
}: Props) {
  void _warehouseId;
  const sellasist = chromeVariant === "sellasist";
  const embedded = parentScrollContainer;
  const [searchQuery, setSearchQuery] = useState("");

  const visibleStatuses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COMPLAINT_STATUS_FILTER_ORDER;
    return COMPLAINT_STATUS_FILTER_ORDER.filter((code) =>
      COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code].toLowerCase().includes(q),
    );
  }, [searchQuery]);

  if (collapsed) {
    const collapsedRootClass = embedded
      ? "w-full min-w-0 max-w-full shrink-0 space-y-1 overflow-x-hidden"
      : `w-full max-w-full min-w-0 shrink-0 space-y-1 overflow-x-hidden rounded-md border border-slate-200/90 bg-slate-50 p-1 lg:sticky lg:top-4 lg:w-14 lg:max-w-[3.5rem]`;

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
          className="flex w-full flex-col items-center gap-1 rounded-md px-0.5 py-1 hover:bg-slate-100"
          onClick={() => onPanelFilterChange("all")}
          title="Wszystkie"
          aria-label="Wszystkie"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <PanelTreeCount value={totalCount ?? "—"} variant="soft" />
        </button>
        {visibleStatuses.map((code) => {
          const stripe = stripeHexForStatus(code);
          return (
            <button
              key={code}
              type="button"
              className="flex w-full flex-col items-center gap-1 rounded-md border border-slate-200/80 bg-white px-0.5 py-1 hover:bg-slate-50"
              onClick={() => onPanelFilterChange({ kind: "status", status: code })}
              title={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
              aria-label={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
            >
              <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: stripe }} aria-hidden />
              <PanelTreeCount value={countFor(code)} colorHex={stripe} variant="soft" />
            </button>
          );
        })}
      </div>
    );
  }

  const sellasistScroll =
    sellasist && !embedded ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto" : "";

  const expandedRootClass = embedded
    ? "w-full min-w-0 max-w-full shrink-0 overflow-x-hidden"
    : `w-full min-w-0 max-w-full shrink-0 overflow-x-hidden p-2 lg:sticky lg:top-4 ${
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

      <div className={PANEL_TREE_SEARCH_WRAP_CLASS}>
        <Search className={PANEL_TREE_SEARCH_ICON_CLASS} strokeWidth={2} aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj statusu…"
          aria-label="Szukaj statusu"
          className={PANEL_TREE_SEARCH_INPUT_CLASS}
        />
      </div>

      <div className="space-y-1">
        <button
          type="button"
          className={panelTreeMetaRowClass(panelFilter === "all")}
          onClick={() => onPanelFilterChange("all")}
        >
          <span className="min-w-0 flex-1 leading-snug">Wszystkie</span>
          <PanelTreeCount value={totalCount ?? "—"} active={panelFilter === "all"} variant="soft" />
        </button>

        {visibleStatuses.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">Brak etapów pasujących do wyszukiwania.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {visibleStatuses.map((code) => {
              const active = isStatusActive(panelFilter, code);
              const dotColor = stripeHexForStatus(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={panelTreeStatusRowClass(active)}
                  title={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
                  onClick={() => onPanelFilterChange({ kind: "status", status: code })}
                >
                  <PanelStatusWmsIconColumn markers={[]} />
                  <span className={panelTreeStatusBarClass(active)} style={{ backgroundColor: dotColor }} aria-hidden />
                  <span className="min-w-0 flex-1 leading-snug">{COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}</span>
                  <PanelTreeCount value={countFor(code)} active={active} colorHex={dotColor} variant="soft" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </RootTag>
  );
}
