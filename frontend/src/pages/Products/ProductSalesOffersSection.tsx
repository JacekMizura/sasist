import { useCallback, useEffect, useState } from "react";

import {
  createOutletSalesOffer,
  deleteProductSalesOffer,
  dispositionOfferLabel,
  listProductSalesOffers,
  patchProductSalesOffer,
  type ProductSalesOfferRead,
} from "../../api/productSalesOffersApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";

type Props = {
  productId: number;
  tenantId: number;
  warehouseId?: number | null;
};

export function ProductSalesOffersSection({ productId, tenantId, warehouseId }: Props) {
  const [offers, setOffers] = useState<ProductSalesOfferRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProductSalesOffers({
        tenantId,
        productId,
        warehouseId,
      });
      setOffers(res.offers ?? []);
      const drafts: Record<number, string> = {};
      for (const o of res.offers ?? []) {
        drafts[o.id] =
          o.sale_price_net != null && Number.isFinite(o.sale_price_net)
            ? String(o.sale_price_net)
            : "";
      }
      setPriceDraft(drafts);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [productId, tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreateOutlet = async () => {
    setBusyId(-1);
    setError(null);
    try {
      await createOutletSalesOffer({ tenantId, productId, warehouseId });
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const onSavePrice = async (offer: ProductSalesOfferRead) => {
    setBusyId(offer.id);
    setError(null);
    const raw = (priceDraft[offer.id] ?? "").trim();
    const body =
      raw === ""
        ? { sale_price_net: null as number | null }
        : { sale_price_net: Number.parseFloat(raw.replace(",", ".")) };
    try {
      await patchProductSalesOffer({ tenantId, offerId: offer.id, body, warehouseId });
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (offer: ProductSalesOfferRead) => {
    if (offer.is_default) return;
    if (!window.confirm(`Usunąć ofertę „${offer.name}”?`)) return;
    setBusyId(offer.id);
    setError(null);
    try {
      await deleteProductSalesOffer({ tenantId, offerId: offer.id });
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full xl:max-w-4xl space-y-6">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <h3 className="text-lg font-bold text-slate-900">Oferty sprzedażowe</h3>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void onCreateOutlet()}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            + Oferta outlet (B)
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Każda oferta wiąże pulę magazynową (disposition). Cena pusta = cena katalogowa produktu.
        </p>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-slate-500">Ładowanie ofert…</p>
        ) : offers.length === 0 ? (
          <p className="text-sm text-slate-500">Brak ofert — zostaną utworzone automatycznie przy pierwszym odczycie.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nazwa</th>
                  <th className="px-3 py-2">Pula</th>
                  <th className="px-3 py-2">Cena netto</th>
                  <th className="px-3 py-2">Dostępne</th>
                  <th className="px-3 py-2">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{o.name}</div>
                      {o.is_default ? (
                        <span className="text-xs text-slate-400">domyślna</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{dispositionOfferLabel(o.stock_disposition)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={
                            o.uses_product_price && o.effective_sale_price_net != null
                              ? `produkt: ${o.effective_sale_price_net}`
                              : "cena produktu"
                          }
                          value={priceDraft[o.id] ?? ""}
                          onChange={(e) =>
                            setPriceDraft((prev) => ({ ...prev, [o.id]: e.target.value }))
                          }
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void onSavePrice(o)}
                          className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50"
                        >
                          Zapisz
                        </button>
                      </div>
                      {o.effective_sale_price_net != null ? (
                        <div className="text-xs text-slate-400">
                          efektywna: {o.effective_sale_price_net.toFixed(2)} zł
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{o.available_qty}</td>
                    <td className="px-3 py-2">
                      {!o.is_default ? (
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void onDelete(o)}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          Usuń
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
