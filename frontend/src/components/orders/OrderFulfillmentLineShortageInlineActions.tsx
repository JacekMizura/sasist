import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { patchOrderItemLine } from "../../api/ordersApi";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { fmtOmsQty } from "./omsFulfillmentLinePresentation";
import { ConfirmModal } from "../ui/ConfirmModal";

type Props = {
  orderId: number;
  orderItemId: number;
  waiting: boolean;
  onRefreshOrder: () => void | Promise<void>;
  onRefreshWms: () => void | Promise<void>;
  onReplaceProduct: (orderItemId: number) => void;
  productName: string;
  sku: string | null;
  ean: string | null;
  orderedQuantity: number;
  missingQuantity: number;
  productImageUrl?: string | null;
};

async function refreshAll(onRefreshOrder: () => void | Promise<void>, onRefreshWms: () => void | Promise<void>) {
  await onRefreshOrder();
  await onRefreshWms();
  dispatchWmsShortagesUpdated();
}

/** Akcje OMS na braku z tej samej ścieżki co „Braki z WMS” — po mutacji zawsze odśwież zamówienie + wms-fulfillment. */
export default function OrderFulfillmentLineShortageInlineActions({
  orderId,
  orderItemId,
  waiting,
  onRefreshOrder,
  onRefreshWms,
  onReplaceProduct,
  productName,
  sku,
  ean,
  orderedQuantity,
  missingQuantity,
  productImageUrl,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);

  const removeMissingQty = async () => {
    setBusy(true);
    try {
      await patchOrderItemLine(orderId, orderItemId, { remove_missing: true });
      setRemoveModalOpen(false);
      await refreshAll(onRefreshOrder, onRefreshWms);
    } catch {
      window.alert("Nie udało się zaktualizować pozycji.");
    } finally {
      setBusy(false);
    }
  };

  const toggleWaiting = async (next: boolean) => {
    setBusy(true);
    try {
      await patchOrderItemLine(orderId, orderItemId, { waiting_for_stock: next });
      await refreshAll(onRefreshOrder, onRefreshWms);
    } catch {
      window.alert("Nie udało się zapisać flagi „czeka na towar”.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {removeModalOpen ? (
        <ConfirmModal
          title={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Usuń brakujący produkt z zamówienia?
            </span>
          }
          confirmLabel="Usuń produkt"
          confirmTone="danger"
          maxWidthClassName="max-w-xl"
          pending={busy}
          onCancel={() => {
            if (!busy) setRemoveModalOpen(false);
          }}
          onConfirm={removeMissingQty}
          message={
            <div className="space-y-4 text-left">
              <p className="text-sm text-slate-700">
                Produkt zostanie usunięty z nierozwiązanego braku.
                <br />
                Zebrane operacje pozostaną zapisane w historii zamówienia.
              </p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Ta operacja zmieni ilość zamówioną na tej pozycji.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                    {productImageUrl ? <img src={productImageUrl} alt={productName} className="h-full w-full object-contain" /> : null}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-semibold text-slate-900">{productName || "—"}</p>
                    <p className="text-xs text-slate-500">
                      SKU: {sku?.trim() || "—"} {ean?.trim() ? `• EAN: ${ean.trim()}` : ""}
                    </p>
                    <p className="text-xs font-medium text-slate-700">
                      Brak: {fmtOmsQty(missingQuantity)} szt. • Zamówiono: {fmtOmsQty(orderedQuantity)} szt.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          }
        />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onReplaceProduct(orderItemId)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Zamień produkt
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRemoveModalOpen(true)}
          className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-50 disabled:opacity-50"
        >
          Usuń produkt z zamówienia
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleWaiting(!waiting)}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
        >
          {waiting ? "Cofnij „czeka na towar”" : "Oznacz jako czeka"}
        </button>
      </div>
    </>
  );
}
