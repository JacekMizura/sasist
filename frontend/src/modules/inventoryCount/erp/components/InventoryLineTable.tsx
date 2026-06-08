import { User } from "lucide-react";

import type { InventoryLineRead } from "../../../api/inventoryCountApi";
import { ERP_INV } from "../erpInventoryTheme";
import {
  InventoryLineStatusBadge,
  InventoryLocationBadge,
  InventoryProductThumb,
  InventoryVarianceClassBadge,
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
      <table className={ERP_INV.table}>
        <thead>
          <tr>
            <th className={ERP_INV.th}>Produkt</th>
            <th className={ERP_INV.th}>Lokalizacja</th>
            <th className={`${ERP_INV.th} text-right`}>Oczek.</th>
            <th className={`${ERP_INV.th} text-right`}>Policz.</th>
            <th className={`${ERP_INV.th} text-right`}>Różn.</th>
            <th className={ERP_INV.th}>Status</th>
            <th className={ERP_INV.th}>Operator</th>
            <th className={ERP_INV.th}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id} className={ERP_INV.row}>
              <td className={ERP_INV.td}>
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
              <td className={ERP_INV.td}>
                <InventoryLocationBadge code={ln.location_name ?? `#${ln.location_id}`} line={ln} />
              </td>
              <td className={`${ERP_INV.td} text-right tabular-nums`}>{ln.expected_quantity ?? "—"}</td>
              <td className={`${ERP_INV.td} text-right tabular-nums font-semibold text-slate-900`}>
                {ln.counted_quantity ?? "—"}
              </td>
              <td className={`${ERP_INV.td} text-right tabular-nums ${ln.difference_quantity && Math.abs(ln.difference_quantity) > 1e-9 ? "font-bold text-red-700" : ""}`}>
                {ln.difference_quantity ?? "—"}
              </td>
              <td className={ERP_INV.td}>
                <div className="flex flex-wrap gap-1">
                  <InventoryLineStatusBadge line={ln} />
                  <InventoryVarianceClassBadge diffClass={ln.difference_class} />
                  {ln.recount_count > 0 ? (
                    <span className={`${ERP_INV.badge} bg-orange-50 text-orange-800`}>×{ln.recount_count}</span>
                  ) : null}
                </div>
              </td>
              <td className={ERP_INV.td}>
                {ln.last_counted_by_name ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                    <User className="h-3 w-3 shrink-0 text-slate-400" />
                    {ln.last_counted_by_name}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={`${ERP_INV.td} whitespace-nowrap text-[11px] tabular-nums text-slate-600`}>
                {fmtTime(ln.last_counted_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
