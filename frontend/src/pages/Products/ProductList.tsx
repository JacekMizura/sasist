import { useEffect, useState, useCallback } from "react";
import api from "../../api/axios";
import { useTranslation } from "../../locales";
import type { AssignedLocation } from "../../types/warehouse";
import { ProductEditModal } from "./ProductEditModal";
import { LocationMappingExportImport } from "./LocationMappingExportImport";

type Product = {
  id: number;
  name?: string;
  ean?: string;
  symbol?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  purchase_price?: number;
  image_url?: string;
  /** Assigned warehouse positions (locationUUID + quantity). API may return assigned_locations. */
  assignedLocations?: AssignedLocation[];
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

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ tenant_id: "1" });
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
        })) as Product[];
        const total = typeof data?.total === "number" ? data.total : list.length;
        setProducts(list);
        setTotalCount(total);
      })
      .catch(() => console.log("Błąd pobierania produktów"))
      .finally(() => setLoading(false));
  }, [appliedFilters, page, rowsPerPage, sortBy, sortDir]);

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
    try {
      await api.delete(`/products/bulk?tenant_id=1&ids=${Array.from(selectedIds).join(",")}`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
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
                <th className="py-4 px-4">Lokalizacje</th>
                <th className="py-4 px-4">Akcje</th>
                <th className="py-4 px-4 rounded-tr-xl">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={11} className="p-6 text-center text-slate-500">Brak produktów do wyświetlenia.</td></tr>
              ) : (
                products.map((p) => {
                  const vol = volumeDm3(p);
                  const imgUrl = firstImageUrl(p.image_url);
                  const locs = p.assignedLocations ?? [];
                  type LocWithAddress = AssignedLocation & { locationAddress?: string };
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
                      <td className="py-4 px-4 align-top">
                        {locs.length > 0 ? (
                          <div className="flex flex-col gap-1.5 min-w-0">
                            {locs.map((a, idx) => {
                              const label = (a as LocWithAddress).locationAddress ?? a.locationUUID;
                              const qty = typeof a.quantity === "number" ? a.quantity : Number(a.quantity) || 0;
                              const isReserve =
                                (a as AssignedLocation & { storageType?: string; storage_type?: string }).storageType === "reserve" ||
                                (a as AssignedLocation & { storageType?: string; storage_type?: string }).storage_type === "reserve";
                              return (
                                <span
                                  key={a.locationUUID + (idx > 0 ? `-${idx}` : "")}
                                  className={`inline-flex items-baseline gap-1 text-xs rounded px-2 py-1 w-fit border ${
                                    isReserve
                                      ? "bg-[#FFCC99] border-amber-300 text-amber-900"
                                      : "text-slate-700 bg-slate-100 border-slate-200"
                                  }`}
                                  title={label.length > 20 ? label : undefined}
                                >
                                  {isReserve && (
                                    <span
                                      className="shrink-0"
                                      title="Lokalizacja zapasowa (Rezerwa)"
                                      aria-label="Lokalizacja zapasowa (Rezerwa)"
                                    >
                                      🔒
                                    </span>
                                  )}
                                  <span className="font-mono">{label}</span>
                                  <span className={isReserve ? "text-amber-800 shrink-0" : "text-slate-500 shrink-0"}>– {qty} szt.</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Brak przypisanych lokalizacji</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => setEditProduct(p)}
                          className="text-cyan-600 hover:text-cyan-700 text-xs font-medium"
                        >
                          Edytuj
                        </button>
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
          product={editProduct === "new" ? null : editProduct ? { ...editProduct, name: editProduct.name ?? "", ean: editProduct.ean ?? "", symbol: editProduct.symbol ?? "" } : null}
          onSave={(saved) => {
            if (saved.id != null && editProduct !== "new") {
              setProducts((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)));
            }
            fetchProducts();
            setEditProduct(null);
          }}
          onClose={() => setEditProduct(null)}
        />
      )}
    </div>
  );
}
