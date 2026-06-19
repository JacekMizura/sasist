import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

import type { ComplaintStatusCode } from "../../types/complaint";
import {
  COMPLAINT_SIDEBAR_FILTER_LABELS_PL,
  COMPLAINT_STATUS_FILTER_ORDER,
} from "../../types/complaint";
import {
  PANEL_TREE_COUNT_CLASS,
  panelTreeMetaRowClass,
  panelTreeStatusBarClass,
  panelTreeStatusRowClass,
} from "../panel/panelStatusTreeStyles";

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
}: Props) {
  void _warehouseId;
  const sellasist = chromeVariant === "sellasist";
  const [searchQuery, setSearchQuery] = useState("");

  const visibleStatuses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COMPLAINT_STATUS_FILTER_ORDER;
    return COMPLAINT_STATUS_FILTER_ORDER.filter((code) =>
      COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code].toLowerCase().includes(q),
    );
  }, [searchQuery]);

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
          <span className={PANEL_TREE_COUNT_CLASS}>{totalCount ?? "—"}</span>
        </button>
        {visibleStatuses.map((code) => (
          <button
            key={code}
            type="button"
            className="flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100"
            onClick={() => onPanelFilterChange({ kind: "status", status: code })}
            title={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
            aria-label={COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}
          >
            <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: stripeHexForStatus(code) }} aria-hidden />
            <span className={PANEL_TREE_COUNT_CLASS}>{countFor(code)}</span>
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden p-2 lg:sticky lg:top-4 ${
        sellasist
          ? "max-h-[min(100vh-6rem,52rem)] overflow-y-auto rounded-xl border border-slate-200/90 bg-white"
          : "rounded-xl border border-slate-200/90 bg-white"
      }`}
    >
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Status reklamacji</p>

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
          placeholder="Szukaj etapu…"
          aria-label="Szukaj etapu reklamacji"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200"
        />
      </div>

      <div className="space-y-1.5 px-1">
        <button
          type="button"
          className={panelTreeMetaRowClass(panelFilter === "all")}
          onClick={() => onPanelFilterChange("all")}
        >
          <span className={panelFilter === "all" ? "font-semibold" : ""}>Wszystkie</span>
          <span className={PANEL_TREE_COUNT_CLASS}>{totalCount ?? "—"}</span>
        </button>

        {visibleStatuses.length === 0 ? (
          <p className="px-1 py-2 text-xs text-slate-500">Brak etapów pasujących do wyszukiwania.</p>
        ) : (
          <div className="space-y-1.5 pt-2">
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
                  <span
                    className={panelTreeStatusBarClass(active)}
                    style={{ backgroundColor: dotColor }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate pl-0.5">{COMPLAINT_SIDEBAR_FILTER_LABELS_PL[code]}</span>
                  <span className={`${PANEL_TREE_COUNT_CLASS} ${active ? "text-slate-700" : ""}`}>
                    {countFor(code)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Link
        to="/settings/complaints/ui-statuses"
        className="mt-3 block px-1 text-center text-xs font-medium text-slate-500 hover:text-blue-700 hover:underline"
      >
        Zarządzaj statusami…
      </Link>
    </aside>
  );
}
