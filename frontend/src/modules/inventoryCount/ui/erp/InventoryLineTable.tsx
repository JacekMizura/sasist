import { User } from "lucide-react";

import type { InventoryLineRead } from "@/api/inventoryCountApi";
import {
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "@/components/operational";
import { inventoryStockSourceLabel } from "../../inventoryStockSourceLabel";
import {
  InventoryLineStatusBadge,
  InventoryLocationBadge,
  InventoryProductThumb,
} from "./InventoryLineBadges";

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type Props = {
  lines: InventoryLineRead[];
  loading?: boolean;
  emptyMessage?: string;
};

/** Inventory lines — standard ERP dense table tokens. */
export default function InventoryLineTable({ lines, loading, emptyMessage = "Brak pozycji." }: Props) {
  if (loading) {
    return <p className="py-6 text-center text-sm text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className={panelListDenseTableScrollWrapClass}>
      <table className={panelListDenseTableClass}>
        <thead className={panelListDenseTheadClass}>
          <tr>
            <th className={`${panelListDenseThBase} text-left`}>Produkt</th>
            <th className={`${panelListDenseThBase} text-left`}>Lokalizacja</th>
            <th className={`${panelListDenseThBase} text-left`}>Źródło stanu</th>
            <th className={`${panelListDenseThBase} text-right`}>Oczek.</th>
            <th className={`${panelListDenseThBase} text-right`}>Policz.</th>
            <th className={`${panelListDenseThBase} text-right`}>Różn.</th>
            <th className={`${panelListDenseThBase} text-left`}>Status</th>
            <th className={`${panelListDenseThBase} text-left`}>Operator</th>
            <th className={`${panelListDenseThBase} text-left`}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id} className={panelListDenseRowClass}>
              <td className={panelListDenseTdBase}>
                <div className="flex min-w-[200px] items-start gap-2">
                  <InventoryProductThumb url={ln.product_image_url} name={ln.product_name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {ln.product_name ?? ln.sku ?? `#${ln.product_id}`}
                    </p>
                    <p className="truncate text-xs text-slate-500">{[ln.ean, ln.sku].filter(Boolean).join(" · ")}</p>
                    {ln.carrier_code ? (
                      <p className="mt-0.5 text-xs font-medium text-slate-600">Nośnik: {ln.carrier_code}</p>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className={panelListDenseTdBase}>
                <InventoryLocationBadge code={ln.location_name ?? `#${ln.location_id}`} />
              </td>
              <td className={panelListDenseTdBase}>
                {(() => {
                  const src = inventoryStockSourceLabel(ln);
                  return (
                    <div>
                      <p className="font-semibold text-slate-800">{src.label}</p>
                      <p className="text-xs text-slate-500">{src.detail}</p>
                    </div>
                  );
                })()}
              </td>
              <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-700`}>
                {ln.expected_quantity ?? "—"}
              </td>
              <td className={`${panelListDenseTdBase} text-right tabular-nums font-semibold text-slate-900`}>
                {ln.counted_quantity ?? "—"}
              </td>
              <td
                className={`${panelListDenseTdBase} text-right tabular-nums ${
                  ln.difference_quantity && Math.abs(ln.difference_quantity) > 1e-9
                    ? "font-bold text-red-700"
                    : "text-slate-700"
                }`}
              >
                {ln.difference_quantity ?? "—"}
              </td>
              <td className={panelListDenseTdBase}>
                <div className="flex flex-wrap gap-1">
                  <InventoryLineStatusBadge line={ln} />
                  {ln.recount_count > 0 && ln.recount_state !== "required" ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      ×{ln.recount_count} ponowne
                    </span>
                  ) : null}
                </div>
              </td>
              <td className={panelListDenseTdBase}>
                {ln.last_counted_by_name ? (
                  <span className="inline-flex items-center gap-1 text-sm text-slate-700">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {ln.last_counted_by_name}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={`${panelListDenseTdBase} whitespace-nowrap tabular-nums text-slate-700`}>
                {fmtTime(ln.last_counted_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
