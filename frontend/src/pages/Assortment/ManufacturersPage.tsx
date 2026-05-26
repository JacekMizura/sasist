import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { UI_STRINGS } from "../../constants/uiStrings";
import api from "../../api/axios";
import { deleteManufacturer, listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import { ManufacturerEditModal } from "./ManufacturerEditModal";
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
  panelListDenseThSort,
  panelListDenseTheadClass,
} from "../../components/operational";
import PageLayout from "../../components/layout/PageLayout";

type Tenant = { id: number; name: string };

function firstLogoUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (!t) return null;
  const first = t.split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

type UiFilters = {
  name: string;
  country: string;
  status: "all" | "active" | "inactive";
};

const defaultFilters: UiFilters = { name: "", country: "", status: "all" };

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

const MFR_FILTER_STORAGE_KEY = "manufacturers.list";
const MFR_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "tenant", label: "Tenant" },
  { id: "name", label: "Nazwa" },
  { id: "country", label: "Kraj" },
  { id: "status", label: "Status" },
];
const MFR_FILTER_IDS = MFR_FILTER_CATALOG.map((c) => c.id);

type SortKey = "name" | "product_count";

type Props = {
  defaultCreateOpen?: boolean;
};

export default function ManufacturersPage({ defaultCreateOpen = false }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(defaultCreateOpen);
  const [editId, setEditId] = useState<number | null>(null);
  const [rows, setRows] = useState<ManufacturerRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<UiFilters>(defaultFilters);
  const [applied, setApplied] = useState<UiFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [deleteBusy, setDeleteBusy] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [mfrVisibilityOpen, setMfrVisibilityOpen] = useState(false);
  const { order: mfrVisibleFields, setOrderFromModal: setMfrFieldOrder } = useFilterFieldOrder(
    MFR_FILTER_STORAGE_KEY,
    MFR_FILTER_IDS,
  );

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
      setRows(
        await listManufacturers({
          tenantId: tenantId,
          name: applied.name.trim() || undefined,
          country: applied.country.trim() || undefined,
          status: applied.status,
          sortBy,
          sortDir,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać producentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, tenantId, sortBy, sortDir]);

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
    if (defaultCreateOpen) navigate("/manufacturers", { replace: true });
  };

  const openEdit = (id: number) => {
    setEditId(id);
    setModalOpen(true);
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

  const renderMfrFilterField = (fieldId: string, f: UiFilters, setF: Dispatch<SetStateAction<UiFilters>>) => {
    switch (fieldId) {
      case "tenant":
        return (
          <FilterField key={fieldId} label="Tenant">
            <select
              className={filterSelectClass}
              value={tenantId}
              onChange={(e) => {
                setTenantId(Number(e.target.value));
                setPage(1);
              }}
            >
              {tenants.length === 0 ? (
                <option value={tenantId}>Tenant #{tenantId}</option>
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
              type="text"
              className={filterInputClass}
              value={f.name}
              onChange={(e) => setF((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Szukaj po nazwie…"
            />
          </FilterField>
        );
      case "country":
        return (
          <FilterField key={fieldId} label="Kraj">
            <input
              type="text"
              className={filterInputClass}
              value={f.country}
              onChange={(e) => setF((prev) => ({ ...prev, country: e.target.value }))}
              placeholder="np. Polska"
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

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "product_count" ? "desc" : "asc");
    }
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
  const displayRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const Th = ({
    label,
    sortKey,
    align = "left",
  }: {
    label: string;
    sortKey: SortKey;
    align?: "left" | "center";
  }) => (
    <th
      className={`${panelListDenseThSort} ${align === "center" ? "text-center" : "text-left"}`}
      onClick={() => toggleSort(sortKey)}
    >
      {label}
      {sortBy === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

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
              title={UI_STRINGS.navigation.manufacturers}
              description="Słownik producentów, logo na listach oraz skrót do produktów przypisanych do marki."
              breadcrumbs={[
                { label: "Asortyment", to: "/products/list" },
                { label: UI_STRINGS.navigation.manufacturers },
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
              onOpenFieldPicker={() => setMfrVisibilityOpen(true)}
            >
              <FilterGrid>
                {mfrVisibleFields.map((id) => renderMfrFilterField(id, filters, setFilters)).filter(Boolean)}
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
              open={mfrVisibilityOpen}
              onClose={() => setMfrVisibilityOpen(false)}
              title="Widoczne pola — producenci"
              selectedOrder={mfrVisibleFields}
              catalog={MFR_FILTER_CATALOG}
              onSave={setMfrFieldOrder}
            />

            {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600">
          <p>Brak producentów — zmień filtry lub dodaj pierwszego.</p>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
            Aby dodać producenta, rozwiń „Asortyment” w menu bocznym i użyj przycisku „+” przy pozycji „{UI_STRINGS.navigation.manufacturers}”.
          </p>
        </div>
      ) : (
            <div className="min-w-0 overflow-x-auto">
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
                  <th className={`${panelListDenseThBase} w-[4.5rem] text-left`}>Logo</th>
                  <Th label="Nazwa" sortKey="name" />
                  <th className={`${panelListDenseThBase} text-left`}>Kraj</th>
                  <Th label="Produkty" sortKey="product_count" align="center" />
                  <th className={`${panelListDenseThBase} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((m) => {
                  const logo = firstLogoUrl(m.logo_url ?? undefined);
                  return (
                    <tr key={m.id} className={panelListDenseRowClass} onClick={() => openEdit(m.id)}>
                      <td className={panelListDenseActionsOnlyCellClass} onClick={(e) => e.stopPropagation()}>
                        <OperationalActionColumn
                          aria-label="Akcje producenta"
                          slots={[
                            <OperationalActionButton key="edit" onClick={() => openEdit(m.id)} title="Edytuj producenta" aria-label="Edytuj producenta">
                              <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                            </OperationalActionButton>,
                            <OperationalActionButton
                              key="del"
                              variant="danger"
                              disabled={deleteBusy === m.id}
                              onClick={() => void handleDelete(m)}
                              title={
                                m.product_count > 0
                                  ? "Dezaktywuj producenta (są przypisane produkty)"
                                  : "Usuń producenta z bazy"
                              }
                              aria-label={m.product_count > 0 ? "Dezaktywuj producenta" : "Usuń producenta"}
                            >
                              <Trash2 strokeWidth={2} aria-hidden />
                            </OperationalActionButton>,
                          ]}
                        />
                      </td>
                      <td className={`${panelListDenseTdBase} align-top`} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEdit(m.id)}
                          title="Edytuj producenta"
                          className="group flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-slate-200/90 bg-transparent p-0.5 text-left transition hover:border-violet-300 hover:ring-2 hover:ring-violet-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          {logo ? (
                            <img
                              src={logo}
                              alt=""
                              className="max-h-full max-w-full object-contain object-center"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                              }}
                            />
                          ) : (
                            <span className="text-xs text-slate-400 group-hover:text-slate-600">—</span>
                          )}
                        </button>
                      </td>
                      <td className={`${panelListDenseTdBase} min-w-[10rem] align-top`}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                          {(m.company_name?.trim() || m.tax_id?.trim()) ? (
                            <span className="text-xs leading-snug text-slate-500">
                              {[
                                m.company_name?.trim() || null,
                                m.tax_id?.trim() ? `NIP: ${m.tax_id.trim()}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={`${panelListDenseTdBase} align-top text-slate-700`}>{(m.country ?? "").trim() || "—"}</td>
                      <td className={`${panelListDenseTdBase} align-top text-center tabular-nums text-slate-800`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToProductsByManufacturer(m);
                          }}
                          className={`inline-block max-w-full text-center text-sm ${
                            m.product_count > 0
                              ? "font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                              : "cursor-pointer text-slate-500 hover:text-slate-800"
                          }`}
                          title="Otwórz listę produktów z filtrem po tym producencie"
                        >
                          {m.product_count}
                        </button>
                      </td>
                      <td className={`${panelListDenseTdBase} align-top`}>
                        {m.active ? (
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
      </PageLayout>

      <ManufacturerEditModal
        open={modalOpen}
        tenantId={tenantId}
        manufacturerId={editId}
        onClose={closeModal}
        onSaved={() => void load()}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="manufacturers"
        selectedIds={[]}
        fallbackIds={displayRows.map((m) => m.id)}
      />
    </>
  );
}
