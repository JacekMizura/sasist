import type { OrderIssueShortageLineApi } from "../../api/wmsOrderIssueTasksApi";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

/** Wiersz produktu z brakiem — tylko podgląd operacyjny (decyzje w OMS). */
export function OrderIssueShortageLineRow({ line }: { line: OrderIssueShortageLineApi }) {
  const missing = line.missing_qty;
  const ordered = line.ordered_qty;
  const showBadge = missing > 1e-9;
  const action = (line.oms_action_summary ?? "").trim();
  return (
    <div className="flex gap-3 border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {line.image_url ? (
          <img src={line.image_url} alt="" className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-400">Brak zdjęcia</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{line.product_name}</p>
        {line.location_code ? (
          <p className="mt-0.5 font-mono text-xs text-slate-600">
            Lok. <span className="font-semibold text-slate-800">{line.location_code}</span>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">
            Zam.: {fmtQty(ordered)} · Zebr.: {fmtQty(line.picked_qty)}
          </span>
          {showBadge ? (
            <span className="inline-flex rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-950 ring-1 ring-red-200/80">
              Brak: {fmtQty(missing)} szt.
            </span>
          ) : null}
          {action ? (
            <p className="mt-1.5 text-xs font-medium text-slate-700">
              Akcja OMS: <span className="text-slate-900">{action}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
