import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { ChevronRight, Eye, Phone, Trash2 } from "lucide-react";

import { getComplaintStatusSummary, listComplaints, softDeleteComplaint } from "../../api/complaintsApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import type { ComplaintListItem } from "../../types/complaint";
import { COMPLAINT_SIDEBAR_FILTER_LABELS_PL, normalizeComplaintStatus, type ComplaintStatusCode } from "../../types/complaint";
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
import { ComplaintsListBulkBar } from "../../components/complaints/ComplaintsListBulkBar";
import { ComplaintsListToolbar } from "../../components/complaints/ComplaintsListToolbar";
import {
  ModuleFilteredAllBanner,
  ModuleListBreadcrumb,
  ModuleStatusSidebarShell,
  ModuleTableCard,
  moduleListContentColumnClass,
  moduleListTwoColumnShellClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { usePanelListBulkSelection } from "../../hooks/usePanelListBulkSelection";
import { complaintRawStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";

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

  const activeFilterLabel = useMemo(() => {
    if (panelFilter === "all") return "Wszystkie";
    return COMPLAINT_SIDEBAR_FILTER_LABELS_PL[panelFilter.status];
  }, [panelFilter]);

  return (
    <>
      <ModuleListBreadcrumb items={[{ label: "Reklamacje", to: "/complaints" }, { label: "Lista" }]} />

      <div className={moduleListTwoColumnShellClass}>
        {warehouseId != null ? (
          <ModuleStatusSidebarShell
            collapsed={isStatusPanelCollapsed}
            onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
            mobileOpenLabel="Statusy panelu"
            statusDrawerOpen={statusDrawerOpen}
            onStatusDrawerOpenChange={setStatusDrawerOpen}
            sidebar={
              <ComplaintsListStatusSidebar
                warehouseId={warehouseId}
                totalCount={statusSummary?.total ?? null}
                countFor={countFor}
                panelFilter={panelFilter}
                onPanelFilterChange={setPanelFilter}
                chromeVariant="sellasist"
                collapsed={isStatusPanelCollapsed}
                parentScrollContainer
                onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
              />
            }
            mobileDrawerSidebar={
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
            }
          />
        ) : null}

        <div className={moduleListContentColumnClass}>
          <ComplaintsListToolbar
            loading={loading}
            resultCount={totalCount}
            activeFilterLabel={activeFilterLabel}
            filtersExpanded={filtersExpanded}
            onToggleFilters={toggleFiltersExpanded}
            openFilterFieldsRef={openFilterFieldsRef}
            onNewComplaint={() => setShowNew(true)}
          />

          {warehouseId == null ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}
            </div>
          ) : null}

          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

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
            <ModuleFilteredAllBanner
              count={effectiveSelectionCount}
              onClear={() => {
                clearSelection();
                setBulkSelectMenuKey((k) => k + 1);
              }}
            />
          ) : null}

          {warehouseId != null ? (
            loading ? (
              <div className="py-12 text-center text-sm text-slate-500">Ładowanie…</div>
            ) : (
              <ModuleTableCard
                bulkBar={
                  <ComplaintsListBulkBar
                    bulkSelectMenuKey={bulkSelectMenuKey}
                    filteredTotalCount={totalCount}
                    effectiveSelectionCount={effectiveSelectionCount}
                    bulkSelectionMode={bulkSelectionMode}
                    headerChecked={headerChecked}
                    headerIndeterminate={headerIndeterminate}
                    selectionToolbarDisabled={selectionToolbarDisabled}
                    onSelectPage={selectAllOnPage}
                    onSelectFiltered={selectAllFiltered}
                    onClearSelection={clearSelection}
                    onSelectMenuBump={() => setBulkSelectMenuKey((k) => k + 1)}
                    onRefresh={() => void fetchList()}
                  />
                }
                footer={
                  totalCount > 0 ? (
                    <div className={moduleTablePaginationFooterClass}>
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
                  ) : null
                }
              >
                {rows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-slate-500">
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
              </ModuleTableCard>
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
