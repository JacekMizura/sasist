import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Download, TableProperties } from "lucide-react";

import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { UI_STRINGS } from "../../constants/uiStrings";
import api from "../../api/axios";
import { deleteManufacturer, listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import ExportModal from "../../components/exports/ExportModal";
import PageLayout from "../../components/layout/PageLayout";
import { FilterVisibilityModal } from "../../components/filters";
import { ManufacturerListFiltersPanel } from "../../components/manufacturers/manufacturerList/ManufacturerListFiltersPanel";
import { ManufacturersListTable } from "../../components/manufacturers/manufacturerList/ManufacturersListTable";
import {
  MANUFACTURER_LIST_COLUMN_CATALOG,
  MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
} from "../../components/manufacturers/manufacturerList/manufacturerListColumnCatalog";
import {
  DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
  countActiveManufacturerFilters,
  manufacturerFilterToggleLabel,
  type AppliedManufacturerListFilters,
} from "../../components/manufacturers/manufacturerList/manufacturerListFilterTypes";
import { useManufacturerListColumnOrder } from "../../components/manufacturers/manufacturerList/useManufacturerListColumnOrder";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";

type Tenant = { id: number; name: string };

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export default function ManufacturersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<ManufacturerRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<AppliedManufacturerListFilters>(
    DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
  );
  const [appliedFilters, setAppliedFilters] = useState<AppliedManufacturerListFilters>(
    DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
  );
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("manufacturers.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [deleteBusy, setDeleteBusy] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const { columnOrder, persistColumnOrder } = useManufacturerListColumnOrder();

  const appliedFiltersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);
  const activeFilterCount = useMemo(() => countActiveManufacturerFilters(appliedFilters), [appliedFilters]);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) {
          setTenantId(list[0].id);
        }
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  useEffect(() => {
    const edit = searchParams.get("edit");
    if (edit == null || edit === "") return;
    const id = Number(edit);
    if (!Number.isFinite(id) || id < 1) return;
    const tid = searchParams.get("tenant_id");
    void navigate(`/manufacturers/${id}${tid ? `?tenant_id=${tid}` : ""}`, { replace: true });
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const af = appliedFilters;
      setRows(
        await listManufacturers({
          tenantId,
          name: af.name.trim() || undefined,
          country: af.country.trim() || undefined,
          taxId: af.nip.trim() || undefined,
          city: af.city.trim() || undefined,
          email: af.email.trim() || undefined,
          phone: af.phone.trim() || undefined,
          supplier: af.supplier.trim() || undefined,
          status: af.status,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać producentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [appliedFiltersKey, tenantId]);

  const openEdit = (id: number) => {
    void navigate(`/manufacturers/${id}?tenant_id=${tenantId}`);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS);
    setAppliedFilters(DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS);
  };

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("manufacturers.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const handleDelete = async (m: ManufacturerRead) => {
    const msg =
      m.product_count > 0
        ? `Producent ma ${m.product_count} produkt(ów). Zostanie oznaczony jako nieaktywny. Kontynuować?`
        : `Usunąć producenta „${m.name}”?`;
    if (!window.confirm(msg)) return;
    setDeleteBusy(m.id);
    try {
      const r = await deleteManufacturer(tenantId, m.id);
      if ("deactivated" in r && r.deactivated) {
        setToast("Producent ma przypisane produkty – został dezaktywowany");
      }
      void load();
    } catch {
      setToast("Operacja nie powiodła się.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const goToProductsByManufacturer = (m: ManufacturerRead) => {
    const q = new URLSearchParams();
    q.set("manufacturer_id", String(m.id));
    q.set("tenant_id", String(tenantId));
    navigate(`/products/list?${q.toString()}`);
  };

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

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selectedIds = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[300] max-w-md -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <PageLayout fullBleed>
        <ListPageHeader
          title={`${UI_STRINGS.navigation.manufacturers}${loading ? "" : ` (${totalCount} wyników)`}`}
          description="Słownik producentów, logo na listach oraz skrót do produktów przypisanych do marki."
          breadcrumbs={[
            { label: "Asortyment", to: "/products/list" },
            { label: UI_STRINGS.navigation.manufacturers },
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleFiltersExpanded}
                className={listSellasistToolbarToggleBtn}
                aria-expanded={filtersExpanded}
              >
                {filtersExpanded ? "Ukryj filtry" : manufacturerFilterToggleLabel(activeFilterCount)}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => setColumnPickerOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Widoczne pola"
                aria-label="Widoczne pola"
              >
                <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Eksport"
                aria-label="Eksport"
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
          }
        />

        <ManufacturerListFiltersPanel
          expanded={filtersExpanded}
          draft={draftFilters}
          onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
          onApply={applyFilters}
          onClear={clearFilters}
          tenants={tenants}
          tenantId={tenantId}
          onTenantChange={(id) => {
            setTenantId(id);
            setPage(1);
          }}
        />

        {err && !loading && rows.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>
        ) : null}

        {loading ? (
          <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy producentów">
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
            <p className="text-sm font-medium text-slate-800">Brak producentów</p>
            <p className="mt-1 text-sm text-slate-500">Zmień filtry lub dodaj pierwszego producenta.</p>
            <p className="mt-3 max-w-md mx-auto text-xs leading-relaxed text-slate-500">
              Aby dodać producenta, rozwiń „Asortyment” w menu bocznym i użyj przycisku „+” przy pozycji „
              {UI_STRINGS.navigation.manufacturers}”.
            </p>
          </div>
        ) : (
          <div className={`${moduleTableCardClass} min-w-0`}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ManufacturersListTable
                rows={paginatedRows}
                columnOrder={columnOrder}
                selected={selected}
                deleteBusy={deleteBusy}
                allPageSelected={allPageSelected}
                headerSelectAllRef={headerSelectAllRef}
                onToggleOne={toggleOne}
                onToggleAllPage={toggleAllPage}
                onEdit={openEdit}
                onDelete={(m) => void handleDelete(m)}
                onProductsClick={goToProductsByManufacturer}
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
        title="Kolumny listy producentów"
        selectedColumnLabel="Widoczne"
        availableColumnLabel="Dostępne"
        selectedOrder={columnOrder}
        catalog={MANUFACTURER_LIST_COLUMN_CATALOG}
        defaultVisibleOrder={MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER}
        onSave={persistColumnOrder}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="manufacturers"
        selectedIds={selectedIds.length > 0 ? selectedIds : []}
        fallbackIds={visibleIds}
      />
    </>
  );
}
