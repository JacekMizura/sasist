import { Clock, User } from "lucide-react";

import type { InventoryLineRead } from "@/api/inventoryCountApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "@/components/listPage/listSellasistTokens";
import {
  InventoryCarrierBadge,
  InventoryLineStatusBadge,
  InventoryLocationBadge,
  InventoryProductThumb,
  InventoryStockSourceBadge,
} from "./InventoryLineBadges";

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const thClass = `${listSellasistTableHeaderCellGrid} bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500`;
const tdClass = `${listSellasistTableBodyCellGrid} align-top !py-4`;
const rowClass = "group transition-colors hover:bg-slate-50/90";

function QtyCell({
  label,
  value,
  emphasis = "normal",
}: {
  label: string;
  value: string | number;
  emphasis?: "normal" | "strong" | "danger";
}) {
  const valueCls =
    emphasis === "danger"
      ? "text-base font-bold tabular-nums text-red-700"
      : emphasis === "strong"
        ? "text-base font-semibold tabular-nums text-slate-900"
        : "text-base font-medium tabular-nums text-slate-700";

  return (
    <div className="inline-flex min-w-[3.5rem] flex-col items-end gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}

function ProductCell({ ln }: { ln: InventoryLineRead }) {
  const ean = ln.ean?.trim();
  const sku = ln.sku?.trim();
  const name = ln.product_name ?? ln.sku ?? `#${ln.product_id}`;

  return (
    <div className="flex min-w-[240px] max-w-[22rem] items-start gap-3">
      <InventoryProductThumb url={ln.product_image_url} name={ln.product_name} />
      <div className="min-w-0 flex flex-col gap-1.5">
        <p className="text-sm font-semibold leading-snug text-slate-900">{name}</p>
        <div className="flex flex-col gap-0.5">
          {ean ? (
            <span className="text-xs tabular-nums text-slate-600">
              EAN <span className="font-medium text-slate-800">{ean}</span>
            </span>
          ) : null}
          {sku ? (
            <span className="truncate text-xs text-slate-500" title={sku}>
              Symbol <span className="font-medium text-slate-700">{sku}</span>
            </span>
          ) : null}
        </div>
        {ln.carrier_code ? <InventoryCarrierBadge code={ln.carrier_code} /> : null}
      </div>
    </div>
  );
}

function DifferenceCell({ ln }: { ln: InventoryLineRead }) {
  const diff = ln.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;

  return (
    <div className="inline-flex min-w-[3.5rem] flex-col items-end gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Różn.</span>
      {hasDiff ? (
        <span className="inline-flex rounded-full border border-red-200/90 bg-red-50 px-2.5 py-1 text-sm font-bold tabular-nums text-red-800">
          {diff}
        </span>
      ) : (
        <span className="text-base font-medium tabular-nums text-slate-500">{diff ?? "—"}</span>
      )}
    </div>
  );
}

type Props = {
  lines: InventoryLineRead[];
  loading?: boolean;
  emptyMessage?: string;
};

/** Inventory lines — Products-list density and hierarchy (presentation only). */
export default function InventoryLineTable({ lines, loading, emptyMessage = "Brak pozycji." }: Props) {
  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[960px] border-collapse text-left">
        <thead>
          <tr>
            <th className={`${thClass} min-w-[16rem] text-left`}>Produkt</th>
            <th className={`${thClass} text-left`}>Lokalizacja</th>
            <th className={`${thClass} text-left`}>Źródło stanu</th>
            <th className={`${thClass} text-right`}>Oczek.</th>
            <th className={`${thClass} text-right`}>Policz.</th>
            <th className={`${thClass} text-right`}>Różn.</th>
            <th className={`${thClass} text-left`}>Status</th>
            <th className={`${thClass} text-left`}>Operator</th>
            <th className={`${thClass} text-left`}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id} className={rowClass}>
              <td className={tdClass}>
                <ProductCell ln={ln} />
              </td>
              <td className={tdClass}>
                <InventoryLocationBadge code={ln.location_name ?? `#${ln.location_id}`} />
              </td>
              <td className={tdClass}>
                <InventoryStockSourceBadge line={ln} />
              </td>
              <td className={`${tdClass} text-right`}>
                <QtyCell label="Oczek." value={ln.expected_quantity ?? "—"} />
              </td>
              <td className={`${tdClass} text-right`}>
                <QtyCell label="Policz." value={ln.counted_quantity ?? "—"} emphasis="strong" />
              </td>
              <td className={`${tdClass} text-right`}>
                <DifferenceCell ln={ln} />
              </td>
              <td className={tdClass}>
                <div className="flex flex-wrap gap-1.5">
                  <InventoryLineStatusBadge line={ln} />
                  {ln.recount_count > 0 && ln.recount_state !== "required" ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                      ×{ln.recount_count} ponowne
                    </span>
                  ) : null}
                </div>
              </td>
              <td className={tdClass}>
                {ln.last_counted_by_name ? (
                  <span className="inline-flex items-center gap-1.5 text-xs leading-snug text-slate-600">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="font-medium text-slate-700">{ln.last_counted_by_name}</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className={tdClass}>
                <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  {fmtTime(ln.last_counted_at)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
