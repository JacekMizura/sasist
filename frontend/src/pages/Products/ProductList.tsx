import { useEffect, useState, useCallback } from "react";
import api from "../../api/axios";
import { useTranslation } from "../../locales";
import type { AssignedLocation } from "../../types/warehouse";
import { ProductEditModal } from "./ProductEditModal";
import { LocationMappingExportImport } from "./LocationMappingExportImport";
import { ProductInWarehouseModal } from "./ProductInWarehouseModal";

type Tenant = { id: number; name: string };

type Product = {
  id: number;
  tenant_id?: number;
  name?: string;
  ean?: string;
  symbol?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  purchase_price?: number;
  manufacturer?: string | null;
  unit?: string | null;
  image_url?: string;
  /** Assigned warehouse positions (locationUUID + quantity). API may return assigned_locations. */
  assignedLocations?: AssignedLocation[];
  /** Real inventory locations from inventory table (source of truth for display). */
  locations?: { name: string; quantity: number; warehouse_id?: number }[];
  /** Label template for product labels (saved_label_templates.id). Used when generating product labels. */
  label_template_id?: number | null;
  /** Sum of inventory.quantity for this product (tenant); 0 if no inventory rows. */
  stock_quantity?: number;
  /** Total quantity sold in last 30 days (from order_items). */
  sales_30d?: number;
  /** Average daily sales last 30 days: sales_30d / 30. */
  rotation_30d?: number;
  /** Stock coverage: current_stock / rotation_30d (days); null when rotation_30d is 0. */
  days_of_stock?: number | null;
};

/** Pierwszy URL z pola "Zdjęcia" – .split(';')[0] */
function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  const first = trimmed.split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

function volumeDm3(p: Product): number | null {
  if (p.volume != null && p.volume > 0) return p.volume;
  const l = p.length ?? 0, w = p.width ?? 0, h = p.height ?? 0;
  if (l && w && h) return (l * w * h) / 1000;
  return null;
}

type Filters = {
  ean: string;
  name: string;
  symbol: string;
  volumeMin: string;
  volumeMax: string;
  weightMin: string;
  weightMax: string;
};

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
type SortKey = "id" | "name" | "ean" | "symbol" | "volume" | "weight";

const defaultFilters: Filters = {
  ean: "", name: "", symbol: "", volumeMin: "", volumeMax: "", weightMin: "", weightMax: "",
};

