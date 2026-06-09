import { Clock, User } from "lucide-react";

import type { InventoryLineRead } from "@/api/inventoryCountApi";
import {
  listSellasistTableBodyCellClassDense,
  listSellasistTableHeaderCellClassDense,
} from "@/components/listPage/listSellasistTokens";
import {
  InventoryLineStatusBadge,
  InventoryLocationStack,
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

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

const thClass = `${listSellasistTableHeaderCellClassDense} text-left`;
const thRight = `${listSellasistTableHeaderCellClassDense} text-right`;
const tdClass = listSellasistTableBodyCellClassDense;
const rowClass = "group transition-colors hover:bg-slate-50/70";

function QtyValue({
  value,
  tone = "default",
}: {
  value: string | number;
  tone?: "default" | "strong" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-sm font-bold tabular-nums text-red-700"
      : tone === "strong"
        ? "text-sm font-semibold tabular-nums text-slate-900"
        : "text-sm tabular-nums text-slate-700";
  return <span className={cls}>{value}</span>;
}

function ProductCell({ ln }: { ln: InventoryLineRead }) {
  const ean = ln.ean?.trim();
  const sku = ln.sku?.trim();
  const name = ln.product_name ?? ln.sku ?? `#${ln.product_id}`;

  return (
    <div className="flex min-w-[220px] max-w-[20rem] items-center gap-3">
      <InventoryProductThumb url={ln.product_image_url} name={ln.product_name} size="compact" />
      <div className="min-w-0 flex flex-col gap-0.5">
        <p className="truncate text-sm font-semibold leading-snug text-slate-900">{name}</p>
        {ean ? <p className="truncate font-mono text-xs text-slate-600">EAN {ean}</p> : null}
        {sku ? (
          <p className="truncate font-mono text-[11px] text-slate-500" title={sku}>
            SKU {sku}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DifferenceCell({ ln }: { ln: InventoryLineRead }) {
  const diff = ln.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;

  if (!hasDiff) {
    return <QtyValue value={diff ?? "—"} />;
  }

  return (
    <span className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-sm font-bold tabular-nums text-red-800">
      {diff}
    </span>
  );
}

type Props = {
  lines: InventoryLineRead[];
  loading?: boolean;
  emptyMessage?: string;
};

/** Przebieg liczenia — read-only runtime timeline (no conflict actions). */
export default function InventoryLineTable({ lines, loading, emptyMessage = "Brak pozycji." }: Props) {
  if (loading) {
    return <p className="py-6 text-sm text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="py-6 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr>
            <th className={`${thClass} min-w-[16rem]`}>Produkt</th>
            <th className={thClass}>Lokalizacja</th>
            <th className={thRight}>Oczekiwana</th>
            <th className={thRight}>Policzona</th>
            <th className={thRight}>Różnica</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>Operator</th>
            <th className={thClass}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id} className={rowClass}>
              <td className={tdClass}>
                <ProductCell ln={ln} />
              </td>
              <td className={tdClass}>
                <InventoryLocationStack
                  locationCode={ln.location_name ?? `#${ln.location_id}`}
                  carrierCode={ln.carrier_code}
                />
              </td>
              <td className={`${tdClass} text-right`}>
                <QtyValue value={ln.expected_quantity ?? "—"} />
              </td>
              <td className={`${tdClass} text-right`}>
                <QtyValue value={fmtQty(ln.counted_quantity)} tone="strong" />
              </td>
              <td className={`${tdClass} text-right`}>
                <DifferenceCell ln={ln} />
              </td>
              <td className={tdClass}>
                <InventoryLineStatusBadge line={ln} />
              </td>
              <td className={tdClass}>
                {ln.last_counted_by_name ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <User className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                    {ln.last_counted_by_name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className={tdClass}>
                <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                  <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
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
