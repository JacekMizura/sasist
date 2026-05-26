import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, ShoppingBag, Trash2 } from "lucide-react";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { moduleListTableInteriorClass } from "../../components/listPage/moduleListLayoutTokens";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { UI_STRINGS } from "../../constants/uiStrings";
import api from "../../api/axios";
import { createDelivery } from "../../api/inboundDeliveriesApi";
import { deleteSupplier, listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { SupplierEditModal } from "./SupplierEditModal";
import ExportModal from "../../components/exports/ExportModal";
import {
  FilterField,
  FilterGrid,
  FilterVisibilityModal,
  filterInputClass,
  filterSelectClass,
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../components/filters";
import {
  OperationalActionButton,
  OperationalActionColumn,
  panelListDenseActionsOnlyCellClass,
  panelListDenseActionsOnlyHeaderClass,
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";

type Tenant = { id: number; name: string };

type UiFilters = { name: string; status: "all" | "active" | "inactive" };
const defaultFilters: UiFilters = { name: "", status: "all" };
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100] as const;

const SUPPLIER_FILTER_STORAGE_KEY = "suppliers.list";
const SUPPLIER_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "tenant", label: "Podmiot" },
  { id: "name", label: "Nazwa" },
  { id: "status", label: "Status" },
];
const SUPPLIER_FILTER_IDS = SUPPLIER_FILTER_CATALOG.map((c) => c.id);

type Props = { defaultCreateOpen?: boolean };

const SUPPLIER_BASE = "/suppliers";

