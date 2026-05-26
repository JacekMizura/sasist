import type { OrderIssueDetailLineApi } from "../../api/wmsOrderIssueTasksApi";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function surfaceClass(lineKind: string, variant: "collected" | "remaining"): string {
  const k = (lineKind ?? "").trim();
  if (variant === "collected" || k === "collected") {
    return "border-emerald-200/90 bg-emerald-50/70";
  }
  if (k === "substitute") return "border-violet-200/90 bg-violet-50/75";
  if (k === "to_pick") return "border-amber-200/80 bg-amber-50/60";
  return "border-slate-200/90 bg-white";
}

function badgeClass(lineKind: string): string {
  const k = (lineKind ?? "").trim();
  if (k === "collected") return "border-emerald-400 bg-emerald-100 text-emerald-950";
  if (k === "substitute") return "border-violet-400 bg-violet-100 text-violet-950";
  if (k === "to_pick") return "border-amber-400 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-100 text-slate-800";
}

export function OrderIssueDetailLineRow({
  line,
  variant,
}: {
  line: OrderIssueDetailLineApi;
  variant: "collected" | "remaining";
}) {
  const badge = (line.badge_label ?? "").trim();
  const pickAudit = (line.pick_audit_summary ?? "").trim();
  const pickedLocs = line.picked_locations ?? [];
  const substituteFor = (line.substitute_for_product_name ?? "").trim();
  const remainingQty =
    line.remaining_qty != null && line.remaining_qty > 1e-9
      ? line.remaining_qty
      : Math.max(0, (line.ordered_qty ?? 0) - (line.picked_qty ?? 0));

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${surfaceClass(line.line_kind, variant)}`}>
      <div className="flex gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white">
          {line.image_url ? (
            <img src={line.image_url} alt="" className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-400">
              Brak zdjęcia
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{line.product_name}</p>
          {substituteFor ? (
            <p className="mt-0.5 text-xs text-violet-900/90">
              Zastępuje: <span className="font-medium">{substituteFor}</span>
            </p>
          ) : null}
          {(line.sku || line.ean) && (
            <p className="mt-0.5 font-mono text-[11px] text-slate-600">
              {line.sku ? <span>SKU {line.sku}</span> : null}
              {line.sku && line.ean ? <span className="text-slate-300"> · </span> : null}
              {line.ean ? <span>EAN {line.ean}</span> : null}
            </p>
          )}
          {line.location_code ? (
            <p className="mt-0.5 font-mono text-xs text-slate-600">
              Lok. <span className="font-semibold text-slate-800">{line.location_code}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {variant === "remaining" && remainingQty > 1e-9 ? (
              <span className="inline-flex rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                Pozostało: {fmtQty(remainingQty)} szt.
              </span>
            ) : (
              <span className="text-xs text-slate-600">
                Zam.: {fmtQty(line.ordered_qty)} · Zebr.: {fmtQty(line.picked_qty)}
              </span>
            )}
            {badge ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${badgeClass(line.line_kind)}`}
              >
                {badge}
              </span>
            ) : null}
          </div>
          {pickAudit ? (
            <p className="mt-1 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">Zbieranie:</span> {pickAudit}
            </p>
          ) : null}
          {pickedLocs.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-emerald-900/90">
              {pickedLocs.map((loc, i) => (
                <li key={`${loc.location_label}-${i}`}>
                  <span className="font-semibold">{loc.location_label}</span>
                  {loc.quantity > 0 ? <span className="tabular-nums"> · {fmtQty(loc.quantity)} szt.</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
