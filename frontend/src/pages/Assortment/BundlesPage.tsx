import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Package, Pencil, Printer, Trash2 } from "lucide-react";
import { AppEmptyState } from "../../components/app-shell";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { moduleListTableInteriorClass } from "../../components/listPage/moduleListLayoutTokens";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { UI_STRINGS } from "../../constants/uiStrings";
import { deleteBundle, listBundles, postBundlesBulkDelete, type BundleRead } from "../../api/bundlesApi";
import { summarizeEntityBulkDeleteToast } from "../../types/entityBulkDelete";
import { BundleLabelPrintModal } from "./BundleLabelPrintModal";
import ExportModal from "../../components/exports/ExportModal";
import {
  FilterField,
  FilterGrid,
  FilterNumberRange,
  FilterVisibilityModal,
  filterInputClass,
  filterSelectClass,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../components/filters";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnCellClass,
  operationalActionsColumnHeaderClass,
  operationalCheckboxColumnCellClass,
  operationalCheckboxColumnHeaderClass,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";
import PageLayout from "../../components/layout/PageLayout";

const DEFAULT_TENANT_ID = 1;

const BUNDLE_FILTER_STORAGE_KEY = "bundles.list.v2";
const BUNDLE_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "name", label: "Nazwa" },
  { id: "ean_sku", label: "EAN / SKU" },
  { id: "stock_range", label: "Stan zestawu" },
  { id: "price_range", label: "Cena (zł)" },
  { id: "status", label: "Status" },
];
const BUNDLE_FILTER_IDS = BUNDLE_FILTER_CATALOG.map((c) => c.id);

/** Pierwszy URL z pola zdjęć — jak w ProductList */
function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  const first = trimmed
    .split(";")
    .map((s) => s.trim())
    .find(Boolean);
  return first || null;
}

type UiFilters = {
  name: string;
  eanSku: string;
  stockMin: string;
  stockMax: string;
  priceMin: string;
  priceMax: string;
  status: "all" | "active" | "inactive";
};

const defaultFilters: UiFilters = {
  name: "",
  eanSku: "",
  stockMin: "",
  stockMax: "",
  priceMin: "",
  priceMax: "",
  status: "active",
};

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

