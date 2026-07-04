import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Columns3, Download, TableProperties } from "lucide-react";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { deleteCustomer, listCustomers, postCustomersBulkDelete, type CustomerListRow } from "../../api/customersApi";
import { CustomerListFiltersPanel } from "../../components/customers/customerList/CustomerListFiltersPanel";
import { CustomersListTable } from "../../components/customers/customerList/CustomersListTable";
import {
  CUSTOMER_LIST_COLUMN_CATALOG,
  CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
  CUSTOMER_LIST_COLUMN_IDS,
  CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
} from "../../components/customers/customerList/customerListColumnCatalog";
import {
  buildCustomerListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import { FilterVisibilityModal, useListColumnLayout } from "../../components/filters";
import {
  DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS,
  triStateToBool,
  type AppliedCustomerListFilters,
} from "../../components/customers/customerList/customerListFilterTypes";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import { oaBtnDanger } from "../../components/orders/automation/orderAutomationUiTokens";
import { UI_STRINGS } from "../../constants/uiStrings";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { summarizeEntityBulkDeleteToast } from "../../types/entityBulkDelete";
import ExportModal from "../../components/exports/ExportModal";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export default function CustomersListPage() {
  const tenantId = DAMAGE_TENANT_ID;
  const listViewAdapter = useMemo(() => buildCustomerListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    appliedFiltersKey,
    page,
    setPage,
    pageSize: rowsPerPage,
    setPageSize: setRowsPerPage,
    filtersExpanded,
    toggleFiltersPanel,
    filterFieldOrder,
    setFilterFieldOrder,
    columnOrder: listViewColumnOrder,
    persistColumnOrder: listViewPersistColumnOrder,
  } = listView;

  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<null | { kind: "bulk" } | { kind: "single"; id: number }>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const { columnOrder, persistColumnOrder } = useListColumnLayout(
    CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
    CUSTOMER_LIST_COLUMN_IDS,
    CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
    { order: listViewColumnOrder, onChange: listViewPersistColumnOrder },
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const af = appliedFilters;
      setRows(
        await listCustomers({
          tenant_id: tenantId,
          search: af.search.trim() || undefined,
          country_code: af.countryCode.trim() || undefined,
          has_orders: triStateToBool(af.hasOrders),
          has_email: triStateToBool(af.hasEmail),
          has_phone: triStateToBool(af.hasPhone),
          created_from: af.dateFrom.trim() || undefined,
          created_to: af.dateTo.trim() || undefined,
          customer_type: af.customerType || undefined,
          sales_channel: af.salesChannel || undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać klientów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, appliedFilters]);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [load, isHydrated]);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [appliedFiltersKey]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const pageRowIds = useMemo(() => paginatedRows.map((r) => r.id), [paginatedRows]);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.has(id));
  const somePageSelected = pageRowIds.some((id) => selected.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = somePageSelected && !allPageSelected;
  }, [somePageSelected, allPageSelected]);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAllPage = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        pageRowIds.forEach((id) => n.delete(id));
      } else {
        pageRowIds.forEach((id) => n.add(id));
      }
      return n;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);
  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

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

  const toggleFiltersExpanded = toggleFiltersPanel;

  const runDelete = async () => {
    if (deleteConfirm == null) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      if (deleteConfirm.kind === "bulk") {
        const ids = selectedIds.filter((id) => visibleIds.includes(id));
        if (ids.length === 0) {
          setDeleteConfirm(null);
          return;
        }
        const res = await postCustomersBulkDelete({ tenant_id: tenantId, ids });
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelected(new Set());
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      } else {
        const res = await deleteCustomer(deleteConfirm.id, tenantId);
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelected((prev) => {
            const n = new Set(prev);
            n.delete(deleteConfirm.id);
            return n;
          });
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      }
    } catch {
      setErr("Nie udało się usunąć klienta.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageLayout fullBleed>
        <PageHeader
          title={`Lista klientów${loading ? "" : ` (${totalCount} wyników)`}`}
          breadcrumbs={[
            { label: UI_STRINGS.navigation.customersList, to: "/customers" },
            { label: "Lista" },
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleFiltersExpanded}
                className={listSellasistToolbarToggleBtn}
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
                onClick={() => setColumnPickerOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Kolumny tabeli"
                aria-label="Kolumny tabeli"
              >
                <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => openFilterFieldsRef.current?.()}
                className={listSellasistToolbarSquareBtn}
                title="Widoczne pola filtrów"
                aria-label="Widoczne pola filtrów"
              >
                <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Eksport CSV"
                aria-label="Eksport CSV"
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
          }
        />

        {err && !loading && rows.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>
        ) : null}

        <CustomerListFiltersPanel
          expanded={filtersExpanded}
          onToggleExpanded={toggleFiltersExpanded}
          draft={draftFilters}
          onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
          onApply={applyFilters}
          onClear={clearFilters}
          filterLayout="embedded"
          openFilterFieldsRef={openFilterFieldsRef}
          listView={listViewActions}
          filterFieldOrder={filterFieldOrder}
          onFilterFieldOrderSave={setFilterFieldOrder}
        />

        {selectedIds.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-800">
              Zaznaczono: <span className="tabular-nums">{selectedIds.length}</span>
            </span>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => setDeleteConfirm({ kind: "bulk" })}
              className={oaBtnDanger}
            >
              Usuń zaznaczone
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => setExportOpen(true)}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              Eksportuj
            </button>
            <button
              type="button"
              disabled
              title="Wkrótce"
              className="inline-flex h-9 shrink-0 cursor-not-allowed items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400 opacity-60"
            >
              Przypisz typ klienta
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => setSelected(new Set())}
              className="ml-auto text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              Odznacz wszystko
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy klientów">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : err ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-amber-900">{err}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-800">Brak klientów</p>
            <p className="mt-1 text-sm text-slate-500">Zmień filtry lub dodaj pierwszego klienta.</p>
            <Link
              to="/customers/new"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {UI_STRINGS.navigation.addCustomer}
            </Link>
          </div>
        ) : (
          <div className={`${moduleTableCardClass} min-w-0`}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <CustomersListTable
                rows={paginatedRows}
                columnOrder={columnOrder}
                selected={selected}
                deleteBusy={deleteBusy}
                allPageSelected={allPageSelected}
                headerSelectAllRef={headerSelectAllRef}
                onToggleOne={toggleOne}
                onToggleAllPage={toggleAllPage}
                onDelete={(id) => setDeleteConfirm({ kind: "single", id })}
              />
              <div className={`${moduleTablePaginationFooterClass} px-4`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-slate-600">
                    {startRow}–{endRow} z {totalCount}
                  </span>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    Na stronę
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                      className={`${listSellasistInputClass} !h-8 w-auto min-w-[4rem] py-0 pr-7 text-sm`}
                    >
                      {ROWS_PER_PAGE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
            </div>
          </div>
        )}
      </PageLayout>

      <FilterVisibilityModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Kolumny listy klientów"
        selectedColumnLabel="Widoczne"
        availableColumnLabel="Dostępne"
        selectedOrder={columnOrder}
        catalog={CUSTOMER_LIST_COLUMN_CATALOG}
        defaultVisibleOrder={CUSTOMER_LIST_DEFAULT_COLUMN_ORDER}
        onSave={persistColumnOrder}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="customers"
        selectedIds={selectedIds.length > 0 ? selectedIds : []}
        fallbackIds={visibleIds}
      />

      <PanelBulkStatusConfirmModal
        open={deleteConfirm != null}
        variant="danger"
        title={deleteConfirm?.kind === "bulk" ? "Usuń zaznaczonych klientów" : "Usuń klienta"}
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirm(null);
        }}
        onConfirm={() => void runDelete()}
      />

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
