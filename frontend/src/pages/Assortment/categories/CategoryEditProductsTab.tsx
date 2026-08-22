import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../../../api/axios";
import { extractApiErrorMessage } from "../../../api/authApi";
import { getProductDetailsPath } from "../../Products/productPaths";
import {
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  Input,
  Select,
} from "../../../design-system";

type Row = {
  id: number;
  name?: string;
  sku?: string | null;
  symbol?: string | null;
  catalog_number?: string | null;
  ean?: string | null;
};

type Props = {
  tenantId: number;
  categoryId: number;
};

/**
 * Lightweight products table for a category (primary or additional membership).
 */
export function CategoryEditProductsTab({ tenantId, categoryId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "id">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tenant_id: String(tenantId),
        category_id: String(categoryId),
        limit: "500",
        offset: "0",
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (q.trim()) params.set("search", q.trim());
      const res = await api.get(`/products/?${params.toString()}`);
      const data = res.data;
      const raw = data?.items ?? (Array.isArray(data) ? data : []);
      setRows(
        (raw as Record<string, unknown>[]).map((p) => ({
          id: Number(p.id),
          name: typeof p.name === "string" ? p.name : undefined,
          sku: (p.sku as string | null) ?? null,
          symbol: (p.symbol as string | null) ?? null,
          catalog_number: (p.catalog_number as string | null) ?? null,
          ean: (p.ean as string | null) ?? null,
        })),
      );
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać produktów."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, categoryId, sortBy, sortDir, q]);

  useEffect(() => {
    const t = window.setTimeout(() => void reload(), 200);
    return () => window.clearTimeout(t);
  }, [reload]);

  const sortedHint = useMemo(() => `${rows.length} produktów (główna lub dodatkowa).`, [rows.length]);

  return (
    <FormSection title="Produkty w kategorii" description={sortedHint}>
      <div className="flex flex-wrap gap-2">
        <FormField label="Szukaj" className="min-w-[180px]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nazwa, SKU, EAN…"
            density={FORM_FIELD_DENSITY}
            focusTone="brand"
          />
        </FormField>
        <FormField label="Sortuj">
          <Select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [b, d] = e.target.value.split(":") as ["name" | "id", "asc" | "desc"];
              setSortBy(b);
              setSortDir(d);
            }}
            density={FORM_FIELD_DENSITY}
            focusTone="brand"
            className="bg-white"
          >
            <option value="name:asc">Nazwa A→Z</option>
            <option value="name:desc">Nazwa Z→A</option>
            <option value="id:desc">ID malejąco</option>
            <option value="id:asc">ID rosnąco</option>
          </Select>
        </FormField>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak produktów w tej kategorii.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Nazwa</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Katalog</th>
                <th className="px-3 py-2 font-semibold">EAN</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.name || `Produkt #${r.id}`}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {r.sku || r.symbol || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {r.catalog_number || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.ean || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={getProductDetailsPath(r.id, { tenantId })}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Otwórz
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormSection>
  );
}
