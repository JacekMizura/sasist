import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProductFamilyMember } from "../../../api/productFamiliesApi";
import { getProductDetailsPath } from "../productPaths";
import { Input, Select } from "../../../design-system";
import { pimFieldLabelClass, pimPanelClass } from "../../Assortment/pimUi";

type Props = {
  tenantId: number;
  members: ProductFamilyMember[];
  currentProductId: number;
};

type SortKey = "name" | "sku" | "ean" | "sale_price" | "stock_quantity";

function formatPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Family members table with client-side search and sort.
 */
export function FamilyMembersCard({ tenantId, members, currentProductId }: Props) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = members.slice();
    if (needle) {
      list = list.filter((m) => {
        const hay = [m.name, m.sku, m.catalog_number, m.ean, m.attribute_summary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === "number" || typeof bv === "number") {
        const an = typeof av === "number" ? av : Number.NEGATIVE_INFINITY;
        const bn = typeof bv === "number" ? bv : Number.NEGATIVE_INFINITY;
        return (an - bn) * dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? ""), "pl", { sensitivity: "base" }) * dir;
    });
    return list;
  }, [members, q, sortBy, sortDir]);

  return (
    <section className={pimPanelClass}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Produkty w rodzinie</h2>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length} / {members.length} produktów
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[180px]">
            <label className={pimFieldLabelClass}>Szukaj</label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nazwa, SKU, EAN…"
              density="comfortable"
              focusTone="brand"
            />
          </div>
          <div>
            <label className={pimFieldLabelClass}>Sortuj</label>
            <Select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [b, d] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
                setSortBy(b);
                setSortDir(d);
              }}
              density="comfortable"
              focusTone="brand"
              className="bg-white"
            >
              <option value="name:asc">Nazwa A→Z</option>
              <option value="name:desc">Nazwa Z→A</option>
              <option value="sku:asc">SKU A→Z</option>
              <option value="sale_price:asc">Cena ↑</option>
              <option value="sale_price:desc">Cena ↓</option>
              <option value="stock_quantity:desc">Stan ↓</option>
              <option value="stock_quantity:asc">Stan ↑</option>
            </Select>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak produktów w rodzinie.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Miniatura</th>
                <th className="px-3 py-2 font-semibold">Nazwa</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">EAN</th>
                <th className="px-3 py-2 font-semibold">Cena</th>
                <th className="px-3 py-2 font-semibold">Stan</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isCurrent = m.id === currentProductId;
                return (
                  <tr
                    key={m.id}
                    className={`border-t border-slate-100 ${isCurrent ? "bg-blue-50/40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      {m.image_url ? (
                        <img
                          src={m.image_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {m.name}
                        {m.is_base ? (
                          <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                            bazowy
                          </span>
                        ) : null}
                        {isCurrent ? (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-700">
                            bieżący
                          </span>
                        ) : null}
                      </div>
                      {m.attribute_summary ? (
                        <div className="text-xs text-slate-500">{m.attribute_summary}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{m.sku?.trim() || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{m.ean?.trim() || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{formatPrice(m.sale_price)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">
                      {m.stock_quantity != null ? m.stock_quantity : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          m.is_active !== false
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.is_active !== false ? "Aktywny" : "Nieaktywny"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={getProductDetailsPath(m.id, { tenantId })}
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
                        title="Otwórz kartę produktu"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
