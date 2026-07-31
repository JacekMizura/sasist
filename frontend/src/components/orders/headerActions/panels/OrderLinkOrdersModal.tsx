import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import { lookupOrdersForWms } from "../../../../api/wmsReturnsApi";
import { DAMAGE_TENANT_ID } from "../../../../pages/damage/damageShared";
import type { OrderLookupHit } from "../../../../types/wmsReturn";
import { OrderHeaderModalFrame } from "../OrderHeaderModalFrame";
import {
  linkOrderLocally,
  readLinkedOrders,
  unlinkOrderLocally,
  type OrderHeaderLinkedOrder,
} from "../orderHeaderLinkStore";

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  warehouseId: number | null;
};

export function OrderLinkOrdersModal({ open, onClose, orderId, warehouseId }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<OrderLookupHit[]>([]);
  const [linked, setLinked] = useState<OrderHeaderLinkedOrder[]>([]);

  useEffect(() => {
    if (!open) return;
    setLinked(readLinkedOrders(orderId));
    setQ("");
    setHits([]);
  }, [open, orderId]);

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (query.length < 1) {
      setHits([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await lookupOrdersForWms(query, DAMAGE_TENANT_ID, warehouseId);
      setHits((rows ?? []).filter((r) => Number(r.id) !== orderId).slice(0, 12));
    } catch {
      toast.error("Nie udało się wyszukać zamówień.");
      setHits([]);
    } finally {
      setBusy(false);
    }
  }, [q, warehouseId, orderId]);

  const onLink = (hit: OrderLookupHit) => {
    const number = String(hit.number ?? hit.id);
    const next = linkOrderLocally(orderId, { id: hit.id, number });
    setLinked(next);
    toast.success(`Połączono z zamówieniem ${number}.`);
  };

  const onUnlink = (targetId: number) => {
    const next = unlinkOrderLocally(orderId, targetId);
    setLinked(next);
    toast.success("Rozłączono zamówienie.");
  };

  return (
    <OrderHeaderModalFrame
      open={open}
      onClose={onClose}
      title="Połącz z innym zamówieniem"
      footer={
        <p className="text-[11px] text-slate-500">
          Powiązania są zapisane lokalnie w przeglądarce — API połączeń zamówień będzie podpięte w kolejnym kroku.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Wyszukiwarka</label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder="Numer zamówienia, klient…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSearch()}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Szukaj"}
            </button>
          </div>
        </div>

        {hits.length > 0 ? (
          <ul className="space-y-1.5">
            {hits.map((hit) => (
              <li
                key={hit.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-sm text-slate-800">
                  #{hit.number ?? hit.id}
                  {hit.status ? ` · ${hit.status}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onLink(hit)}
                  className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-100"
                >
                  Połącz
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Już połączone
          </p>
          {linked.length === 0 ? (
            <p className="text-sm text-slate-500">Brak powiązanych zamówień.</p>
          ) : (
            <ul className="space-y-1.5">
              {linked.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2"
                >
                  <Link to={`/orders/${row.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                    #{row.number}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onUnlink(row.id)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Rozłącz
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </OrderHeaderModalFrame>
  );
}