function formatPriceZl(b: BundleRead): string {
  const v = b.sale_price;
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

function bundleStockBreakdownTooltip(b: BundleRead): string {
  if (!b.items.length) return "Brak składników";
  const lines = b.items.map((it) => {
    const nm = (it.product_name ?? `Produkt #${it.product_id}`).trim();
    const qty = Math.max(1, Math.floor(it.quantity));
    const st = it.product_stock ?? 0;
    const per = Math.floor(st / qty);
    return `${nm} — stan ${st} ÷ ${qty} = ${per} zest.`;
  });
  return `Możliwe zestawy: ${b.calculated_stock ?? 0}\n\n${lines.join("\n")}`;
}

export default function BundlesPage() {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState<BundleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<UiFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<UiFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [printBundleId, setPrintBundleId] = useState<number | null>(null);
  const [previewBundle, setPreviewBundle] = useState<BundleRead | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("bundles.list.filtersExpanded") !== "0";
    } catch {
      return true;
    }
  });
  const [bundleVisibilityOpen, setBundleVisibilityOpen] = useState(false);
  const { order: bundleVisibleFields, setOrderFromModal: setBundleFieldOrder } = useFilterFieldOrder(
    BUNDLE_FILTER_STORAGE_KEY,
    BUNDLE_FILTER_IDS,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<null | { kind: "bulk" } | { kind: "single"; id: number }>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const priceMin = appliedFilters.priceMin.trim()
        ? Number.parseFloat(appliedFilters.priceMin.replace(",", "."))
        : undefined;
      const priceMax = appliedFilters.priceMax.trim()
        ? Number.parseFloat(appliedFilters.priceMax.replace(",", "."))
        : undefined;
      const stockMin = appliedFilters.stockMin.trim()
        ? Number.parseInt(appliedFilters.stockMin, 10)
        : undefined;
      const stockMax = appliedFilters.stockMax.trim()
        ? Number.parseInt(appliedFilters.stockMax, 10)
        : undefined;
      setBundles(
        await listBundles({
          tenantId: DEFAULT_TENANT_ID,
          name: appliedFilters.name.trim() || undefined,
          eanSku: appliedFilters.eanSku.trim() || undefined,
          activeFilter: appliedFilters.status,
          priceMin: Number.isFinite(priceMin!) ? priceMin : undefined,
          priceMax: Number.isFinite(priceMax!) ? priceMax : undefined,
          stockMin: Number.isFinite(stockMin!) ? stockMin : undefined,
          stockMax: Number.isFinite(stockMax!) ? stockMax : undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać zestawów.");
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [appliedFilters]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openEdit = (id: number) => navigate(`/bundles/${id}/edit`);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("bundles.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const renderBundleFilterField = (fieldId: string, f: UiFilters, setF: Dispatch<SetStateAction<UiFilters>>) => {
    switch (fieldId) {
      case "name":
        return (
          <FilterField key={fieldId} label="Nazwa">
            <input
              type="text"
              className={filterInputClass}
              value={f.name}
              onChange={(e) => setF((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Szukaj po nazwie…"
            />
          </FilterField>
        );
      case "ean_sku":
        return (
          <FilterField key={fieldId} label="EAN / SKU">
            <input
              type="text"
              className={filterInputClass}
              value={f.eanSku}
              onChange={(e) => setF((prev) => ({ ...prev, eanSku: e.target.value }))}
              placeholder="EAN lub symbol…"
            />
          </FilterField>
        );
      case "stock_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Stan zestawu"
            min={f.stockMin}
            max={f.stockMax}
            onMinChange={(v) => setF((prev) => ({ ...prev, stockMin: v }))}
            onMaxChange={(v) => setF((prev) => ({ ...prev, stockMax: v }))}
            step={1}
          />
        );
      case "price_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Cena (zł)"
            min={f.priceMin}
            max={f.priceMax}
            onMinChange={(v) => setF((prev) => ({ ...prev, priceMin: v }))}
            onMaxChange={(v) => setF((prev) => ({ ...prev, priceMax: v }))}
            step={0.01}
          />
        );
      case "status":
        return (
          <FilterField key={fieldId} label="Status">
            <select
              className={filterSelectClass}
              value={f.status}
              onChange={(e) =>
                setF((prev) => ({ ...prev, status: e.target.value as UiFilters["status"] }))
              }
            >
              <option value="all">Wszystkie</option>
              <option value="active">Aktywne</option>
              <option value="inactive">Nieaktywne</option>
            </select>
          </FilterField>
        );
      default:
        return null;
    }
  };

  const totalCount = bundles.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const displayRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return bundles.slice(start, start + rowsPerPage);
  }, [bundles, page, rowsPerPage]);

  const displayRowIds = useMemo(() => displayRows.map((b) => b.id), [displayRows]);
  const allPageSelected = displayRowIds.length > 0 && displayRowIds.every((id) => selectedIds.has(id));
  const somePageSelected = displayRowIds.some((id) => selectedIds.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = somePageSelected && !allPageSelected;
  }, [somePageSelected, allPageSelected]);

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        displayRowIds.forEach((id) => n.delete(id));
      } else {
        displayRowIds.forEach((id) => n.add(id));
      }
      return n;
    });
  };

  const selectedSorted = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b), [selectedIds]);

  const runDeleteBundles = async () => {
    if (deleteConfirm == null) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      if (deleteConfirm.kind === "bulk") {
        const ids = selectedSorted.filter((id) => bundles.some((b) => b.id === id));
        if (ids.length === 0) {
          setDeleteConfirm(null);
          return;
        }
        const res = await postBundlesBulkDelete({ tenant_id: DEFAULT_TENANT_ID, ids });
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelectedIds(new Set());
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      } else {
        const res = await deleteBundle(DEFAULT_TENANT_ID, deleteConfirm.id);
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelectedIds((prev) => {
            const n = new Set(prev);
            n.delete(deleteConfirm.id);
            return n;
          });
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      }
    } catch {
      setErr("Nie udało się usunąć zestawów.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  return (
    <>
      <PageLayout fullBleed>
            <ListPageHeader
              title={UI_STRINGS.navigation.bundles}
              breadcrumbs={[
                { label: "Asortyment", to: "/products/list" },
                { label: UI_STRINGS.navigation.bundles },
              ]}
              actions={
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Eksport
                </button>
              }
            />

            <div>
          <ModuleListFiltersCard
              expanded={filtersExpanded}
              onToggleExpanded={toggleFiltersExpanded}
              onClear={clearFilters}
              onApply={applyFilters}
              applyLabel="Filtruj"
              clearLabel="Wyczyść filtry"
              showFieldPicker
              onOpenFieldPicker={() => setBundleVisibilityOpen(true)}
          >
                <FilterGrid>
                  {bundleVisibleFields.map((id) => renderBundleFilterField(id, filters, setFilters)).filter(Boolean)}
                </FilterGrid>
            <FilterVisibilityModal
              open={bundleVisibilityOpen}
              onClose={() => setBundleVisibilityOpen(false)}
              title="Widoczne pola — zestawy"
              selectedOrder={bundleVisibleFields}
              catalog={BUNDLE_FILTER_CATALOG}
              onSave={setBundleFieldOrder}
            />
          </ModuleListFiltersCard>
            </div>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {selectedSorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 py-1">
          <span className="text-sm font-semibold text-slate-900">Zaznaczono: {selectedSorted.length}</span>
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => setDeleteConfirm({ kind: "bulk" })}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Usuń zaznaczone
          </button>
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Odznacz wszystko
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : bundles.length === 0 ? (
        <AppEmptyState
          icon={Package}
          title="Brak zestawów"
          description="Zmień filtry lub utwórz pierwszy zestaw produktów."
          action={
            <Link
              to="/bundles/new"
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"
            >
              {UI_STRINGS.navigation.addBundle}
            </Link>
          }
        />
      ) : (
        <div className={`${moduleListTableInteriorClass} min-w-0`}>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-slate-600">Pokaż na stronie</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className={panelListDenseTableScrollWrapClass}>
            <table className={panelListDenseTableClass}>
              <thead className={panelListDenseTheadClass}>
                <tr>
                  <th className={operationalCheckboxColumnHeaderClass}>
                    <input
                      ref={headerSelectAllRef}
                      type="checkbox"
                      checked={allPageSelected}
                      disabled={deleteBusy || displayRows.length === 0}
                      onChange={toggleSelectPage}
                      className={panelListDenseCheckboxInputClass}
                      aria-label="Zaznacz wszystkie zestawy na stronie"
                    />
                  </th>
                  <th className={operationalActionsColumnHeaderClass}>Akcje</th>
                  <th className={`${panelListDenseThBase} text-left`}>Zdjęcie</th>
                  <th className={`${panelListDenseThBase} text-left`}>Nazwa</th>
                  <th className={`${panelListDenseThBase} text-left`}>EAN / SKU</th>
                  <th className={`${panelListDenseThBase} text-right`}>Cena</th>
                  <th className={`${panelListDenseThBase} text-left`}>Stan</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((b) => {
                  const imgUrl = firstImageUrl(b.image_url ?? undefined);
                  const stockVal = b.calculated_stock ?? 0;
                  const nComp = b.items.length;
                  return (
                    <tr key={b.id} className={panelListDenseRowClass}>
                      <td className={`${operationalCheckboxColumnCellClass} text-center`} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(b.id)}
                          disabled={deleteBusy}
                          onChange={() => toggleSelectOne(b.id)}
                          className={panelListDenseCheckboxInputClass}
                          aria-label={`Zaznacz zestaw ${b.name}`}
                        />
                      </td>
                      <td className={operationalActionsColumnCellClass} onClick={(e) => e.stopPropagation()}>
                        <OperationalActionColumn
                          aria-label="Akcje zestawu"
                          slots={[
                            <OperationalActionButton
                              key="print"
                              onClick={() => setPrintBundleId(b.id)}
                              title="Drukuj etykietę"
                              aria-label="Drukuj etykietę"
                            >
                              <Printer className="text-slate-600" strokeWidth={2} />
                            </OperationalActionButton>,
                            <OperationalActionButton
                              key="eye"
                              onClick={() => setPreviewBundle(b)}
                              title="Podgląd składu"
                              aria-label="Podgląd składu"
                            >
                              <Eye className="text-slate-600" strokeWidth={2} />
                            </OperationalActionButton>,
                            <OperationalActionButton key="edit" onClick={() => openEdit(b.id)} title="Edytuj zestaw" aria-label="Edytuj zestaw">
                              <Pencil className="text-slate-600" strokeWidth={2} />
                            </OperationalActionButton>,
                            <OperationalActionButton
                              key="del"
                              variant="danger"
                              disabled={deleteBusy}
                              onClick={() => setDeleteConfirm({ kind: "single", id: b.id })}
                              title="Usuń zestaw"
                              aria-label="Usuń zestaw"
                            >
                              <Trash2 strokeWidth={2} />
                            </OperationalActionButton>,
                          ]}
                        />
                      </td>
                      <td className={`${panelListDenseTdBase} align-top`}>
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200/90 bg-transparent p-0.5">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt=""
                              className="max-h-full max-w-full object-contain object-center"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                              }}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className={`${panelListDenseTdBase} min-w-[8rem] align-top`}>
                        <div className="flex flex-col gap-1">
                          <Link
                            to={`/bundles/${b.id}/edit`}
                            className="text-[13px] font-medium text-slate-900 hover:text-slate-700 hover:underline"
                          >
                            {b.name}
                          </Link>
                          {!b.active ? (
                            <span className="inline-flex w-fit max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                              Nieaktywny
                            </span>
                          ) : null}
                          <span
                            className="w-fit text-xs text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2"
                            title={bundleStockBreakdownTooltip(b)}
                          >
                            {nComp} składnik{nComp === 1 ? "" : nComp < 5 ? "i" : "ów"}
                          </span>
                        </div>
                      </td>
                      <td className={`${panelListDenseTdBase} align-top`}>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="tabular-nums text-slate-800">{(b.ean ?? "").trim() || "—"}</span>
                          <span className="truncate text-xs text-slate-500" title={(b.sku ?? "").trim()}>
                            {(b.sku ?? "").trim() || "—"}
                          </span>
                        </div>
                      </td>
                      <td className={`${panelListDenseTdBase} align-top text-right tabular-nums text-slate-800`}>
                        {formatPriceZl(b)}
                      </td>
                      <td className={`${panelListDenseTdBase} align-top`}>
                        <span
                          className={`text-sm ${stockVal === 0 ? "font-medium text-red-600" : "text-slate-800"}`}
                          title={bundleStockBreakdownTooltip(b)}
                        >
                          {`${stockVal} szt.`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalCount > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-600">
              <span>
                {startRow}–{endRow} z {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                  className="rounded border bg-white px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Poprzednia
                </button>
                <span className="py-1">
                  Strona {page} z {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                  className="rounded border bg-white px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </PageLayout>

      <BundleLabelPrintModal bundleId={printBundleId} tenantId={DEFAULT_TENANT_ID} onClose={() => setPrintBundleId(null)} />

      {previewBundle != null ? (
        <div
          className="fixed inset-0 z-[255] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewBundle(null)}
        >
          <div
            className="max-h-[min(90vh,32rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">{previewBundle.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Stan zestawu: <span className="font-semibold text-slate-800">{previewBundle.calculated_stock ?? 0} szt.</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {previewBundle.items.map((it) => {
                const qty = Math.max(1, Math.floor(it.quantity));
                const st = it.product_stock ?? 0;
                const per = Math.floor(st / qty);
                return (
                  <li key={it.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <div className="font-medium text-slate-800">{(it.product_name ?? `Produkt #${it.product_id}`).trim()}</div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      W zestawie: {qty} · Stan: {st} → max {per} zest.
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-slate-200 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setPreviewBundle(null)}
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : null}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={DEFAULT_TENANT_ID}
        entityType="sets"
        selectedIds={[]}
        fallbackIds={displayRows.map((b) => b.id)}
      />

      <PanelBulkStatusConfirmModal
        open={deleteConfirm != null}
        variant="danger"
        title={deleteConfirm?.kind === "bulk" ? "Usuń zaznaczone zestawy" : "Usuń zestaw"}
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirm(null);
        }}
        onConfirm={() => void runDeleteBundles()}
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
