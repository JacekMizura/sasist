import { useEffect, useState, useCallback } from "react";
import { log } from "../utils/logger";
import api from "../api/axios";
import { useTranslation } from "../locales";

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
};

/** Pierwszy URL z pola "Zdjęcia" (rozdzielone średnikami). */
function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  const first = trimmed.split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

/** Objętość w dm³: (L×W×H)/1000 lub product.volume jeśli podane */
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

const defaultFilters: Filters = {
  ean: "",
  name: "",
  symbol: "",
  volumeMin: "",
  volumeMax: "",
  weightMin: "",
  weightMax: "",
};

export default function Products() {
  const t = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

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

    api
      .get(`/products/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const list = data?.items ?? (Array.isArray(data) ? data : []);
        const total = typeof data?.total === "number" ? data.total : list.length;
        setProducts(list);
        setTotalCount(total);
      })
      .catch(() => log("Błąd pobierania produktów"))
      .finally(() => setLoading(false));
  }, [appliedFilters, page, rowsPerPage]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const applyFilters = () => { setPage(1); setAppliedFilters(filters); };
  const clearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const isPackable = (p: Product) =>
    p.length && p.width && p.height && (p.volume != null || (p.length && p.width && p.height));

  return (
    <div className="space-y-6">
      {/* Pasek filtrów */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">EAN</span>
            <input
              type="text"
              value={filters.ean}
              onChange={(e) => setFilters((f) => ({ ...f, ean: e.target.value }))}
              placeholder="Szukaj EAN..."
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Nazwa produktu</span>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nazwa..."
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Symbol / SKU</span>
            <input
              type="text"
              value={filters.symbol}
              onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))}
              placeholder="Symbol..."
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Objętość min (dm³)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={filters.volumeMin}
              onChange={(e) => setFilters((f) => ({ ...f, volumeMin: e.target.value }))}
              placeholder="Min"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Objętość max (dm³)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={filters.volumeMax}
              onChange={(e) => setFilters((f) => ({ ...f, volumeMax: e.target.value }))}
              placeholder="Max"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Waga min</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={filters.weightMin}
              onChange={(e) => setFilters((f) => ({ ...f, weightMin: e.target.value }))}
              placeholder="Min"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Waga max</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={filters.weightMax}
              onChange={(e) => setFilters((f) => ({ ...f, weightMax: e.target.value }))}
              placeholder="Max"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Filtruj
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            Wyczyść
          </button>
        </div>
      </div>

      {loading ? (
        <div>Ładowanie...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50/80">
            <span className="text-sm text-gray-600">
              {t.rowsPerPage ?? "Pokaż na stronie"}
            </span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3 w-16">{t.photo ?? "Zdjęcie"}</th>
                <th className="p-3">Nazwa</th>
                <th className="p-3">EAN</th>
                <th className="p-3">Symbol / SKU</th>
                <th className="p-3">{t.dimensionsLWH ?? "Wymiary (D/S/W)"}</th>
                <th className="p-3">Objętość (dm³)</th>
                <th className="p-3">Waga</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500">
                    Brak produktów do wyświetlenia.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const vol = volumeDm3(p);
                  const imgUrl = firstImageUrl(p.image_url);
                  return (
                    <tr key={p.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            className="w-12 h-12 object-cover rounded border border-gray-200"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3">{p.name || "—"}</td>
                      <td className="p-3">{p.ean || "—"}</td>
                      <td className="p-3">{p.symbol || "—"}</td>
                      <td className="p-3">
                        {p.length != null && p.width != null && p.height != null
                          ? `${p.length} × ${p.width} × ${p.height}`
                          : "—"}
                      </td>
                      <td className="p-3">{vol != null ? vol.toFixed(2) : "—"}</td>
                      <td className="p-3">{p.weight != null ? p.weight : "—"}</td>
                      <td className="p-3">
                        {isPackable(p) ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Gotowy do pakowania
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Brak wymiarów
                          </span>
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
              <span>
                {startRow}–{endRow} z {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
