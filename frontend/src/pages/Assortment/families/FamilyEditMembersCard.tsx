import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";

import type { ProductFamilyMember } from "../../../api/productFamiliesApi";
import type { ProductSearchHit } from "../../../api/productsSearchApi";
import { Input, PrimaryButton } from "../../../design-system";
import { getProductDetailsPath } from "../../Products/productPaths";
import { pimPanelClass } from "../pimUi";
import { FamilyProductSearchField } from "./FamilyProductSearchField";

type Props = {
  tenantId: number;
  familyId: number;
  members: ProductFamilyMember[];
  attachBusy: boolean;
  onAttach: (hit: ProductSearchHit | null) => void;
};

function formatStock(qty: number | null | undefined): string {
  if (qty == null || Number.isNaN(Number(qty))) return "—";
  const n = Number(qty);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Family dashboard — members table with search + attach.
 */
export function FamilyEditMembersCard({ tenantId, familyId, members, attachBusy, onAttach }: Props) {
  const [query, setQuery] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = [m.name, m.sku, m.catalog_number, m.ean, m.attribute_summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [members, query]);

  return (
    <section className={pimPanelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Produkty rodziny</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {filtered.length}
            {query.trim() ? ` z ${members.length}` : ""} produktów
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj w rodzinie…"
              density="comfortable"
              focusTone="brand"
              aria-label="Szukaj produktów w rodzinie"
            />
          </div>
          <PrimaryButton type="button" density="compact" onClick={() => setAttachOpen((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
            Dołącz produkt
          </PrimaryButton>
          <Link
            to={`/products/new?tenant_id=${tenantId}&product_family_id=${familyId}`}
            className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Nowy produkt
          </Link>
        </div>
      </div>

      {attachOpen ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Dołącz istniejący produkt
          </p>
          <FamilyProductSearchField
            tenantId={tenantId}
            selectedId={null}
            disabled={attachBusy}
            placeholder="Szukaj i dołącz do rodziny…"
            onSelect={(hit) => {
              void onAttach(hit);
              if (hit) setAttachOpen(false);
            }}
          />
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak produktów — dołącz istniejący lub użyj generatora.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak wyników dla podanej frazy.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2 font-semibold" />
                <th className="px-3 py-2 font-semibold">Nazwa</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Cechy</th>
                <th className="px-3 py-2 font-semibold">Stan</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt=""
                        className="h-9 w-9 rounded-md border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={getProductDetailsPath(m.id, { tenantId })}
                      className="font-medium text-slate-900 hover:text-blue-700"
                    >
                      {m.name || `Produkt #${m.id}`}
                    </Link>
                    {m.is_base ? (
                      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Bazowy
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{m.sku || "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-slate-600">
                    {m.attribute_summary || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-800">{formatStock(m.stock_quantity)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={getProductDetailsPath(m.id, { tenantId })}
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
    </section>
  );
}