export default function ProductList() {
  const t = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null | "new">(null);
  const [printProduct, setPrintProduct] = useState<Product | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [productTemplates, setProductTemplates] = useState<{ id: number; name: string }[]>([]);
  const [printTemplateId, setPrintTemplateId] = useState<number | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [printGenerating, setPrintGenerating] = useState(false);
  const [printPreviewSvg, setPrintPreviewSvg] = useState<string | null>(null);
  const [printPreviewLoading, setPrintPreviewLoading] = useState(false);
  const [showRandomizeModal, setShowRandomizeModal] = useState(false);
  const [randomizeWarehouseId, setRandomizeWarehouseId] = useState<number | "">("");
  const [randomizeResult, setRandomizeResult] = useState<{
    products_processed: number;
    assigned_successfully: number;
    failed_assignments: number;
  } | null>(null);
  const [randomizeLoading, setRandomizeLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [productForWarehouse, setProductForWarehouse] = useState<Product | null>(null);

  useEffect(() => {
    api.get<Tenant[]>("/tenants/").then((res) => setTenants(Array.isArray(res.data) ? res.data : [])).catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    if (showRandomizeModal) {
      api.get<{ id: number; name: string }[]>("/warehouses/").then((r) => setWarehouses(Array.isArray(r.data) ? r.data : [])).catch(() => setWarehouses([]));
    }
  }, [showRandomizeModal]);

  useEffect(() => {
    if (showRandomizeModal && warehouses.length > 0 && randomizeWarehouseId === "") {
      setRandomizeWarehouseId(warehouses[0].id);
    }
  }, [showRandomizeModal, warehouses, randomizeWarehouseId]);

  useEffect(() => {
    api.get<{ id: number; name: string }[]>("/labels/templates/by-type/product", { params: { tenant_id: 1 } })
      .then((res) => setProductTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProductTemplates([]));
  }, []);

  useEffect(() => {
    if (printProduct == null) return;
    setPrintQuantity(1);
    const preferred = printProduct.label_template_id ?? null;
    if (preferred != null) setPrintTemplateId(preferred);
    else if (productTemplates.length > 0) setPrintTemplateId(productTemplates[0].id);
    else setPrintTemplateId(null);
  }, [printProduct?.id, productTemplates]);

  useEffect(() => {
    if (printTemplateId == null) {
      setPrintPreviewSvg(null);
      setPrintPreviewLoading(false);
      return;
    }
    setPrintPreviewLoading(true);
    setPrintPreviewSvg(null);
    api
      .get<{ svg: string }>(`/label-templates/${printTemplateId}/preview`, { params: { tenant_id: 1 } })
      .then((res) => setPrintPreviewSvg(res.data?.svg ?? null))
      .catch(() => setPrintPreviewSvg(null))
      .finally(() => setPrintPreviewLoading(false));
  }, [printTemplateId]);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantFilter != null) params.set("tenant_id", String(tenantFilter));
    const f = appliedFilters;
    if (f.ean.trim()) params.set("ean", f.ean.trim());
    if (f.name.trim()) params.set("name", f.name.trim());
    if (f.symbol.trim()) params.set("symbol", f.symbol.trim());
    if (f.volumeMin.trim()) params.set("volume_min", f.volumeMin.trim());
    if (f.volumeMax.trim()) params.set("volume_max", f.volumeMax.trim());
    if (f.weightMin.trim()) params.set("weight_min", f.weightMin.trim());
    if (f.weightMax.trim()) params.set("weight_max", f.weightMax.trim());
    params.set("limit", String(rowsPerPage));
    params.set("offset", String((page - 1) * rowsPerPage));
    if (sortBy) params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);

    api
      .get(`/products/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const raw = data?.items ?? (Array.isArray(data) ? data : []);
        const list = raw.map((p: Record<string, unknown>) => ({
          ...p,
          id: Number(p.id),
          assignedLocations: Array.isArray(p.assigned_locations)
            ? (p.assigned_locations as AssignedLocation[])
            : Array.isArray(p.assignedLocations)
              ? (p.assignedLocations as AssignedLocation[])
              : undefined,
          locations: Array.isArray(p.locations)
            ? (p.locations as { name: string; quantity: number; warehouse_id?: number }[])
            : undefined,
        })) as Product[];
        const total = typeof data?.total === "number" ? data.total : list.length;
        setProducts(list);
        setTotalCount(total);
      })
      .catch(() => console.log("Błąd pobierania produktów"))
      .finally(() => setLoading(false));
  }, [appliedFilters, page, rowsPerPage, sortBy, sortDir, tenantFilter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const applyFilters = () => { setPage(1); setAppliedFilters(filters); };
  const clearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortBy(key);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size >= products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map((p) => p.id)));
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const firstProduct = products.find((p) => selectedIds.has(p.id));
    const tid = tenantFilter ?? firstProduct?.tenant_id ?? undefined;
    const qs = tid != null ? `?tenant_id=${tid}&ids=` : `?ids=`;
    try {
      await api.delete(`/products/bulk${qs}${Array.from(selectedIds).join(",")}`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const openRandomizeModal = () => {
    setRandomizeResult(null);
    setRandomizeWarehouseId("");
    setShowRandomizeModal(true);
  };

  const runRandomizeLocations = async () => {
    const whId = typeof randomizeWarehouseId === "number" ? randomizeWarehouseId : null;
    if (whId == null) return;
    const tenantId = tenantFilter ?? 1;
    setRandomizeLoading(true);
    setRandomizeResult(null);
    try {
      const { data } = await api.post<{
        products_processed: number;
        assigned_successfully: number;
        failed_assignments: number;
      }>(`/products/randomize-locations/${whId}`, { tenant_id: tenantId });
      setRandomizeResult(data ?? null);
      fetchProducts();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Błąd";
      alert(msg);
    } finally {
      setRandomizeLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);
  const isPackable = (p: Product) =>
    p.length && p.width && p.height && (p.volume != null || (p.length && p.width && p.height));

  const Th = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th
      className="py-4 px-4 cursor-pointer select-none hover:bg-slate-100"
      onClick={() => toggleSort(sortKey)}
    >
      {label}
      {sortBy === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Tenant</span>
            <select
              value={tenantFilter ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setTenantFilter(v === "" ? null : Number(v));
                setPage(1);
              }}
              className="border rounded px-2 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">All tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">EAN</span>
            <input type="text" value={filters.ean} onChange={(e) => setFilters((f) => ({ ...f, ean: e.target.value }))} placeholder="Szukaj EAN..." className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Nazwa</span>
            <input type="text" value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} placeholder="Nazwa..." className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Symbol / SKU</span>
            <input type="text" value={filters.symbol} onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))} placeholder="Symbol..." className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Objętość min (dm³)</span>
            <input type="number" min={0} step={0.01} value={filters.volumeMin} onChange={(e) => setFilters((f) => ({ ...f, volumeMin: e.target.value }))} placeholder="Min" className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Objętość max (dm³)</span>
            <input type="number" min={0} step={0.01} value={filters.volumeMax} onChange={(e) => setFilters((f) => ({ ...f, volumeMax: e.target.value }))} placeholder="Max" className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Waga min</span>
            <input type="number" min={0} step={0.01} value={filters.weightMin} onChange={(e) => setFilters((f) => ({ ...f, weightMin: e.target.value }))} placeholder="Min" className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Waga max</span>
            <input type="number" min={0} step={0.01} value={filters.weightMax} onChange={(e) => setFilters((f) => ({ ...f, weightMax: e.target.value }))} placeholder="Max" className="border rounded px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={applyFilters} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Filtruj</button>
          <button type="button" onClick={clearFilters} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Wyczyść</button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-amber-800">Zaznaczono: {selectedIds.size}</span>
          <button type="button" onClick={bulkDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50">
            {deleting ? "Usuwanie…" : "Usuń zaznaczone"}
          </button>
        </div>
      )}

      {loading ? (
        <div>Ładowanie...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50/80">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">{t.rowsPerPage ?? "Pokaż na stronie"}</span>
              <button
                type="button"
                onClick={() => setEditProduct("new")}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700"
              >
                + Dodaj produkt
              </button>
              <LocationMappingExportImport
                products={products}
                fetchProducts={fetchProducts}
              />
              <button
                type="button"
                onClick={openRandomizeModal}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100"
              >
                Randomize product locations
              </button>
            </div>
            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
              {ROWS_PER_PAGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="py-4 px-4 w-10 rounded-tl-xl">
                  <input type="checkbox" checked={products.length > 0 && selectedIds.size === products.length} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="py-4 px-4 w-20">{t.photo ?? "Zdjęcie"}</th>
                <Th label="Nazwa" sortKey="name" />
                <Th label="EAN" sortKey="ean" />
                <Th label="Symbol" sortKey="symbol" />
                <th className="py-4 px-4">{t.dimensionsLWH ?? "Wymiary (D/S/W)"}</th>
                <Th label="Objętość (dm³)" sortKey="volume" />
                <Th label="Waga" sortKey="weight" />
                <th className="py-4 px-4">Stan</th>
                <th className="py-4 px-4">Rotacja (30 dni)</th>
                <th className="py-4 px-4">Pokrycie zapasu</th>
                <th className="py-4 px-4">Lokalizacje</th>
                <th className="py-4 px-4">Akcje</th>
                <th className="py-4 px-4 rounded-tr-xl">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={13} className="p-6 text-center text-slate-500">Brak produktów do wyświetlenia.</td></tr>
              ) : (
                products.map((p) => {
                  const vol = volumeDm3(p);
                  const imgUrl = firstImageUrl(p.image_url);
                  const invLocs = p.locations ?? [];
                  const locLabel = (name: string, qty: number) =>
                    `${name ?? "—"} (${Number.isInteger(qty) ? qty : qty})`;
                  return (
                    <tr key={p.id} className="border-t border-[#E2E8F0] hover:bg-slate-50/80">
                      <td className="py-4 px-4">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="w-12 h-12 rounded-lg border border-[#E2E8F0] bg-slate-100 flex items-center justify-center overflow-hidden aspect-square relative shrink-0">
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 z-0" aria-hidden>—</span>
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover rounded-lg z-10"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 px-4">{p.name || "—"}</td>
                      <td className="py-4 px-4">{p.ean || "—"}</td>
                      <td className="py-4 px-4">{p.symbol || "—"}</td>
                      <td className="py-4 px-4">
                        {p.length != null && p.width != null && p.height != null ? `${p.length} × ${p.width} × ${p.height}` : "—"}
                      </td>
                      <td className="py-4 px-4">{vol != null ? vol.toFixed(2) : "—"}</td>
                      <td className="py-4 px-4">{p.weight != null ? p.weight : "—"}</td>
                      <td className="py-4 px-4">
                        <span className={typeof p.stock_quantity === "number" && p.stock_quantity === 0 ? "text-red-600 font-medium" : ""}>
                          {typeof p.stock_quantity === "number" ? `${p.stock_quantity} szt.` : "0 szt."}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const r = typeof p.rotation_30d === "number" ? p.rotation_30d : 0;
                          const s = Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
                          return `${s} szt./dzień`;
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const days = p.days_of_stock;
                          if (days == null) return <span className="text-slate-500">brak sprzedaży</span>;
                          const n = Number(days);
                          const className =
                            n < 7 ? "text-red-600 font-medium" : n > 60 ? "text-amber-600 font-medium" : "";
                          return <span className={className}>{n} dni</span>;
                        })()}
                      </td>
                      <td className="py-4 px-4 align-top">
                        {invLocs.length > 0 ? (
                          invLocs.length <= 2 ? (
                            <div className="flex flex-col gap-1 min-w-0">
                              {invLocs.map((loc, idx) => (
                                <span key={`${loc.name}-${idx}`} className="text-sm text-slate-700 font-mono">
                                  {locLabel(loc.name, loc.quantity)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span
                              className="text-sm text-slate-700 cursor-help"
                              title={invLocs.map((loc) => locLabel(loc.name, loc.quantity)).join("\n")}
                            >
                              {invLocs.length} lokalizacje
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">Brak przypisanych lokalizacji</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPrintProduct(p)}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800 text-xs font-medium"
                            title="Drukuj etykietę"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            </svg>
                            Drukuj etykietę
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductForWarehouse(p)}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800 text-xs font-medium"
                            title="Pokaż w magazynie"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            Show in warehouse
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditProduct(p)}
                            className="text-cyan-600 hover:text-cyan-700 text-xs font-medium"
                          >
                            Edytuj
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-4 rounded-tr-xl">
                        {isPackable(p) ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Gotowy do pakowania</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Brak wymiarów</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {totalCount > 0 && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 bg-gray-50/80 text-sm text-gray-600">
              <span>{startRow}–{endRow} z {totalCount}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Poprzednia</button>
                <span className="py-1">Strona {page} z {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Następna</button>
              </div>
            </div>
          )}
        </div>
      )}

      {editProduct != null && (
        <ProductEditModal
          tenants={tenants}
          product={editProduct === "new" ? null : editProduct ? { ...editProduct, name: editProduct.name ?? "", ean: editProduct.ean ?? "", symbol: editProduct.symbol ?? "", tenant_id: editProduct.tenant_id } : null}
          onSave={(saved) => {
            if (saved.id != null && editProduct !== "new") {
              setProducts((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved, purchase_price: saved.purchase_price ?? undefined } : p)));
            }
            fetchProducts();
            setEditProduct(null);
          }}
          onClose={() => setEditProduct(null)}
        />
      )}

      {printProduct != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPrintProduct(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 px-6 py-4 border-b border-slate-100">Drukuj etykietę</h3>
            <div className="p-6 space-y-4">
              {printProduct.label_template_id == null && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Ten produkt nie ma przypisanego szablonu etykiety. Wybierz szablon z listy poniżej.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Szablon etykiety</label>
                <select
                  value={printTemplateId ?? ""}
                  onChange={(e) => setPrintTemplateId(e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Wybierz szablon</option>
                  {productTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">Podgląd</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 min-h-[80px] flex items-center justify-center p-3">
                  {printPreviewLoading ? (
                    <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
                  ) : printPreviewSvg ? (
                    <div
                      className="max-w-full max-h-40 overflow-auto [&_svg]:max-h-40 [&_svg]:w-auto [&_svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: printPreviewSvg }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">Brak podglądu szablonu</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ilość</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={printQuantity}
                  onChange={(e) => setPrintQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPrintProduct(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={printGenerating || printTemplateId == null}
                onClick={async () => {
                  if (printTemplateId == null || printProduct == null) return;
                  setPrintGenerating(true);
                  try {
                    const res = await api.post("/labels/product", {
                      product_id: printProduct.id,
                      template_id: printTemplateId,
                      quantity: printQuantity,
                    }, { params: { tenant_id: 1 }, responseType: "blob" });
                    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
                    window.open(url, "_blank");
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                    setPrintProduct(null);
                  } catch (err) {
                    console.error(err);
                    alert("Nie udało się wygenerować PDF. Sprawdź konsolę.");
                  } finally {
                    setPrintGenerating(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {printGenerating ? "Generowanie…" : "Generuj PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRandomizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!randomizeLoading && randomizeResult) setShowRandomizeModal(false); }}>
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Randomize product locations</h3>
            {randomizeResult == null ? (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  This will randomly assign all product inventory in the selected warehouse to storage locations. Only rows with quantity &gt; 0 are modified. Continue?
                </p>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Magazyn</label>
                  <select
                    value={randomizeWarehouseId === "" ? "" : randomizeWarehouseId}
                    onChange={(e) => setRandomizeWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name ?? `Magazyn ${w.id}`}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowRandomizeModal(false)} disabled={randomizeLoading} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Anuluj
                  </button>
                  <button
                    type="button"
                    disabled={randomizeLoading || randomizeWarehouseId === ""}
                    onClick={runRandomizeLocations}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {randomizeLoading ? "Oczekiwanie…" : "Potwierdź"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-slate-700 space-y-1 mb-4">
                  <p><strong>Products processed:</strong> {randomizeResult.products_processed}</p>
                  <p><strong>Assigned successfully:</strong> {randomizeResult.assigned_successfully}</p>
                  <p><strong>Failed assignments:</strong> {randomizeResult.failed_assignments}</p>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowRandomizeModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800">
                    Zamknij
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ProductInWarehouseModal
        product={productForWarehouse}
        onClose={() => setProductForWarehouse(null)}
      />
    </div>
  );
}
