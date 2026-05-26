import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { bulkSetCartonSupplier, deleteCarton, duplicateCarton, getCartons, type CartonDto } from "../../api/cartonsApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { ShippingMethodBadgeRow } from "../../components/wms/packing/PackingCartonHints";
import ExportModal from "../../components/exports/ExportModal";
import {
  moduleListTableInteriorClass,
} from "../../components/listPage/moduleListLayoutTokens";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import {
  FilterField,
  FilterGrid,
  filterInputClass,
  filterSelectClass,
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "../../components/filters";
import { formatWmMoneyZloty } from "../../modules/warehouseMaterials/warehouseMaterialsMoney";
import {
  wmLabelClass,
  wmPrimaryBtnClass,
  wmStatusActiveClass,
  wmStatusInactiveClass,
  wmTypeBadgeClass,
} from "../../modules/warehouseMaterials/warehouseMaterialsUi";
import {
  OperationalActionButton,
  OperationalActionColumn,
  OperationalActionLink,
} from "../../components/operational";

type ActiveFilter = "all" | "active" | "inactive";
type SortKey = "name" | "stock" | "net";

type DraftFilters = {
  active: ActiveFilter;
  sort: SortKey;
  search: string;
};

const defaultDraft: DraftFilters = { active: "all", sort: "name", search: "" };

function thumbUrl(url: string | null | undefined): string | null {
  const u = (url || "").trim();
  return u || null;
}

export default function CartonsListPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [draft, setDraft] = useState<DraftFilters>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(defaultDraft);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<CartonDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(applied.search.trim()), 280);
    return () => window.clearTimeout(h);
  }, [applied.search]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getCartons({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        active_only: applied.active === "active",
        q: debouncedSearch || null,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setErr("Nie udało się wczytać kartonów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, applied.active, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listSuppliers(DAMAGE_TENANT_ID, { status: "all" }).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkSupplierId("");
  }, [warehouseId, applied.active, applied.sort, debouncedSearch]);

  const displayRows = useMemo(() => {
    let list = [...rows];
    if (applied.active === "inactive") list = list.filter((r) => !r.is_active);
    const sk = applied.sort;
    list.sort((a, b) => {
      if (sk === "stock") return Number(b.stock) - Number(a.stock);
      if (sk === "net") {
        const na = a.unit_net_price ?? -1;
        const nb = b.unit_net_price ?? -1;
        return Number(na) - Number(nb);
      }
      return a.name.localeCompare(b.name, "pl");
    });
    return list;
  }, [rows, applied.active, applied.sort]);

  const applyFilters = () => setApplied(draft);
  const clearFilters = () => {
    setDraft(defaultDraft);
    setApplied(defaultDraft);
  };

  const onDuplicate = async (e: React.MouseEvent, r: CartonDto) => {
    e.stopPropagation();
    if (warehouseId == null) return;
    setDupBusy(r.id);
    setErr(null);
    try {
      const created = await duplicateCarton(r.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      await load();
      navigate(`/warehouse-materials/cartons/${created.id}`);
    } catch {
      setErr("Nie udało się zduplikować kartonu.");
    } finally {
      setDupBusy(null);
    }
  };

  const onDelete = async (e: React.MouseEvent, r: CartonDto) => {
    e.stopPropagation();
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć karton „${r.name}”?`)) return;
    setErr(null);
    try {
      await deleteCarton(r.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      await load();
    } catch {
      setErr("Nie udało się usunąć.");
    }
  };

  const openRow = (id: string) => {
    navigate(`/warehouse-materials/cartons/${id}`);
  };

  const applyBulkSupplier = async () => {
    if (warehouseId == null || selectedIds.size === 0) return;
    const sid = bulkSupplierId.trim() ? parseInt(bulkSupplierId, 10) : NaN;
    if (!Number.isFinite(sid) || sid < 1) {
      window.alert("Wybierz dostawcę z listy.");
      return;
    }
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkSetCartonSupplier(
        { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
        { ids: [...selectedIds], supplier_id: sid },
      );
      setSelectedIds(new Set());
      await load();
    } catch {
      setErr("Nie udało się ustawić dostawcy dla zaznaczonych.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
          <ListPageHeader
            title="Kartony i opakowania"
            description={
              <>
                {warehouseId != null && !loading ? (
                  <>
                    {" "}
                    · <span className="font-medium text-slate-600">{displayRows.length}</span> wyników
                  </>
                ) : null}
                .
              </>
            }
            breadcrumbs={[
              { label: "Asortyment", to: "/products/list" },
              { label: "Materiały magazynowe", to: "/warehouse-materials/cartons" },
              { label: "Kartony" },
            ]}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link
                  to="/warehouse-materials/cartons/new"
                  onClick={(e) => {
                    if (warehouseId == null) e.preventDefault();
                  }}
                  className={`inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 ${warehouseId == null ? "pointer-events-none opacity-40" : ""}`}
                  aria-disabled={warehouseId == null}
                >
                  Dodaj karton
                </Link>
                <button
                  type="button"
                  disabled={warehouseId == null}
                  onClick={() => setExportOpen(true)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  Eksport
                </button>
              </div>
            }
          />

          <div>
        <ModuleListFiltersCard
            onClear={clearFilters}
            onApply={applyFilters}
            applyLabel="Filtruj"
            clearLabel="Wyczyść filtry"
        >
            <FilterGrid>
              <FilterField label="Szukaj">
                <input
                  className={filterInputClass}
                  value={draft.search}
                  onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
                  placeholder="Nazwa lub SKU…"
                />
              </FilterField>
              <FilterField label="Status">
                <select
                  className={filterSelectClass}
                  value={draft.active}
                  onChange={(e) => setDraft((p) => ({ ...p, active: e.target.value as ActiveFilter }))}
                >
                  <option value="all">Wszystkie</option>
                  <option value="active">Aktywne</option>
                  <option value="inactive">Nieaktywne</option>
                </select>
              </FilterField>
              <FilterField label="Sortowanie">
                <select
                  className={filterSelectClass}
                  value={draft.sort}
                  onChange={(e) => setDraft((p) => ({ ...p, sort: e.target.value as SortKey }))}
                >
                  <option value="name">Nazwa A–Z</option>
                  <option value="stock">Stan malejąco</option>
                  <option value="net">Cena netto / szt.</option>
                </select>
              </FilterField>
            </FilterGrid>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2.5 sm:hidden">
              <button type="button" onClick={clearFilters} className={filterToolbarBtnSecondary}>
                Wyczyść filtry
              </button>
              <button type="button" onClick={applyFilters} className={filterToolbarBtnApply}>
                Filtruj
              </button>
            </div>
        </ModuleListFiltersCard>
          </div>

      {warehouseId == null ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Wybierz magazyn w pasku u góry.
        </div>
      ) : null}

      {err ? <p className="mb-3 text-sm font-medium text-red-600">{err}</p> : null}

      {warehouseId != null && selectedIds.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 py-1 text-sm">
          <span className="font-semibold text-violet-950">Zaznaczono: {selectedIds.size}</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
            value={bulkSupplierId}
            onChange={(e) => setBulkSupplierId(e.target.value)}
          >
            <option value="">— wybierz dostawcę —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void applyBulkSupplier()}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            Ustaw dostawcę dla zaznaczonych
          </button>
          <button
            type="button"
            className="text-xs font-medium text-slate-600 underline"
            onClick={() => setSelectedIds(new Set())}
          >
            Wyczyść zaznaczenie
          </button>
        </div>
      ) : null}

      {warehouseId != null && loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : warehouseId != null && displayRows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600">
          <p>{rows.length === 0 ? "Brak kartonów." : "Brak kartonów spełniających kryteria."}</p>
          {rows.length === 0 ? (
            <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
              Nowy karton dodasz przyciskiem „Dodaj karton” w nagłówku powyżej (dział Materiały magazynowe nie korzysta z przycisku „+” w menu bocznym).
            </p>
          ) : null}
        </div>
      ) : warehouseId != null ? (
        <div className={`${moduleListTableInteriorClass} min-h-0 flex-1 overflow-hidden`}>
          {displayRows.map((r) => {
            const img = thumbUrl(r.image_url);
            const cat = (r.material_type || "Karton").trim() || "Karton";
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                className="flex w-full flex-col gap-3 border-b border-slate-100 p-4 text-left last:border-b-0 hover:bg-slate-50/90 sm:flex-row sm:items-stretch sm:gap-4 sm:p-5"
                onClick={() => openRow(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openRow(r.id);
                  }
                }}
              >
                <div className="flex min-w-0 shrink-0 flex-col gap-3 sm:w-[min(38%,280px)] sm:flex-row sm:items-start">
                  <div className="flex shrink-0 items-start gap-2" onClick={(e) => e.stopPropagation()}>
                    <label className="flex cursor-pointer items-start pt-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          });
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        aria-label="Zaznacz wiersz"
                      />
                    </label>
                    <OperationalActionColumn
                      aria-label="Akcje kartonu"
                      slots={[
                        <OperationalActionLink
                          key="edit"
                          to={`/warehouse-materials/cartons/${r.id}`}
                          title="Edytuj"
                          aria-label="Edytuj"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                        </OperationalActionLink>,
                        <OperationalActionButton
                          key="dup"
                          disabled={dupBusy === r.id}
                          title="Duplikuj"
                          aria-label="Duplikuj"
                          onClick={(e) => void onDuplicate(e, r)}
                        >
                          <Copy className="text-slate-600" strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                        <OperationalActionButton key="del" variant="danger" title="Usuń" aria-label="Usuń" onClick={(e) => void onDelete(e, r)}>
                          <Trash2 strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                      ]}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-[72px] sm:w-[72px]">
                      {img ? (
                        <img src={img} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold text-slate-400">brak</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{r.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{r.sku?.trim() || "— SKU"}</p>
                      <span className={`${wmTypeBadgeClass} mt-1`}>{cat}</span>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-3 xl:grid-cols-6">
                    <div>
                      <p className={wmLabelClass}>Wymiary</p>
                      <p className="font-medium tabular-nums text-slate-800">
                        {r.length_cm} × {r.width_cm} × {r.height_cm} cm
                      </p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>Stan</p>
                      <p className="font-semibold tabular-nums text-slate-900">{r.stock ?? 0} szt.</p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>Netto / szt.</p>
                      <p className="font-mono font-semibold tabular-nums text-slate-900">{formatWmMoneyZloty(r.unit_net_price)}</p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>Brutto / szt.</p>
                      <p className="font-mono font-semibold tabular-nums text-slate-900">{formatWmMoneyZloty(r.unit_gross_price)}</p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>MOQ</p>
                      <p className="font-medium tabular-nums text-slate-800">
                        {r.moq != null && Number.isFinite(Number(r.moq)) ? String(r.moq).replace(".", ",") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>Ostatnia cena netto</p>
                      <p className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatWmMoneyZloty(r.last_purchase_price_net)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className={wmLabelClass}>Dostawca</p>
                      <p className="truncate text-sm font-medium text-slate-800">{r.supplier_name?.trim() || "—"}</p>
                    </div>
                    <div>
                      <p className={wmLabelClass}>Status</p>
                      <p className="text-sm font-semibold text-slate-800">{r.is_active ? "Aktywny" : "Nieaktywny"}</p>
                    </div>
                  </div>
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <ShippingMethodBadgeRow methods={r.shipping_methods} />
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44 sm:items-end">
                  {r.is_active ? <span className={wmStatusActiveClass}>Aktywny</span> : <span className={wmStatusInactiveClass}>Nieaktywny</span>}
                  <button
                    type="button"
                    className={`${wmPrimaryBtnClass} w-full sm:w-auto`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRow(r.id);
                    }}
                  >
                    Szczegóły
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={DAMAGE_TENANT_ID}
        entityType="cartons"
        selectedIds={[]}
        fallbackIds={rows.map((r) => r.id)}
      />
    </>
  );
}
