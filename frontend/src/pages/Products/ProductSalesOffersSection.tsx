import { useCallback, useEffect, useMemo, useState } from "react";
import { CaretDown, CaretUp, Plus, X } from "lucide-react";

import {
  createOutletSalesOffer,
  deleteProductSalesOffer,
  dispositionOfferLabel,
  listProductSalesOffers,
  patchProductSalesOffer,
  type ProductSalesOfferRead,
} from "../../api/productSalesOffersApi";
import { listOfferStockPools, type OfferStockPoolRead } from "../../api/offerStockPoolApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { Badge, GhostButton, IconButton, Input, SecondaryButton, Select } from "../../design-system";

type Props = {
  productId: number;
  tenantId: number;
  warehouseId?: number | null;
};

/**
 * Product edit — Oferty tab.
 * DOM hierarchy is a structural 1:1 port of `oferrty karta produktu.html`
 * (marketplace card chrome + table). Columns / handlers stay app SSOT.
 */
export function ProductSalesOffersSection({ productId, tenantId }: Props) {
  const [offers, setOffers] = useState<ProductSalesOfferRead[]>([]);
  const [pools, setPools] = useState<OfferStockPoolRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [collapsed, setCollapsed] = useState(false);

  const defaultPool = useMemo(() => pools.find((p) => p.is_default) ?? null, [pools]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, poolItems] = await Promise.all([
        listProductSalesOffers({ tenantId, productId }),
        listOfferStockPools(tenantId),
      ]);
      setOffers(res.offers ?? []);
      setPools(poolItems);
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
      setCollapsed(false);
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

  const onPoolChange = async (offer: ProductSalesOfferRead, poolId: number) => {
    setBusyId(offer.id);
    setError(null);
    const useDefault = defaultPool != null && poolId === defaultPool.id;
    try {
      await patchProductSalesOffer({
        tenantId,
        offerId: offer.id,
        body: { stock_pool_id: useDefault ? null : poolId },
      });
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

  const selectedPoolId = (offer: ProductSalesOfferRead): number | "" => {
    if (offer.stock_pool_id != null) return offer.stock_pool_id;
    if (defaultPool != null) return defaultPool.id;
    return "";
  };

  return (
    /* mock: <main class="… max-w-[1400px] mx-auto bg-gray-50/30"> */
    <div className="mx-auto w-full max-w-[1400px] bg-gray-50/30">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Oferty</h2>
        <SecondaryButton
          type="button"
          density="compact"
          disabled={busyId !== null}
          onClick={() => void onCreateOutlet()}
          className="!rounded !border-gray-300 !bg-white !px-4 !py-2 !text-sm !font-medium !text-gray-700 hover:!bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.5} aria-hidden />
          Dodaj integrację
        </SecondaryButton>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="space-y-6">
        {/* Karta kanału — chrome jak marketplace w mocku; dane = oferty sprzedażowe SSOT */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-semibold text-gray-800">Oferty sprzedażowe</h3>
              <SecondaryButton
                type="button"
                density="compact"
                disabled={busyId !== null}
                onClick={() => void onCreateOutlet()}
                className="!rounded !border-gray-300 !bg-white !px-3 !py-1 !text-xs !font-medium !text-gray-600 hover:!bg-gray-50"
              >
                Dodaj nową ofertę
              </SecondaryButton>
              <SecondaryButton
                type="button"
                density="compact"
                onClick={() => setCollapsed((v) => !v)}
                className="!rounded !border-gray-300 !bg-white !px-3 !py-1 !text-xs !font-medium !text-gray-600 hover:!bg-gray-50"
              >
                {collapsed ? (
                  <>
                    <CaretDown className="h-3 w-3" aria-hidden /> Rozwiń
                  </>
                ) : (
                  <>
                    <CaretUp className="h-3 w-3" aria-hidden /> Zwiń
                  </>
                )}
              </SecondaryButton>
            </div>
          </div>

          {!collapsed ? (
            <div className="overflow-x-auto">
              {loading ? (
                <p className="px-5 py-6 text-sm text-gray-500">Ładowanie ofert…</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500">
                      <th className="px-4 py-3 font-medium">Nazwa</th>
                      <th className="w-36 px-4 py-3 font-medium">Pula disposition</th>
                      <th className="w-44 px-4 py-3 font-medium">Źródło stanu</th>
                      <th className="w-44 px-4 py-3 font-medium">Cena netto</th>
                      <th className="w-24 px-4 py-3 font-medium">Dostępne</th>
                      <th className="w-36 px-4 py-3 font-medium">Status</th>
                      <th className="w-28 px-4 py-3 text-center font-medium">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {offers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="bg-white px-4 py-6 text-center text-gray-500">
                          Produkt nie jest obecnie oferowany — oferty pojawią się po utworzeniu lub
                          automatycznie przy pierwszym odczycie.
                        </td>
                      </tr>
                    ) : (
                      offers.map((o) => (
                        <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-b-0">
                          <td className="px-4 py-3.5 align-top">
                            <div className="font-medium text-gray-900">{o.name}</div>
                            {o.is_default ? (
                              <div className="mt-1 text-[10px] text-gray-400">domyślna</div>
                            ) : null}
                          </td>
                          <td className="border-l-4 border-orange-500 px-4 py-3.5 align-top">
                            {dispositionOfferLabel(o.stock_disposition)}
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            {pools.length === 0 ? (
                              <span className="text-gray-500">{o.stock_pool_name ?? "—"}</span>
                            ) : (
                              <Select
                                density="compact"
                                focusTone="brand"
                                value={selectedPoolId(o)}
                                disabled={busyId === o.id}
                                onChange={(e) => {
                                  const v = Number.parseInt(e.target.value, 10);
                                  if (Number.isFinite(v)) void onPoolChange(o, v);
                                }}
                                className="max-w-[12rem] bg-white"
                                aria-label="Źródło stanu"
                              >
                                {pools.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.is_default ? " (domyślna)" : ""}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                inputMode="decimal"
                                density="compact"
                                focusTone="brand"
                                className="w-28"
                                placeholder={
                                  o.uses_product_price && o.effective_sale_price_net != null
                                    ? `produkt: ${o.effective_sale_price_net}`
                                    : "cena produktu"
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
                                efektywna: {o.effective_sale_price_net.toFixed(2)} zł
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 align-top font-medium">{o.available_qty}</td>
                          <td className="px-4 py-3.5 align-top">
                            {o.active ? (
                              <div className="w-fit rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                Aktywna
                              </div>
                            ) : (
                              <Badge tone="neutral" density="compact">
                                Nieaktywna
                              </Badge>
                            )}
                          </td>
                          <td className="space-x-1.5 px-4 py-3.5 text-center align-top text-base text-gray-500">
                            {!o.is_default ? (
                              <IconButton
                                type="button"
                                tone="danger"
                                density="compact"
                                disabled={busyId === o.id}
                                title="Usuń"
                                onClick={() => void onDelete(o)}
                                className="!text-red-500 hover:!text-red-700"
                              >
                                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                              </IconButton>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
