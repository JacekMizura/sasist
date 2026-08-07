import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import {
  createOutletSalesOffer,
  deleteProductSalesOffer,
  dispositionOfferLabel,
  listProductSalesOffers,
  patchProductSalesOffer,
  type ProductSalesOfferRead,
} from "../../api/productSalesOffersApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { GhostButton, Input } from "../../design-system";

type Props = {
  productId: number;
  tenantId: number;
  warehouseId?: number | null;
};

type ChannelGroup = {
  key: string;
  title: string;
  offers: ProductSalesOfferRead[];
};

/**
 * Product edit — Oferty tab.
 * Sellasist-like chrome: page title + „Dodaj integrację”, then collapsible channel cards with offer tables.
 * Data remains product sales-offers SSOT (disposition / pool / price).
 */
export function ProductSalesOffersSection({ productId, tenantId }: Props) {
  const [offers, setOffers] = useState<ProductSalesOfferRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const channels = useMemo((): ChannelGroup[] => {
    const map = new Map<string, ProductSalesOfferRead[]>();
    for (const o of offers) {
      const key = (o.stock_disposition || "SALEABLE").toUpperCase();
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    const order = ["SALEABLE", "OUTLET_B"];
    const keys = [...map.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.localeCompare(b);
    });
    if (keys.length === 0) {
      return [{ key: "SALEABLE", title: "Sklep", offers: [] }];
    }
    return keys.map((key) => ({
      key,
      title: key === "SALEABLE" ? "Sklep" : dispositionOfferLabel(key),
      offers: map.get(key) ?? [],
    }));
  }, [offers]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProductSalesOffers({ tenantId, productId });
      setOffers(res.offers ?? []);
      const drafts: Record<number, string> = {};
      for (const o of res.offers ?? []) {
        drafts[o.id] =
          o.sale_price_net != null && Number.isFinite(o.sale_price_net) ? String(o.sale_price_net) : "";
      }
      setPriceDraft(drafts);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [productId, tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreateOutlet = async () => {
    setBusyId(-1);
    setError(null);
    try {
      await createOutletSalesOffer({ tenantId, productId });
      await reload();
      setCollapsed((prev) => ({ ...prev, OUTLET_B: false }));
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
      await patchProductSalesOffer({ tenantId, offerId: offer.id, body });
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

  const isCollapsed = (key: string) => Boolean(collapsed[key]);

  return (
    <div className="w-full max-w-none bg-white">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">Oferty</h2>
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => void onCreateOutlet()}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.5} aria-hidden />
          Dodaj integrację
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="space-y-6">
        {channels.map((ch) => (
          <div key={ch.key} className="overflow-hidden rounded border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{ch.title}</h3>
                {ch.key === "SALEABLE" || ch.key === "OUTLET_B" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void onCreateOutlet()}
                    className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Dodaj nową ofertę
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [ch.key]: !prev[ch.key] }))}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {isCollapsed(ch.key) ? (
                    <>
                      <ChevronDown className="h-3 w-3" aria-hidden /> Rozwiń
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-3 w-3" aria-hidden /> Zwiń
                    </>
                  )}
                </button>
              </div>
            </div>

            {!isCollapsed(ch.key) ? (
              <div className="overflow-x-auto">
                {loading ? (
                  <p className="px-5 py-6 text-sm text-gray-500">Ładowanie ofert…</p>
                ) : ch.offers.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">
                    Produkt nie jest obecnie oferowany w tym kanale.
                  </p>
                ) : (
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">ID oferty</th>
                        <th className="px-4 py-2.5 font-medium">Nazwa</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">Stan</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">Cena</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">Status</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-800">
                      {ch.offers.map((o) => (
                        <tr key={o.id} className="border-b border-gray-100 last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                            {o.id}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-gray-900">{o.name}</div>
                            {o.is_default ? (
                              <div className="mt-0.5 text-[10px] text-gray-400">domyślna</div>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top font-medium tabular-nums">
                            {o.available_qty}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                inputMode="decimal"
                                density="compact"
                                focusTone="brand"
                                className="w-24"
                                placeholder={
                                  o.uses_product_price && o.effective_sale_price_net != null
                                    ? String(o.effective_sale_price_net)
                                    : "cena"
                                }
                                value={priceDraft[o.id] ?? ""}
                                onChange={(e) =>
                                  setPriceDraft((prev) => ({ ...prev, [o.id]: e.target.value }))
                                }
                              />
                              <GhostButton
                                type="button"
                                density="compact"
                                disabled={busyId === o.id}
                                onClick={() => void onSavePrice(o)}
                                className="!px-1 !py-0 text-xs font-medium !text-sky-700 hover:!bg-transparent hover:underline disabled:opacity-50"
                              >
                                Zapisz
                              </GhostButton>
                            </div>
                            {o.effective_sale_price_net != null ? (
                              <div className="mt-1 text-[10px] text-gray-400">
                                {o.effective_sale_price_net.toFixed(2)} zł
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {o.active ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                Aktywna
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                                Nieaktywna
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center justify-center gap-1">
                              {!o.is_default ? (
                                <button
                                  type="button"
                                  disabled={busyId === o.id}
                                  title="Usuń"
                                  onClick={() => void onDelete(o)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </button>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
