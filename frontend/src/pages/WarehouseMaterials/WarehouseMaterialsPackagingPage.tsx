import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Pencil, Trash2 } from "lucide-react";
import {
  bulkSetPackagingMaterialSupplier,
  deletePackagingMaterial,
  duplicatePackagingMaterial,
  getPackagingMaterials,
  patchPackagingMaterialStock,
  type PackagingMaterialDto,
} from "../../api/packagingMaterialsApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  moduleListDataCardClass,
  moduleListFiltersWrapClass,
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
  wmCardRowClass,
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

const TYPE_LABELS: Record<string, string> = {
  tape: "Taśma (legacy)",
  foil: "Folia (legacy)",
  filler: "Wypełniacz (legacy)",
  stretch_foil: "Folia stretch",
  packing_tape: "Taśma pakowa",
  paper_filler: "Wypełniacz papierowy",
  bubble_wrap: "Folia bąbelkowa",
  courier_envelope: "Koperta kurierska",
  label_roll: "Rolka etykiet",
  other: "Inne",
};

const UNIT_LABELS: Record<string, string> = {
  roll: "rolka",
  kg: "kg",
  pcs: "szt.",
};

type ActiveFilter = "all" | "active" | "inactive";
type SortKey = "name" | "stock" | "supplier" | "net";

type DraftFilters = {
  type: string;
  supplierId: string;
  active: ActiveFilter;
  stockLow: boolean;
  sort: SortKey;
  search: string;
};

const defaultDraft: DraftFilters = {
  type: "",
  supplierId: "",
  active: "all",
  stockLow: false,
  sort: "name",
  search: "",
};

function StockEditor({
  row,
  tenantId,
  warehouseId,
  onSaved,
}: {
  row: PackagingMaterialDto;
  tenantId: number;
  warehouseId: number;
  onSaved: () => void;
}) {
  const [val, setVal] = useState(String(row.stock));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setVal(String(row.stock));
  }, [row.stock, row.id]);

  const commit = async () => {
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setVal(String(row.stock));
      return;
    }
    if (Math.abs(n - row.stock) < 1e-9) return;
    setBusy(true);
    try {
      await patchPackagingMaterialStock(row.id, { tenant_id: tenantId, warehouse_id: warehouseId }, n);
      onSaved();
    } catch {
      setVal(String(row.stock));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        className={`h-9 w-24 rounded-[5px] border border-slate-200/95 bg-white px-2 text-[13px] tabular-nums text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300/40`}
        value={val}
        disabled={busy}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onClick={(e) => e.stopPropagation()}
        inputMode="decimal"
      />
      <span className="text-xs font-medium text-slate-500">{UNIT_LABELS[row.unit] ?? row.unit}</span>
    </div>
  );
}

export default function WarehouseMaterialsPackagingPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [draft, setDraft] = useState<DraftFilters>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(defaultDraft);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<PackagingMaterialDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(applied.search.trim()), 280);
    return () => window.clearTimeout(h);
  }, [applied.search]);

  useEffect(() => {
    void listSuppliers(DAMAGE_TENANT_ID, { status: "all" }).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const activeOnly = applied.active === "active";
      const data = await getPackagingMaterials({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        material_type: applied.type || null,
        active_only: activeOnly,
        q: debouncedSearch || null,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setErr("Nie udało się wczytać materiałów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, applied.type, applied.active, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkSupplierId("");
  }, [warehouseId, applied.type, applied.active, applied.supplierId, applied.stockLow, applied.sort, debouncedSearch]);

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
      await bulkSetPackagingMaterialSupplier(
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

  const displayRows = useMemo(() => {
    let list = [...rows];
    if (applied.active === "inactive") list = list.filter((r) => !r.is_active);
    if (applied.supplierId.trim()) {
      const sid = Number(applied.supplierId);
      if (Number.isFinite(sid)) list = list.filter((r) => r.supplier_id === sid);
    }
    if (applied.stockLow) {
      list = list.filter((r) => {
        const th = r.low_stock_threshold;
        if (th == null || !Number.isFinite(Number(th))) return false;
        return Number(r.stock) <= Number(th);
      });
    }
    const sk = applied.sort;
    list.sort((a, b) => {
      if (sk === "stock") return Number(b.stock) - Number(a.stock);
      if (sk === "supplier") {
        const sa = (a.supplier_name || "").toLowerCase();
        const sb = (b.supplier_name || "").toLowerCase();
        return sa.localeCompare(sb, "pl");
      }
      if (sk === "net") {
        const na = a.unit_net_price ?? -1;
        const nb = b.unit_net_price ?? -1;
        return Number(na) - Number(nb);
      }
      return a.name.localeCompare(b.name, "pl");
    });
    return list;
  }, [rows, applied.active, applied.supplierId, applied.stockLow, applied.sort]);

  const applyFilters = () => {
    setApplied(draft);
  };
  const clearFilters = () => {
    setDraft(defaultDraft);
    setApplied(defaultDraft);
  };

  const onDuplicate = async (e: React.MouseEvent, r: PackagingMaterialDto) => {
    e.stopPropagation();
    if (warehouseId == null) return;
    setDupBusy(r.id);
    try {
      const d = await duplicatePackagingMaterial(r.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      await load();
      navigate(`/warehouse-materials/packaging/${d.id}`);
    } catch {
      setErr("Nie udało się zduplikować.");
    } finally {
      setDupBusy(null);
    }
  };

  const onDelete = async (e: React.MouseEvent, r: PackagingMaterialDto) => {
    e.stopPropagation();
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć „${r.name}”?`)) return;
    try {
      await deletePackagingMaterial(r.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      await load();
    } catch {
      setErr("Nie udało się usunąć.");
    }
  };

  const openRow = (id: string) => {
    navigate(`/warehouse-materials/packaging/${id}`);
  };

  return (
    <>
      <ListPageHeader
        title="Materiały pakowe"
        description={
          <>
            Taśmy, folie i pozostałe materiały eksploatacyjne
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
          { label: "Materiały magazynowe", to: "/warehouse-materials/packaging" },
          { label: "Pakowe" },
        ]}
        actions={
          <Link
            to="/warehouse-materials/packaging/new"
            onClick={(e) => {
              if (warehouseId == null) e.preventDefault();
            }}
            className={`inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 ${warehouseId == null ? "pointer-events-none opacity-40" : ""}`}
            aria-disabled={warehouseId == null}
          >
            Dodaj materiał pakowy
          </Link>
        }
      />

      <div className={moduleListFiltersWrapClass}>
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
              <FilterField label="Typ">
                <select
                  className={filterSelectClass}
                  value={draft.type}
                  onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="">Wszystkie</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Dostawca">
                <select
                  className={filterSelectClass}
                  value={draft.supplierId}
                  onChange={(e) => setDraft((p) => ({ ...p, supplierId: e.target.value }))}
                >
                  <option value="">Wszyscy</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
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
              <FilterField label="Stan">
                <label className="flex cursor-pointer items-center gap-2 pt-1.5 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={draft.stockLow}
                    onChange={(e) => setDraft((p) => ({ ...p, stockLow: e.target.checked }))}
                  />
                  Niski stan (≤ próg)
                </label>
              </FilterField>
              <FilterField label="Sortowanie">
                <select
                  className={filterSelectClass}
                  value={draft.sort}
                  onChange={(e) => setDraft((p) => ({ ...p, sort: e.target.value as SortKey }))}
                >
                  <option value="name">Nazwa A–Z</option>
                  <option value="stock">Stan malejąco</option>
                  <option value="supplier">Dostawca A–Z</option>
                  <option value="net">Cena netto / j.u.</option>
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
          <p>{rows.length === 0 ? "Brak materiałów pakowych." : "Brak pozycji spełniających kryteria."}</p>
          {rows.length === 0 ? (
            <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
              Nowy materiał dodasz przyciskiem „Dodaj materiał pakowy” w nagłówku powyżej (dział Materiały magazynowe nie korzysta z przycisku „+” w menu bocznym).
            </p>
          ) : null}
        </div>
      ) : warehouseId != null ? (
        <div className={moduleListDataCardClass}>
          {displayRows.map((r) => {
            const img = (r.image_url || "").trim();
            const typeLabel = TYPE_LABELS[r.material_type] ?? r.material_type;
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                className={`${wmCardRowClass} cursor-pointer hover:bg-slate-50/90`}
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
                      aria-label="Akcje materiału pakowego"
                      slots={[
                        <OperationalActionLink
                          key="edit"
                          to={`/warehouse-materials/packaging/${r.id}`}
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
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold text-slate-400">
                          brak
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{r.name}</p>
                      <span className={wmTypeBadgeClass}>{typeLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-3 xl:grid-cols-6">
                  <div>
                    <p className={wmLabelClass}>Stan</p>
                    <div onClick={(e) => e.stopPropagation()}>
                      <StockEditor
                        row={r}
                        tenantId={DAMAGE_TENANT_ID}
                        warehouseId={warehouseId}
                        onSaved={() => void load()}
                      />
                    </div>
                  </div>
                  <div>
                    <p className={wmLabelClass}>Dostawca</p>
                    <p className="truncate font-medium text-slate-800">{r.supplier_name?.trim() || "—"}</p>
                  </div>
                  <div>
                    <p className={wmLabelClass}>Netto / j.u.</p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatWmMoneyZloty(r.unit_net_price)}</p>
                  </div>
                  <div>
                    <p className={wmLabelClass}>Brutto / j.u.</p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatWmMoneyZloty(r.unit_gross_price)}</p>
                  </div>
                  <div>
                    <p className={wmLabelClass}>MOQ</p>
                    <p className="font-medium tabular-nums text-slate-800">
                      {r.moq != null && Number.isFinite(Number(r.moq)) ? String(r.moq).replace(".", ",") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={wmLabelClass}>Ostatnia cena netto</p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {formatWmMoneyZloty(r.last_purchase_price_net)}
                    </p>
                  </div>
                  <div className="col-span-2 lg:col-span-3 xl:col-span-2">
                    <p className={wmLabelClass}>Status</p>
                    <p className="text-sm font-semibold text-slate-800">{r.is_active ? "Aktywny" : "Nieaktywny"}</p>
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
    </>
  );
}
