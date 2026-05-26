import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getDelivery, createPzFromDelivery, type DeliveryRead } from "../../api/inboundDeliveriesApi";

type Props = {
  open: boolean;
  tenantId: number;
  deliveryId: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

export function CreatePzFromDeliveryModal({ open, tenantId, deliveryId, onClose, onSuccess }: Props) {
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<DeliveryRead | null>(null);

  const reset = useCallback(() => {
    setLoadErr(null);
    setDetail(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    let cancelled = false;
    setLoadErr(null);
    void (async () => {
      try {
        const d = await getDelivery(tenantId, deliveryId);
        if (cancelled) return;
        setDetail(d);
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać zamówienia.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, deliveryId, reset]);

  const planItems = useMemo(() => {
    if (!detail?.items.length) return [];
    return detail.items.filter((it) => Number(it.quantity_ordered) > 1e-9);
  }, [detail]);

  const canSubmit = useMemo(() => {
    return Boolean(detail) && planItems.length > 0 && !busy && !loadErr;
  }, [detail, planItems.length, busy, loadErr]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !canSubmit) return;
    setBusy(true);
    try {
      const res = await createPzFromDelivery(tenantId, deliveryId);
      onSuccess(`Utworzono szkic przyjęcia ${res.number} (ilości zamówione).`);
      onClose();
    } catch (err: unknown) {
      const d =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się utworzyć PZ.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Przyjęcie dostawy z zamówienia #{deliveryId}</h2>
          <p className="mt-1 text-xs text-slate-500">Dokument magazynowy — jedna lista: produkty, kartony i materiały pakowe.</p>
        </div>

        {loadErr ? <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-800">{loadErr}</div> : null}

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {detail && planItems.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Pozycje do przyjęcia</p>
                <div className="rounded-lg border border-slate-200 text-sm">
                  <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Nazwa</span>
                    <span className="text-right">Zamówiono</span>
                  </div>
                  {planItems.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-[1fr_auto] gap-x-4 border-t border-slate-100 px-3 py-2.5 first:border-t-0"
                    >
                      <span className="text-slate-900">
                        {(it.display_name || "").trim() ||
                          (it.product_name || "").trim() ||
                          (it.wm_name || "").trim() ||
                          "Pozycja usunięta"}
                      </span>
                      <span className="text-right tabular-nums font-medium text-slate-800">
                        {fmtQty(Number(it.quantity_ordered))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : detail && detail.items.length > 0 ? (
              <p className="text-sm text-slate-600">Brak linii z ilością zamówioną &gt; 0.</p>
            ) : detail ? (
              <p className="text-sm text-slate-600">Brak pozycji na zamówieniu.</p>
            ) : !loadErr ? (
              <p className="text-sm text-slate-500">Wczytywanie…</p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? "Zapisywanie…" : "Utwórz przyjęcie"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
