import { useEffect, useRef, useState } from "react";
import { getWmsCarrier, type WarehouseCarrierItemRead } from "../../../api/wmsCarrierApi";
import { CarrierMixBadge } from "./CarrierMixBadge";
import { CarrierProductThumb } from "./CarrierProductThumb";

type Props = {
  tenantId: number;
  carrierId: number;
  skuCount: number;
  totalQty: number;
  isMixed?: boolean;
};

function PopoverProductRow({ item }: { item: WarehouseCarrierItemRead }) {
  const name = (item.product_name || "").trim() || (item.product_sku || "").trim() || `#${item.product_id}`;
  const meta = [item.product_sku, item.product_ean].filter(Boolean).join(" · ") || "—";

  return (
    <li className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <CarrierProductThumb imageUrl={item.product_image_url} alt={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-snug text-slate-900">{name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{meta}</p>
      </div>
      <p className="shrink-0 text-right text-[16px] font-black tabular-nums text-slate-900">{item.quantity}</p>
    </li>
  );
}

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
    return <span className="text-[13px] font-medium text-slate-400">Pusty</span>;
  }

  return (
    <div className="relative inline-block max-w-full" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100/90 px-2.5 py-1 text-[13px] font-semibold text-slate-800 transition hover:bg-slate-200/90"
      >
        <span className="tabular-nums">
          SKU <strong>{skuCount}</strong>
          <span className="mx-1 font-normal text-slate-400">•</span>
          <strong>{totalQty}</strong> szt.
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-xl bg-white py-2 shadow-2xl ring-1 ring-slate-200/80">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 pb-2 pt-1">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Zawartość</p>
              <p className="mt-0.5 text-[14px] font-bold tabular-nums text-slate-900">
                {skuCount} SKU · {totalQty} szt.
              </p>
            </div>
            <CarrierMixBadge isMixed={isMixed} size="md" />
          </div>
          <div className="max-h-56 overflow-y-auto px-3">
            {loading ? (
              <p className="py-4 text-center text-[13px] text-slate-500">Wczytywanie…</p>
            ) : items.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-slate-500">Brak pozycji.</p>
            ) : (
              <ul>
                {items.slice(0, 15).map((it) => (
                  <PopoverProductRow key={it.id} item={it} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
