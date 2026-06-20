import type { TooltipProps } from "recharts";

import { PurchasingProductThumbnail } from "../../modules/purchasing/ui";

export type PurchasingForecastBarRow = {
  name: string;
  fullName: string;
  qty: number;
  product_id: number;
  sku?: string | null;
  image_url?: string | null;
  stock?: number | null;
  incoming_qty?: number | null;
  avg_daily?: number;
};

type Props = TooltipProps<number, string> & {
  rows: PurchasingForecastBarRow[];
};

function fmtQty(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

export function PurchasingForecastBarTooltip({ active, payload, rows }: Props) {
  if (!active || !payload?.length) return null;

  const label = payload[0]?.payload as PurchasingForecastBarRow | undefined;
  if (!label) return null;

  const row = rows.find((r) => r.product_id === label.product_id) ?? label;
  const avgDaily = row.avg_daily ?? row.qty / 30;

  return (
    <div className="max-w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/60">
      <div className="flex gap-3">
        <PurchasingProductThumbnail
          size="md"
          imageUrl={row.image_url}
          name={row.fullName}
          sku={row.sku}
          stock={row.stock}
          incomingQty={row.incoming_qty}
          hoverPreview={false}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{row.fullName}</p>
          <p className="mt-0.5 text-xs text-slate-500">SKU: {row.sku ?? "—"}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Sprzedaż 30 dni</dt>
          <dd className="font-medium tabular-nums text-slate-900">{fmtQty(row.qty)} szt.</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Średnio dziennie</dt>
          <dd className="font-medium tabular-nums text-slate-800">{fmtQty(avgDaily)} szt.</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Stan magazynowy</dt>
          <dd className="font-medium tabular-nums text-slate-800">{fmtQty(row.stock)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">W drodze</dt>
          <dd className="font-medium tabular-nums text-slate-800">{fmtQty(row.incoming_qty ?? null)}</dd>
        </div>
      </dl>
    </div>
  );
}
