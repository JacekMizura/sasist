import { User } from "lucide-react";

import type { InventoryLineRead } from "@/api/inventoryCountApi";
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

/** Dense enterprise inventory line table. */
export default function InventoryLineTable({ lines, loading, emptyMessage = "Brak pozycji." }: Props) {
  if (loading) {
    return <p className="px-3 py-6 text-center text-xs text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Produkt</th>
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Lokalizacja</th>
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Źródło stanu</th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Oczek.</th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Policz.</th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Różn.</th>
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Operator</th>
            <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Czas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((ln) => (
            <tr key={ln.id} className="transition-colors hover:bg-slate-50/50">
              <td className="px-6 py-4">
                <div className="flex min-w-[200px] items-start gap-2">
                  <InventoryProductThumb url={ln.product_image_url} name={ln.product_name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{ln.product_name ?? ln.sku ?? `#${ln.product_id}`}</p>
                    <p className="truncate text-[10px] text-slate-500">
                      {[ln.ean, ln.sku].filter(Boolean).join(" · ")}
                    </p>
                    {ln.carrier_code ? (
                      <p className="mt-0.5 text-[10px] font-medium text-slate-600">Nośnik: {ln.carrier_code}</p>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <InventoryLocationBadge code={ln.location_name ?? `#${ln.location_id}`} />
              </td>
              <td className="px-6 py-4">
                {(() => {
                  const src = inventoryStockSourceLabel(ln);
                  return (
                    <div>
                      <p className="font-semibold text-slate-800">{src.label}</p>
                      <p className="text-[10px] text-slate-500">{src.detail}</p>
                    </div>
                  );
                })()}
              </td>
              <td className="px-6 py-4 text-right tabular-nums text-slate-600">{ln.expected_quantity ?? "—"}</td>
              <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-900">
                {ln.counted_quantity ?? "—"}
              </td>
              <td
                className={`px-6 py-4 text-right tabular-nums ${
                  ln.difference_quantity && Math.abs(ln.difference_quantity) > 1e-9
                    ? "font-bold text-red-700"
                    : "text-slate-600"
                }`}
              >
                {ln.difference_quantity ?? "—"}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                  <InventoryLineStatusBadge line={ln} />
                  {ln.recount_count > 0 && ln.recount_state !== "required" ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      ×{ln.recount_count} ponowne
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-6 py-4">
                {ln.last_counted_by_name ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                    <User className="h-3 w-3 shrink-0 text-slate-400" />
                    {ln.last_counted_by_name}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-xs tabular-nums text-slate-600">
                {fmtTime(ln.last_counted_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
