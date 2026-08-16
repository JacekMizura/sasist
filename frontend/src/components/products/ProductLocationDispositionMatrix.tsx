import type { MagazynInvRowDisplay } from "./MagazynInventoryLine";
import { fmtDispositionQty } from "../../types/productDispositionStock";

type LocAgg = {
  location_id: number;
  location_code: string;
  a: number;
  b: number;
  c: number;
  other: number;
};

function dispositionBucket(sdRaw: string | null | undefined): "a" | "b" | "c" | "other" {
  const sd = (sdRaw ?? "SALEABLE").trim().toUpperCase() || "SALEABLE";
  if (sd === "SALEABLE") return "a";
  if (sd === "OUTLET_B") return "b";
  if (sd === "SERVICE_C") return "c";
  return "other";
}

/** Aggregate inventory rows by location → A / B / C / Razem (does not merge B/C into A). */
export function aggregateLocationDispositionRows(rows: MagazynInvRowDisplay[]): LocAgg[] {
  const map = new Map<number, LocAgg>();
  for (const row of rows) {
    const lid = Number(row.location_id) || 0;
    if (lid <= 0) continue;
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) continue;
    let agg = map.get(lid);
    if (!agg) {
      agg = {
        location_id: lid,
        location_code: (row.location_code || `#!${lid}`).trim() || `#${lid}`,
        a: 0,
        b: 0,
        c: 0,
        other: 0,
      };
      map.set(lid, agg);
    }
    const bucket = dispositionBucket(row.stock_disposition);
    agg[bucket] += qty;
  }
  return Array.from(map.values()).sort((x, y) =>
    x.location_code.localeCompare(y.location_code, "pl"),
  );
}

type Props = {
  rows: MagazynInvRowDisplay[];
  className?: string;
};

export function ProductLocationDispositionMatrix({ rows, className = "" }: Props) {
  const aggs = aggregateLocationDispositionRows(rows);
  if (aggs.length === 0) return null;

  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 ${className}`}>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Lokalizacja</th>
            <th className="px-3 py-2 text-right">A</th>
            <th className="px-3 py-2 text-right">B</th>
            <th className="px-3 py-2 text-right">C</th>
            <th className="px-3 py-2 text-right">Razem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {aggs.map((r) => {
            const total = r.a + r.b + r.c + r.other;
            return (
              <tr key={r.location_id} className="tabular-nums text-slate-800">
                <td className="px-3 py-2 font-medium text-slate-900">{r.location_code}</td>
                <td className="px-3 py-2 text-right">{fmtDispositionQty(r.a)}</td>
                <td className="px-3 py-2 text-right text-amber-900">{fmtDispositionQty(r.b)}</td>
                <td className="px-3 py-2 text-right text-orange-900">{fmtDispositionQty(r.c)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtDispositionQty(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
