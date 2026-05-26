import { Link } from "react-router-dom";

import type { ComplaintStatusCode } from "../../types/complaint";
import {
  COMPLAINT_SIDEBAR_FILTER_LABELS_PL,
  COMPLAINT_STATUS_FILTER_ORDER,
} from "../../types/complaint";
import {
  panelSidebarFilterRowClass,
  panelSidebarMainGroupCountBadgeClass,
  panelSidebarSubCountBadgeClass,
  panelSidebarSubRowClass,
  panelSidebarSubRowStyleRich,
  type PanelSidebarMainGroup,
} from "../../utils/panelSidebarHierarchy";

export type ComplaintPanelFilter = "all" | { kind: "status"; status: ComplaintStatusCode };

type Props = {
  warehouseId: number;
  totalCount: number | null;
  countFor: (code: ComplaintStatusCode) => number | string;
  panelFilter: ComplaintPanelFilter;
  onPanelFilterChange: (next: ComplaintPanelFilter) => void;
  chromeVariant?: "sellasist";
  collapsed?: boolean;
};

const ACCENT_W = "w-1 shrink-0 rounded-full";

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

function mainGroupForComplaintStatus(code: ComplaintStatusCode): PanelSidebarMainGroup {
  if (code === "NOWE") return "NEW";
  if (code === "ZAAKCEPTOWANA" || code === "ODRZUCONA") return "DONE";
  return "IN_PROGRESS";
}

function accentBarFromMainGroup(g: PanelSidebarMainGroup): string {
  if (g === "NEW") return "bg-blue-500";
  if (g === "IN_PROGRESS") return "bg-amber-500";
  return "bg-emerald-600";
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
}: Props) {
  void _warehouseId;
  const sellasist = chromeVariant === "sellasist";

  if (collapsed) {
    return (
      <aside className="w-full max-w-full min-w-0 shrink-0 space-y-1 overflow-x-hidden rounded-md border border-slate-200/90 bg-slate-50 p-1 lg:sticky lg:top-4 lg:w-14 lg:max-w-[3.5rem]">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
          onClick={() => onPanelFilterChange("all")}
          title="Wszystkie"
          aria-label="Wszystkie"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <span className={panelSidebarSubCountBadgeClass()}>{totalCount ?? "—"}</span>
        </button>
        {COMPLAINT_STATUS_FILTER_ORDER.map((code) => (
          <button
            key={code}
            type="button"
            className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
            onClick={() => onPanelFilterChange({ kind: "status", status: code })}
            title={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
            aria-label={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stripeHexForStatus(code) }} />
            <span className={panelSidebarSubCountBadgeClass()}>{countFor(code)}</span>
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside
      className={`w-full min-w-0 max-w-full shrink-0 space-y-2 overflow-x-hidden p-1.5 lg:sticky lg:top-4 ${
        sellasist
          ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto rounded-md border border-slate-200/90 bg-slate-50"
          : "rounded-lg border border-slate-200/90 bg-white"
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${sellasist ? "text-slate-600" : "text-slate-500"}`}>
        Status reklamacji
      </p>
      <button
        type="button"
        className={panelSidebarFilterRowClass(panelFilter === "all")}
        onClick={() => onPanelFilterChange("all")}
      >
        <span>Wszystkie</span>
        <span className={panelSidebarSubCountBadgeClass()}>{totalCount ?? "—"}</span>
      </button>

      <div className={sellasist ? "space-y-2 border-t border-slate-200/85 pt-4" : "space-y-2"}>
        <div className="flex min-w-0 items-center gap-2 px-0.5">
          <span className={`h-6 ${ACCENT_W} ${accentBarFromMainGroup("IN_PROGRESS")}`} aria-hidden />
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900">Etapy</span>
          <span className={`ml-auto ${panelSidebarMainGroupCountBadgeClass()}`}>{totalCount ?? "—"}</span>
        </div>
        <div className={sellasist ? "ml-0 space-y-0.5 border-l border-slate-200/55 pl-1.5" : "space-y-0.5"}>
          <div className="space-y-0.5">
            {COMPLAINT_STATUS_FILTER_ORDER.map((code) => {
              const active = isStatusActive(panelFilter, code);
              const group = mainGroupForComplaintStatus(code);
              const style = panelSidebarSubRowStyleRich(
                { color: stripeHexForStatus(code) },
                group,
                active,
                { barWidthPx: sellasist ? 4 : 6 },
              );
              return (
                <button
                  key={code}
                  type="button"
                  className={panelSidebarSubRowClass(active, { compactLabel: sellasist })}
                  style={style}
                  title={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
                  onClick={() => onPanelFilterChange({ kind: "status", status: code })}
                >
                  <span className="min-w-0 truncate">{COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}</span>
                  <span className={panelSidebarSubCountBadgeClass()}>{countFor(code)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Link to="/settings/complaints/ui-statuses" className="mt-1 block text-center text-xs font-medium text-blue-700 hover:underline">
        Zarządzaj statusami…
      </Link>
    </aside>
  );
}