export default function SuppliersPage({ defaultCreateOpen = false }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(defaultCreateOpen);
  const [editId, setEditId] = useState<number | null>(null);
  const [rows, setRows] = useState<SupplierRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<UiFilters>(defaultFilters);
  const [applied, setApplied] = useState<UiFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [deleteBusy, setDeleteBusy] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [supplierVisibilityOpen, setSupplierVisibilityOpen] = useState(false);
  const [newOrderBusyId, setNewOrderBusyId] = useState<number | null>(null);
  const { order: supplierVisibleFields, setOrderFromModal: setSupplierFieldOrder } = useFilterFieldOrder(
    SUPPLIER_FILTER_STORAGE_KEY,
    SUPPLIER_FILTER_IDS,
  );

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
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
    setEditId(id);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listSuppliers(tenantId, { name: applied.name.trim() || undefined, status: applied.status }));
    } catch {
      setErr("Nie udało się wczytać dostawców.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setModalOpen(defaultCreateOpen);
    if (defaultCreateOpen) setEditId(null);
  }, [defaultCreateOpen]);

  const closeModal = () => {
    setModalOpen(false);
    setEditId(null);
    if (defaultCreateOpen) navigate(SUPPLIER_BASE, { replace: true });
  };

  const applyFilters = () => {
    setPage(1);
    setApplied(filters);
  };
  const clearFilters = () => {
    setFilters(defaultFilters);
    setApplied(defaultFilters);
    setPage(1);
  };

  const renderSupplierFilterField = (
    fieldId: string,
    f: UiFilters,
    setF: Dispatch<SetStateAction<UiFilters>>,
  ) => {
    switch (fieldId) {
      case "tenant":
        return (
          <FilterField key={fieldId} label="Podmiot">
            <select
              className={filterSelectClass}
              value={tenantId}
              onChange={(e) => {
                setTenantId(Number(e.target.value));
                setPage(1);
              }}
            >
              {tenants.length === 0 ? (
                <option value={tenantId}>#{tenantId}</option>
              ) : (
                tenants.map((tn) => (
                  <option key={tn.id} value={tn.id}>
                    {tn.name}
                  </option>
                ))
              )}
            </select>
          </FilterField>
        );
      case "name":
        return (
          <FilterField key={fieldId} label="Nazwa">
            <input
              className={filterInputClass}
              value={f.name}
              onChange={(e) => setF((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Szukaj…"
            />
          </FilterField>
        );
      case "status":
        return (
          <FilterField key={fieldId} label="Status">
            <select
              className={filterSelectClass}
              value={f.status}
              onChange={(e) => setF((prev) => ({ ...prev, status: e.target.value as UiFilters["status"] }))}
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

  const handleDelete = async (s: SupplierRead) => {
    const msg =
      s.delivery_count > 0
        ? `Dostawca ma ${s.delivery_count} zamówień. Zostanie dezaktywowany. Kontynuować?`
        : `Usunąć dostawcę „${s.name}”?`;
    if (!window.confirm(msg)) return;
    setDeleteBusy(s.id);
    try {
      const r = await deleteSupplier(tenantId, s.id);
      if ("deactivated" in r && r.deactivated) setToast("Dostawca ma zamówienia — oznaczony jako nieaktywny");
      void load();
    } catch {
      setToast("Operacja nie powiodła się.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const handleNewSupplierOrder = async (supplierId: number) => {
    setNewOrderBusyId(supplierId);
    try {
      const d = await createDelivery({ tenant_id: tenantId, supplier_id: supplierId, status: "draft" });
      navigate(`/goods-orders?edit=${d.id}&tenant_id=${tenantId}`);
    } catch {
      setToast("Nie udało się utworzyć szkicu zamówienia do dostawcy.");
    } finally {
      setNewOrderBusyId(null);
    }
  };

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const displayRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

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

            <ListPageHeader
              title={UI_STRINGS.navigation.suppliers}
              breadcrumbs={[
                { label: "Asortyment", to: "/products/list" },
                { label: UI_STRINGS.navigation.suppliers },
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

            <ModuleListFiltersCard
              onClear={clearFilters}
              onApply={applyFilters}
              applyLabel="Filtruj"
              clearLabel="Wyczyść filtry"
              showFieldPicker
              onOpenFieldPicker={() => setSupplierVisibilityOpen(true)}
            >
              <FilterGrid>
                {supplierVisibleFields.map((id) => renderSupplierFilterField(id, filters, setFilters)).filter(Boolean)}
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
            <FilterVisibilityModal
              open={supplierVisibilityOpen}
              onClose={() => setSupplierVisibilityOpen(false)}
              title="Widoczne pola — dostawcy"
              selectedOrder={supplierVisibleFields}
              catalog={SUPPLIER_FILTER_CATALOG}
              onSave={setSupplierFieldOrder}
            />

            {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600">
          <p>Brak dostawców.</p>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
            Aby dodać dostawcę, rozwiń „Asortyment” w menu bocznym i użyj przycisku „+” przy pozycji „{UI_STRINGS.navigation.suppliers}”.
          </p>
        </div>
      ) : (
            <div className={moduleListTableInteriorClass}>
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <span className="text-sm text-slate-600">Pokaż na stronie</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
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
                  <th className={panelListDenseActionsOnlyHeaderClass}>Akcje</th>
                  <th className={`${panelListDenseThBase} text-left`}>Nazwa</th>
                  <th className={`${panelListDenseThBase} text-left`}>Waluta</th>
                  <th className={`${panelListDenseThBase} text-left`}>Wysyłka</th>
                  <th className={`${panelListDenseThBase} text-left`}>MOQ</th>
                  <th className={`${panelListDenseThBase} text-right`}>Zamówienia</th>
                  <th className={`${panelListDenseThBase} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((s) => (
                  <tr key={s.id} className={panelListDenseRowClass}>
                    <td className={panelListDenseActionsOnlyCellClass} onClick={(e) => e.stopPropagation()}>
                      <OperationalActionColumn
                        aria-label="Akcje dostawcy"
                        slots={[
                          <OperationalActionButton
                            key="order"
                            variant="accent"
                            disabled={newOrderBusyId === s.id}
                            onClick={() => void handleNewSupplierOrder(s.id)}
                            title="Nowe zamówienie"
                            aria-label="Nowe zamówienie"
                          >
                            <ShoppingBag className="shrink-0" strokeWidth={2} aria-hidden />
                          </OperationalActionButton>,
                          <OperationalActionButton
                            key="edit"
                            onClick={() => {
                              setEditId(s.id);
                              setModalOpen(true);
                            }}
                            title="Edytuj"
                            aria-label="Edytuj"
                          >
                            <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                          </OperationalActionButton>,
                          <OperationalActionButton
                            key="del"
                            variant="danger"
                            disabled={deleteBusy === s.id}
                            onClick={() => void handleDelete(s)}
                            title="Usuń / dezaktywuj"
                            aria-label="Usuń"
                          >
                            <Trash2 strokeWidth={2} aria-hidden />
                          </OperationalActionButton>,
                        ]}
                      />
                    </td>
                    <td className={`${panelListDenseTdBase} align-top`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                      {(s.company_name?.trim() || s.tax_id?.trim()) ? (
                        <span className="text-xs leading-snug text-slate-500">
                          {[
                            s.company_name?.trim() || null,
                            s.tax_id?.trim() ? `NIP: ${s.tax_id.trim()}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={`${panelListDenseTdBase} text-sm text-slate-700`}>{(s.default_currency ?? "").trim() || "—"}</td>
                  <td className={`${panelListDenseTdBase} align-top`}>
                    <div className="flex flex-col gap-1">
                      {s.offers_free_shipping === false ? (
                        <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                          Tylko płatna dostawa
                        </span>
                      ) : (
                        <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-950 ring-1 ring-sky-200">
                          Darmowa dostawa możliwa
                        </span>
                      )}
                      {s.offers_free_shipping !== false && s.free_shipping_threshold != null ? (
                        <span className="text-xs tabular-nums text-slate-500">
                          od {s.free_shipping_threshold.toFixed(2)} {(s.default_currency ?? "").trim() || "PLN"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={`${panelListDenseTdBase} align-top`}>
                    <div className="flex flex-col gap-1">
                      {s.requires_moq === false ? (
                        <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
                          Bez MOQ
                        </span>
                      ) : (
                        <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200">
                          MOQ wymagane
                        </span>
                      )}
                      {s.requires_moq !== false ? (
                        <span className="text-xs text-slate-500">
                          {(() => {
                            const cur = (s.default_currency ?? "").trim() || "PLN";
                            const parts: string[] = [];
                            if (s.minimum_order_qty != null) parts.push(`${s.minimum_order_qty} szt.`);
                            if (s.minimum_order_value != null)
                              parts.push(`min. ${s.minimum_order_value.toFixed(2)} ${cur}`);
                            return parts.length > 0 ? parts.join(" · ") : "—";
                          })()}
                        </span>
                      ) : null}
                    </div>
                  </td>
                    <td className={`${panelListDenseTdBase} text-right tabular-nums text-sm`}>{s.delivery_count}</td>
                    <td className={panelListDenseTdBase}>
                      {s.active ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
                        Aktywny
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                        Nieaktywny
                      </span>
                    )}
                  </td>
                </tr>
              ))}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border bg-white px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
            </div>
      )}

      <SupplierEditModal
        open={modalOpen}
        tenantId={tenantId}
        supplierId={editId}
        onClose={closeModal}
        onSaved={() => void load()}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="suppliers"
        selectedIds={[]}
        fallbackIds={displayRows.map((s) => s.id)}
      />
    </>
  );
}
