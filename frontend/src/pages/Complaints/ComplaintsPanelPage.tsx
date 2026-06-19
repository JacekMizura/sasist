import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Flag,
  Home,
  Mail,
  MoreHorizontal,
  Package,
  Phone,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Table2,
  Trash2,
  Truck,
  Upload,
  Wrench,
} from "lucide-react";

import { getComplaintStatusSummary, listComplaints, softDeleteComplaint } from "../../api/complaintsApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import type { ComplaintListItem } from "../../types/complaint";
import { normalizeComplaintStatus, type ComplaintStatusCode } from "../../types/complaint";
import { complaintDefectLabel } from "../../constants/complaintDefectTags";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import NewComplaintWizard from "./NewComplaintWizard";
import ComplaintResponseDeadlineBanner from "./ComplaintResponseDeadlineBanner";
import ComplaintAutoAcceptBadge from "./ComplaintAutoAcceptBadge";
import { OrderUiStatusConfigRowPresent } from "../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import { PanelListDenseProductCell } from "../../components/panelList/PanelListDenseProductCell";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnCellClass,
  operationalActionsColumnHeaderClass,
  operationalCheckboxColumnCellClass,
  operationalCheckboxColumnHeaderClass,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseRowSelectedClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";
import { ComplaintsListStatusSidebar, type ComplaintPanelFilter } from "../../components/complaints/ComplaintsListStatusSidebar";
import { ComplaintListFiltersPanel } from "../../components/complaints/ComplaintListFiltersPanel";
import {
  listSellasistInputClass,
  listSellasistTitleAddBtn,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import { usePanelListBulkSelection } from "../../hooks/usePanelListBulkSelection";
import { complaintRawStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";
import { WMS_ROUTES } from "../wms/wmsRoutes";

const complaintsBulkIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-none transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

const ROWS_PER_PAGE = 25;

const DEFECT_TAGS_MAX = 3;

function ComplaintListDefectTags({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  const showIds = ids.slice(0, DEFECT_TAGS_MAX);
  const extra = ids.length - DEFECT_TAGS_MAX;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showIds.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-[12rem] truncate rounded-md bg-slate-100/90 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80"
        >
          {complaintDefectLabel(id)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="rounded-md bg-slate-200/90 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-800">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export default function ComplaintsPanelPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { warehouseId } = useActiveWarehouseContext();

  const [rows, setRows] = useState<ComplaintListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [panelFilter, setPanelFilter] = useState<ComplaintPanelFilter>("all");
  const [statusSummary, setStatusSummary] = useState<{ total: number; byKey: Record<string, number> } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ComplaintListItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("complaints.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [isStatusPanelCollapsed, setIsStatusPanelCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const [bulkSelectMenuKey, setBulkSelectMenuKey] = useState(0);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setShowNew(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadStatusSummary = useCallback(async () => {
    if (warehouseId == null) {
      setStatusSummary(null);
      return;
    }
    try {
      const s = await getComplaintStatusSummary(DAMAGE_TENANT_ID, warehouseId);
      const byKey: Record<string, number> = {};
      for (const row of s.by_status ?? []) {
        byKey[row.status] = row.count;
      }
      setStatusSummary({ total: s.total, byKey });
    } catch {
      setStatusSummary(null);
    }
  }, [warehouseId]);

  const fetchList = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params: Parameters<typeof listComplaints>[0] = {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        limit: ROWS_PER_PAGE,
        offset: (page - 1) * ROWS_PER_PAGE,
        sort_by: "deadline_urgency",
        sort_dir: "desc",
      };
      if (q.trim()) params.q = q.trim();
      if (typeof panelFilter === "object" && panelFilter.kind === "status") {
        params.status = panelFilter.status;
      }
      const { items, total } = await listComplaints(params);
      setRows(items);
      setTotalCount(total);
    } catch {
      setErr("Nie udało się wczytać reklamacji.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, page, q, panelFilter]);

  useEffect(() => {
    void loadStatusSummary();
  }, [loadStatusSummary]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [panelFilter, q]);

  const visibleComplaintIds = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const appliedFiltersKey = useMemo(() => `${panelFilter}:${q}`, [panelFilter, q]);
  const {
    bulkSelectionMode,
    effectiveSelectionCount,
    selectAllFiltered,
    selectAllOnPage,
    toggleOne,
    clearSelection,
    headerChecked,
    headerIndeterminate,
    isRowSelected,
  } = usePanelListBulkSelection({
    visibleIds: visibleComplaintIds,
    clearOnDeps: [page, appliedFiltersKey, warehouseId],
    serverFilteredTotal: totalCount,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE));
  const startRow = totalCount === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1;
  const endRow = Math.min(page * ROWS_PER_PAGE, totalCount);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const max = 5;
    if (totalPages <= max) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    }
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  const countFor = useCallback(
    (code: ComplaintStatusCode) => statusSummary?.byKey[code] ?? "—",
    [statusSummary],
  );

  useEffect(() => {
    if (!actionToast) return;
    const t = window.setTimeout(() => setActionToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [actionToast]);

  const confirmSoftDelete = useCallback(async () => {
    if (deleteTarget == null || warehouseId == null) return;
    setDeletingId(deleteTarget.id);
    setErr(null);
    try {
      const result = await softDeleteComplaint(deleteTarget.id, DAMAGE_TENANT_ID, warehouseId);
      setDeleteTarget(null);
      await loadStatusSummary();
      await fetchList();
      setActionToast(result.mode === "deleted" ? "Reklamacja usunięta" : "Reklamacja zarchiwizowana");
    } catch (e) {
      if (isAxiosError(e)) {
        const data = e.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data != null &&
          "detail" in data &&
          (typeof (data as { detail: unknown }).detail === "string" ||
            typeof (data as { detail: unknown }).detail === "number")
            ? String((data as { detail: string | number }).detail)
            : null;
        setErr(detail ?? (e.response?.status === 409 ? "Reklamacja posiada chronione powiązania" : null) ?? "Nie udało się usunąć reklamacji.");
      } else {
        setErr("Nie udało się usunąć reklamacji.");
      }
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, warehouseId, loadStatusSummary, fetchList]);

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("complaints.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const selectionToolbarDisabled = warehouseId == null || effectiveSelectionCount === 0;

  return (
    <>
      <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
            aria-label="Panel"
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <Link to="/complaints" className="font-medium text-slate-500 transition hover:text-slate-800">
            Reklamacje
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <span className="font-medium text-slate-600">Lista</span>
        </nav>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {warehouseId != null ? (
              <>
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 lg:hidden"
                  onClick={() => setStatusDrawerOpen(true)}
                >
                  Statusy
                </button>
                <aside
                  className={`hidden min-w-0 max-w-full shrink-0 overflow-x-hidden lg:block ${isStatusPanelCollapsed ? "w-14" : "w-[18rem]"}`}
                >
                  <button
                    type="button"
                    onClick={() => setIsStatusPanelCollapsed((v) => !v)}
                    className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100"
                    aria-label={isStatusPanelCollapsed ? "Rozwiń panel statusów" : "Zwiń panel statusów"}
                  >
                    <ChevronLeft className={`h-4 w-4 transition-transform ${isStatusPanelCollapsed ? "rotate-180" : ""}`} />
                  </button>
                  <ComplaintsListStatusSidebar
                    warehouseId={warehouseId}
                    totalCount={statusSummary?.total ?? null}
                    countFor={countFor}
                    panelFilter={panelFilter}
                    onPanelFilterChange={setPanelFilter}
                    chromeVariant="sellasist"
                    collapsed={isStatusPanelCollapsed}
                  />
                </aside>
                {statusDrawerOpen ? (
                  <div className="fixed inset-0 z-[420] flex lg:hidden">
                    <button
                      type="button"
                      className="absolute inset-0 bg-slate-900/45"
                      aria-label="Zamknij panel statusów"
                      onClick={() => setStatusDrawerOpen(false)}
                    />
                    <div className="relative w-[min(20rem,92vw)] overflow-y-auto border-r border-slate-200 bg-white p-2">
                      <ComplaintsListStatusSidebar
                        warehouseId={warehouseId}
                        totalCount={statusSummary?.total ?? null}
                        countFor={countFor}
                        panelFilter={panelFilter}
                        onPanelFilterChange={(f) => {
                          setPanelFilter(f);
                          setStatusDrawerOpen(false);
                        }}
                        chromeVariant="sellasist"
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col space-y-3">
              <div className="flex min-h-10 flex-nowrap items-center justify-between gap-8">
                <div className="flex min-w-0 flex-nowrap items-center gap-2">
                  <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                    Reklamacje
                    {!loading ? <span className="font-normal text-slate-500"> ({totalCount} wyników)</span> : null}
                  </h1>
                  <button
                    type="button"
                    className={`${listSellasistTitleAddBtn} !h-9 !w-9`}
                    title="Nowa reklamacja"
                    aria-label="Nowa reklamacja"
                    onClick={() => setShowNew(true)}
                  >
                    <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  <Link
                    to={WMS_ROUTES.returns}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    WMS
                  </Link>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFiltersExpanded}
                    className={`${listSellasistToolbarToggleBtn} !h-9 whitespace-nowrap`}
                    aria-expanded={filtersExpanded}
                  >
                    {filtersExpanded ? "Ukryj filtry" : "Pokaż filtry"}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9`}
                    title="Sortowanie — wkrótce"
                    aria-label="Sortowanie"
                  >
                    <ArrowUpDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9 cursor-not-allowed opacity-40`}
                    title="Kolumny tabeli — wkrótce"
                    aria-label="Kolumny tabeli"
                  >
                    <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  <details className="relative">
                    <summary
                      className={`${listSellasistToolbarSquareBtn} !h-9 !w-9 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                      aria-label="Więcej opcji"
                    >
                      <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </summary>
                    <div className="absolute right-0 z-50 mt-1 min-w-[13rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                        onClick={() => openFilterFieldsRef.current?.()}
                      >
                        Widoczne pola filtrów
                      </button>
                    </div>
                  </details>
                  <Link
                    to="/settings/complaints/ui-statuses"
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9`}
                    title="Ustawienia statusów reklamacji"
                    aria-label="Ustawienia statusów reklamacji"
                  >
                    <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              </div>

              {warehouseId == null && (
                <div className="rounded-md border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}
                </div>
              )}

              {err && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
              )}

              {warehouseId != null ? (
                <ComplaintListFiltersPanel
                  expanded={filtersExpanded}
                  onToggleExpanded={toggleFiltersExpanded}
                  searchValue={q}
                  onSearchChange={setQ}
                  onApply={() => void fetchList()}
                  onClear={() => {
                    setQ("");
                    setPage(1);
                  }}
                  filterLayout="embedded"
                  openFilterFieldsRef={openFilterFieldsRef}
                />
              ) : null}

              {bulkSelectionMode === "filtered_all" && warehouseId != null ? (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                  Zaznaczono {effectiveSelectionCount} rekordów pasujących do filtrów.{" "}
                  <button
                    type="button"
                    className="font-semibold text-sky-900 underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
                    onClick={() => {
                      clearSelection();
                      setBulkSelectMenuKey((k) => k + 1);
                    }}
                  >
                    Wyczyść zaznaczenie
                  </button>
                </div>
              ) : null}

              {warehouseId != null ? (
                loading ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Ładowanie…
                  </div>
                ) : (
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex min-h-10 w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5">
                      <select
                        key={bulkSelectMenuKey}
                        defaultValue=""
                        aria-label="Opcje zaznaczania listy reklamacji"
                        className={`${listSellasistInputClass} !h-9 max-w-[11rem] shrink-0 text-sm`}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "page") selectAllOnPage();
                          else if (v === "filtered") selectAllFiltered();
                          else if (v === "clear") {
                            clearSelection();
                            setBulkSelectMenuKey((k) => k + 1);
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">Zaznacz…</option>
                        <option value="page">Strona</option>
                        <option value="filtered" disabled={totalCount < 1}>
                          Filtry ({totalCount})
                        </option>
                        <option value="clear">Odznacz</option>
                      </select>
                      {(headerChecked || headerIndeterminate) && (
                        <span className="hidden shrink-0 text-xs text-slate-500 lg:inline" aria-live="polite">
                          {bulkSelectionMode === "filtered_all"
                            ? "Pełny zbiór wg filtrów"
                            : headerChecked
                              ? "Strona"
                              : "Częściowo"}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-slate-500">wykonaj</span>
                      <select
                        disabled
                        aria-label="Wybierz akcję zbiorczą"
                        className={`${listSellasistInputClass} !h-9 max-w-[14rem] shrink-0 text-sm opacity-50`}
                        defaultValue=""
                      >
                        <option value="">Wybierz akcję</option>
                      </select>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 opacity-40"
                      >
                        Wykonaj
                      </button>
                      <span className="shrink-0 text-xs text-slate-400">lub</span>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 opacity-40"
                        title="Wkrótce"
                      >
                        Wykonaj multiakcje
                      </button>
                      <span className="shrink-0 text-xs text-slate-400">lub</span>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Zmień status">
                        <Flag className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Eksport">
                        <Download className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={complaintsBulkIconBtnClass}
                        title="Odśwież listę"
                        aria-label="Odśwież listę"
                        onClick={() => void fetchList()}
                      >
                        <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Import">
                        <Upload className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Drukuj">
                        <Printer className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Dostawa">
                        <Truck className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Wiadomość">
                        <Mail className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <button type="button" disabled className={complaintsBulkIconBtnClass} title="Wkrótce" aria-label="Pin">
                        <Pin className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
                      </button>
                      <Link
                        to={WMS_ROUTES.returns}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        WMS
                      </Link>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 shrink-0 cursor-not-allowed items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-900 opacity-40"
                        title="Usuń — tylko pojedynczo z wiersza"
                      >
                        Usuń
                      </button>
                      <button
                        type="button"
                        disabled={selectionToolbarDisabled}
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                        onClick={() => {
                          clearSelection();
                          setBulkSelectMenuKey((k) => k + 1);
                        }}
                      >
                        Odznacz
                      </button>
                      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                        <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600">
                          <span>Wyników na stronę:</span>
                          <span className="tabular-nums text-slate-800">{ROWS_PER_PAGE}</span>
                        </label>
                      </div>
                    </div>

                    {rows.length === 0 ? (
                      <div className="px-4 py-12 text-center text-sm text-slate-500">
                        <p>Brak reklamacji. Zmień filtr lub utwórz pierwszą reklamację.</p>
                        <button
                          type="button"
                          onClick={() => setShowNew(true)}
                          className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                        >
                          Nowa reklamacja
                        </button>
                      </div>
                    ) : (
                      <div className={panelListDenseTableScrollWrapClass}>
                        <table className={panelListDenseTableClass}>
                          <thead className={panelListDenseTheadClass}>
                            <tr>
                              <th className={operationalCheckboxColumnHeaderClass}>
                                <span className="sr-only">Zaznacz</span>
                              </th>
                              <th className={operationalActionsColumnHeaderClass}>Akcje</th>
                              <th className={`${panelListDenseThBase} text-left`}>Reklamacja</th>
                              <th className={`${panelListDenseThBase} text-left`}>Produkty</th>
                              <th className={`${panelListDenseThBase} text-left`}>Klient</th>
                              <th className={`${panelListDenseThBase} text-right`}>Pozycje</th>
                              <th className={`${panelListDenseThBase} text-right`}>Termin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const statusBrief = complaintRawStatusToPanelBrief(r.status);
                              const img = (r.product_image_url ?? "").trim() || null;
                              const productTitle = (r.product_name ?? "").trim() || (r.title ?? "").trim() || "—";
                              const qtyRaw = r.line_quantity;
                              const qty =
                                qtyRaw != null && Number.isFinite(Number(qtyRaw))
                                  ? Math.max(1, Math.floor(Number(qtyRaw)))
                                  : 1;
                              const defectIds = Array.isArray(r.defect_ids) ? r.defect_ids : [];
                              const reasonFull = (r.customer_reason ?? "").trim();
                              const customerDisp = (r.customer_name ?? "").trim();
                              const phoneDisp = (r.customer_phone ?? "").trim();
                              const emailDisp = (r.customer_email ?? "").trim();
                              const orderLabel =
                                r.order_number != null && String(r.order_number).trim()
                                  ? `Zamówienie #${String(r.order_number).trim()}`
                                  : r.order_id != null
                                    ? `Zamówienie · ID ${r.order_id}`
                                    : null;

                              const goDetail = () => navigate(`/complaints/${r.id}`);
                              const legalAuto = Boolean(r.accepted_by_law || r.auto_accepted);
                              const TD = panelListDenseTdBase;

                              return (
                                <tr
                                  key={r.id}
                                  className={`${panelListDenseRowClass} ${isRowSelected(String(r.id)) ? panelListDenseRowSelectedClass : ""}`}
                                  onClick={() => goDetail()}
                                >
                                  <td className={`${operationalCheckboxColumnCellClass} text-center`} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isRowSelected(String(r.id))}
                                      onChange={(e) =>
                                        toggleOne(String(r.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)
                                      }
                                      className={panelListDenseCheckboxInputClass}
                                      aria-label={`Zaznacz reklamację ${r.id}`}
                                    />
                                  </td>
                                  <td className={operationalActionsColumnCellClass} onClick={(e) => e.stopPropagation()}>
                                    <OperationalActionColumn
                                      aria-label="Akcje reklamacji"
                                      slots={[
                                        <OperationalActionButton
                                          key="eye"
                                          title="Szczegóły"
                                          aria-label="Szczegóły reklamacji"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/complaints/${r.id}`);
                                          }}
                                        >
                                          <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                                        </OperationalActionButton>,
                                        <OperationalActionButton
                                          key="del"
                                          variant="danger"
                                          disabled={deletingId === r.id}
                                          title="Usuń reklamację"
                                          aria-label="Usuń reklamację"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTarget(r);
                                          }}
                                        >
                                          <Trash2 strokeWidth={2} aria-hidden />
                                        </OperationalActionButton>,
                                      ]}
                                    />
                                  </td>
                                  <td className={`${TD} min-w-[14rem] align-top`}>
                                    <div className="flex flex-col gap-1.5 text-left">
                                      <div className="text-xs tabular-nums leading-snug text-slate-500">{formatWhen(r.created_at)}</div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          goDetail();
                                        }}
                                        className="w-fit text-left text-sm font-semibold text-blue-600 hover:underline"
                                      >
                                        #{r.id}
                                      </button>
                                      <OrderUiStatusConfigRowPresent variant="inline" status={statusBrief} />
                                      {r.reference_code ? (
                                        <span className="text-xs tabular-nums text-slate-500">{r.reference_code}</span>
                                      ) : null}
                                      {orderLabel ? <span className="text-xs text-slate-600">{orderLabel}</span> : null}
                                    </div>
                                  </td>
                                  <td className={`${TD} min-w-[12rem] whitespace-normal align-top`}>
                                    <PanelListDenseProductCell
                                      lines={[
                                        {
                                          quantity: qty,
                                          name: productTitle,
                                          ean: r.product_ean ?? null,
                                          sku: r.product_sku ?? null,
                                          image_url: img,
                                        },
                                      ]}
                                      more={0}
                                      lineExtra={() => (
                                        <>
                                          {defectIds.length > 0 ? (
                                            <div className="mt-1.5">
                                              <ComplaintListDefectTags ids={defectIds} />
                                            </div>
                                          ) : null}
                                          {reasonFull ? (
                                            <p
                                              className="mt-1.5 line-clamp-2 break-words text-xs leading-snug text-slate-600"
                                              title={reasonFull}
                                            >
                                              <span className="font-semibold text-slate-700">Powód:</span> {reasonFull}
                                            </p>
                                          ) : null}
                                        </>
                                      )}
                                    />
                                  </td>
                                  <td className={`${TD} min-w-[10rem] whitespace-normal break-words`}>
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <span className="text-sm text-slate-800" title={customerDisp || undefined}>
                                        {customerDisp || "—"}
                                      </span>
                                      {phoneDisp ? (
                                        <p className="flex items-start gap-2 text-xs text-slate-600">
                                          <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                                          <span className="break-all tabular-nums leading-snug">{phoneDisp}</span>
                                        </p>
                                      ) : null}
                                      {emailDisp ? (
                                        <p className="flex items-start gap-2 text-xs leading-snug text-slate-500">
                                          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                                          <span className="break-all">{emailDisp}</span>
                                        </p>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className={`${TD} text-right align-top`}>
                                    {r.lines_count != null && Number(r.lines_count) > 0 ? (
                                      <>
                                        <div className="text-sm font-semibold tabular-nums text-slate-900">{r.lines_count}</div>
                                        <div className="text-xs text-slate-500">poz.</div>
                                      </>
                                    ) : (
                                      <span className="text-sm text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td
                                    className={`${TD} text-right align-top`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex min-w-0 flex-col items-end gap-2">
                                      {legalAuto ? <ComplaintAutoAcceptBadge compact /> : null}
                                      <ComplaintResponseDeadlineBanner
                                        compact
                                        responseDeadline={r.response_deadline}
                                        status={r.status}
                                        autoAccepted={r.auto_accepted}
                                        acceptedByLaw={r.accepted_by_law}
                                        daysRemainingServer={r.response_deadline_days_remaining ?? undefined}
                                        isOverdueServer={r.response_deadline_is_overdue ?? undefined}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {totalCount > 0 ? (
                      <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span className="text-sm font-medium tabular-nums text-slate-600">
                          {startRow}–{endRow} z {totalCount}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                          >
                            Poprzednia
                          </button>
                          {pageNumbers.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPage(n)}
                              className={`min-w-[2rem] rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums ${
                                n === page ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/60"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                          >
                            Następna
                          </button>
                          <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage(totalPages)}
                            className="ml-0.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                          >
                            Ostatnia
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
      </div>

      {warehouseId != null && (
        <NewComplaintWizard
          open={showNew}
          onClose={() => setShowNew(false)}
          warehouseId={warehouseId}
          onCreated={(cid) => {
            void loadStatusSummary();
            void fetchList();
            navigate(`/complaints/${cid}`);
          }}
        />
      )}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => (deletingId == null ? setDeleteTarget(null) : null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="complaint-delete-title" className="text-base font-semibold text-gray-900">
              Delete complaint
            </h3>
            <p className="mt-2 text-sm text-gray-600">Are you sure you want to delete this complaint?</p>
            <p className="mt-1 text-xs text-gray-500">
              Reklamacja #{deleteTarget.id}
              {deleteTarget.reference_code ? ` · ${deleteTarget.reference_code}` : ""} zostanie ukryta (soft delete).
              Rekordy powiązane z historią mogą zostać zarchiwizowane zamiast usunięte — dane pozostają w bazie dla audytu.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deletingId != null}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId != null}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => void confirmSoftDelete()}
              >
                {deletingId != null ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
        >
          {actionToast}
        </div>
      ) : null}
    </>
  );
}
