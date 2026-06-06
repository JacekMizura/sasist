import { useCallback, useEffect, useState } from "react";

import { fetchLocationStock, type LocationStockRow } from "../../api/locationStockApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DirectSaleSessionLine } from "../../utils/normalizeDirectSales";
import { lineTotal } from "../../utils/directSales/lineTotal";
import { safeDisplay } from "../../utils/safeStrings";
import { StockBadge } from "./StockBadge";

type Props = {
  line: DirectSaleSessionLine;
  warehouseId: number;
  busy: boolean;
  onQtyChange: (lineId: number, qty: number) => void;
  onLocationChange: (lineId: number, locationId: number | null) => void;
  onRemove: (lineId: number) => void;
};

export function SessionLineCard({ line, warehouseId, busy, onQtyChange, onLocationChange, onRemove }: Props) {
  const [locOpen, setLocOpen] = useState(false);
  const [locRows, setLocRows] = useState<LocationStockRow[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(line.quantity));

  useEffect(() => setQtyDraft(String(line.quantity)), [line.quantity]);

  useEffect(() => {
    if (!locOpen) return;
    let cancelled = false;
    setLocLoading(true);
    void fetchLocationStock({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
      productId: line.product_id,
      availableOnly: true,
    })
      .then((snap) => {
        if (!cancelled) setLocRows(snap.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setLocRows([]);
      })
      .finally(() => {
        if (!cancelled) setLocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locOpen, warehouseId, line.product_id]);

  const commitQty = useCallback(() => {
    const n = Number(qtyDraft.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setQtyDraft(String(line.quantity));
      return;
    }
    onQtyChange(line.id, n);
  }, [qtyDraft, line.id, line.quantity, onQtyChange]);

  return (
    <li className="border-b border-slate-100 py-2 last:border-0">
      <div className="flex gap-2">
        {line.image_url ? (
          <img src={line.image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
            —
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">
            {safeDisplay(line.product_name, `Produkt #${line.product_id}`)}
          </div>
          <div className="text-xs text-slate-500">
            {safeDisplay(line.product_sku, "—")} · EAN {safeDisplay(line.product_ean, "—")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
              {safeDisplay(line.source_location_code, "brak lok.")}
            </span>
            <StockBadge available={line.available_qty_hint} orderedQty={line.quantity} />
            {line.has_reservation ? (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800">Zarezerwowano</span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-slate-900">{lineTotal(line).toFixed(2)} zł</div>
          <div className="text-[10px] text-slate-500">
            {line.unit_price != null ? `${line.unit_price.toFixed(2)} × ${line.quantity}` : `× ${line.quantity}`}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onQtyChange(line.id, Math.max(1, line.quantity - 1))}
          className="h-7 w-7 rounded border border-slate-300 text-sm disabled:opacity-50"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          disabled={busy}
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitQty();
            }
          }}
          className="h-7 w-12 rounded border border-slate-300 text-center text-sm disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onQtyChange(line.id, line.quantity + 1)}
          className="h-7 w-7 rounded border border-slate-300 text-sm disabled:opacity-50"
        >
          +
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setLocOpen((v) => !v)}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
        >
          Lokacja
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(line.id)}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
        >
          Usuń
        </button>
      </div>
      {locOpen ? (
        <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2">
          {locLoading ? (
            <p className="text-xs text-slate-500">Ładuję lokacje…</p>
          ) : locRows.length ? (
            <ul className="max-h-32 space-y-1 overflow-auto">
              {locRows.map((loc) => (
                <li key={loc.location_id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onLocationChange(line.id, loc.location_id);
                      setLocOpen(false);
                    }}
                    className="flex w-full justify-between rounded px-1 py-0.5 text-left text-xs hover:bg-white disabled:opacity-50"
                  >
                    <span>{loc.code}</span>
                    <span className="text-slate-500">{loc.available} szt.</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Brak dostępnych lokacji.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
