import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { getWmsCarrier, type WarehouseCarrierItemRead } from "../../../api/wmsCarrierApi";

type Props = {
  tenantId: number;
  carrierId: number;
  skuCount: number;
  totalQty: number;
  isMixed?: boolean;
};

export function CarrierContentPreview({ tenantId, carrierId, skuCount, totalQty, isMixed }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<WarehouseCarrierItemRead[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void getWmsCarrier(tenantId, carrierId)
      .then((d) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, carrierId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (skuCount <= 0 && totalQty <= 0) {
    return <span className="text-[13px] text-slate-400">Pusty</span>;
  }

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[13px] font-medium text-slate-800 hover:border-slate-300 hover:bg-white"
      >
        <Package className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span>
          SKU: <strong className="tabular-nums">{skuCount}</strong>
          <span className="mx-1 text-slate-300">·</span>
          <strong className="tabular-nums">{totalQty}</strong> szt.
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[min(100vw-2rem,20rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Zawartość</p>
            {isMixed ? (
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                MIX
              </span>
            ) : null}
          </div>
          {loading ? (
            <p className="text-[13px] text-slate-500">Wczytywanie…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-slate-500">Brak pozycji do podglądu.</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {items.slice(0, 12).map((it) => (
                <li key={it.id} className="rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                  <p className="truncate text-[13px] font-semibold text-slate-900">
                    {it.product_name || it.product_sku || `#${it.product_id}`}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {[it.product_sku, it.product_ean].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-800">{it.quantity} szt.</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
