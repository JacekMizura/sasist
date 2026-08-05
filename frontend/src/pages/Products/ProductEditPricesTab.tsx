import { useEffect, useState } from "react";

import type { SupplierRead } from "../../api/inboundSuppliersApi";
import {
  GhostButton,
  Input,
  MoneyInput,
  Radio,
  SecondaryButton,
  Select,
  Textarea,
} from "../../design-system";
import type { ProductPricingDisplay } from "../../utils/resolvedProductPricing";
import { formatMoneyZlDisplay } from "./productPricingDisplay";

type SupplierLinkRow = {
  id: number;
  supplier_id: number;
  supplier_name: string;
  purchase_price: number | null;
  is_default: boolean;
};

type CheapestInsight = {
  supplier_id: number;
  supplier_name: string;
  purchase_price: number;
} | null;

export type ProductEditPricesTabProps = {
  isNew: boolean;
  salePrice: number | "";
  setSalePrice: (v: number | "") => void;
  purchasePrice: number | "";
  setPurchasePrice: (v: number | "") => void;
  extraCostPackagingNet: number | "";
  setExtraCostPackagingNet: (v: number | "") => void;
  extraCostCommissionPercent: number | "";
  setExtraCostCommissionPercent: (v: number | "") => void;
  extraCostOtherNet: number | "";
  setExtraCostOtherNet: (v: number | "") => void;
  vatRate: string;
  setVatRate: (v: string) => void;
  promotion: string;
  setPromotion: (v: string) => void;
  cheapestSupplierInsight: CheapestInsight;
  supplierLinkRows: SupplierLinkRow[];
  supplierLinksBusy: boolean;
  suppliersCatalog: SupplierRead[];
  addSupplierPick: string;
  setAddSupplierPick: (v: string) => void;
  defaultSupplierId: number | null;
  setDefaultSupplierId: (v: number | null) => void;
  onAddSupplierLink: () => void;
  onPatchSupplierLinkPrice: (linkId: number, raw: string) => void;
  onRemoveSupplierLink: (linkId: number, supplierId: number) => void;
  previousPurchasePrice: number | "";
  lastPurchaseDate: string | null | undefined;
  lastSupplierName: string | null | undefined;
  lastPurchaseCurrency: string | null | undefined;
  purchasePriceOriginal: number | "" | null | undefined;
  purchaseCurrency: string | null | undefined;
  pricingDisplay: ProductPricingDisplay;
  formatMoneyZl: (v: number | null | undefined) => string;
  formatDateTimePl: (v: string | null | undefined) => string;
};

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700";

/**
 * Inline supplier price — same DOM slot as mock `<input class="w-20 …">`.
 */
function SupplierPriceInput({
  row,
  busy,
  onPatchPrice,
}: {
  row: SupplierLinkRow;
  busy: boolean;
  onPatchPrice: (raw: string) => void;
}) {
  const [local, setLocal] = useState<number | "">(row.purchase_price ?? "");
  useEffect(() => {
    setLocal(row.purchase_price ?? "");
  }, [row.purchase_price, row.id]);

  return (
    <MoneyInput
      value={local}
      onValueChange={setLocal}
      onBlur={() => onPatchPrice(local === "" ? "" : String(local))}
      disabled={busy}
      currency=""
      density="compact"
      className="!w-20"
      aria-label="Cena netto dostawcy"
    />
  );
}

/**
 * Product edit — Ceny tab.
 * DOM hierarchy is a structural 1:1 port of `ceny karta produktu.html`
 * (main two-column body under tabs). Logic / field wiring unchanged.
 */
export function ProductEditPricesTab({
  isNew,
  salePrice,
  setSalePrice,
  purchasePrice,
  setPurchasePrice,
  extraCostPackagingNet,
  setExtraCostPackagingNet,
  extraCostCommissionPercent,
  setExtraCostCommissionPercent,
  extraCostOtherNet,
  setExtraCostOtherNet,
  vatRate,
  setVatRate,
  promotion,
  setPromotion,
  cheapestSupplierInsight,
  supplierLinkRows,
  supplierLinksBusy,
  suppliersCatalog,
  addSupplierPick,
  setAddSupplierPick,
  defaultSupplierId,
  setDefaultSupplierId,
  onAddSupplierLink,
  onPatchSupplierLinkPrice,
  onRemoveSupplierLink,
  previousPurchasePrice,
  lastPurchaseDate,
  lastSupplierName,
  lastPurchaseCurrency,
  purchasePriceOriginal,
  purchaseCurrency,
  pricingDisplay,
  formatMoneyZl,
  formatDateTimePl,
}: ProductEditPricesTabProps) {
  const currentPurchaseLabel = formatMoneyZl(purchasePrice === "" ? null : purchasePrice);
  const previousPurchaseLabel = formatMoneyZl(previousPurchasePrice === "" ? null : previousPurchasePrice);
  const lastDateLabel = formatDateTimePl(lastPurchaseDate);
  const lastSupplierLabel = (lastSupplierName || "").trim() || "—";
  const lastCurrencyLabel = (lastPurchaseCurrency || "").trim() || "—";
  const originalPriceLabel =
    purchasePriceOriginal === "" || purchasePriceOriginal == null
      ? "—"
      : `${Number(purchasePriceOriginal).toFixed(4)} ${(purchaseCurrency || "").trim() || ""}`.trim();

  const emptyDd = "font-medium text-gray-400";
  const filledDd = "whitespace-nowrap font-semibold text-gray-900";

  return (
    <div className="w-full space-y-6">
      <div
        style={{
          background: "#ff0000",
          color: "white",
          fontSize: 32,
          padding: 20,
          fontWeight: "bold",
        }}
      >
        ==============================
        <br />
        TEST CENY TAB
        <br />
        ==============================
      </div>
    {/* mock: <div class="flex flex-col xl:flex-row gap-6 items-start"> */}
    <div className="flex flex-col items-start gap-6 xl:flex-row">
      {/* KOLUMNA LEWA: w-full xl:w-2/3 xl:min-w-[700px] */}
      <div className="flex w-full flex-col gap-6 xl:w-2/3 xl:min-w-[700px]">
        {/* KARTA: Kalkulacja cenowa */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Kalkulacja cenowa</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              <div>
                <label className={labelClass}>Docelowa cena sprzedaży</label>
                <MoneyInput
                  value={salePrice}
                  onValueChange={setSalePrice}
                  currency=""
                  density="comfortable"
                  focusTone="brand"
                />
              </div>

              <div>
                <label className={labelClass}>Ręczna cena zakupu netto</label>
                <MoneyInput
                  value={purchasePrice}
                  onValueChange={setPurchasePrice}
                  currency=""
                  density="comfortable"
                  focusTone="brand"
                />
              </div>

              <div>
                <label className={labelClass}>Koszty pakowania (netto)</label>
                <MoneyInput
                  value={extraCostPackagingNet}
                  onValueChange={setExtraCostPackagingNet}
                  currency=""
                  density="comfortable"
                  focusTone="brand"
                />
              </div>

              <div>
                <label className={labelClass}>Prowizja marketplace (%)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  density="comfortable"
                  focusTone="brand"
                  value={extraCostCommissionPercent === "" ? "" : extraCostCommissionPercent}
                  onChange={(e) => {
                    const s = String(e.target.value).trim().replace(",", ".");
                    if (s === "") setExtraCostCommissionPercent("");
                    else {
                      const n = parseFloat(s);
                      if (Number.isFinite(n)) setExtraCostCommissionPercent(n);
                    }
                  }}
                />
              </div>

              <div>
                <label className={labelClass}>Inne koszty operacyjne (netto)</label>
                <MoneyInput
                  value={extraCostOtherNet}
                  onValueChange={setExtraCostOtherNet}
                  currency=""
                  density="comfortable"
                  focusTone="brand"
                />
              </div>

              <div>
                <label className={labelClass}>Stawka VAT (%)</label>
                <Input
                  type="text"
                  density="comfortable"
                  focusTone="brand"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  placeholder="np. 23"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Notatka promocyjna / cenowa</label>
                <Textarea
                  rows={4}
                  value={promotion}
                  onChange={(e) => setPromotion(e.target.value)}
                  placeholder="Krótki opis promocji, rabatów lub warunków..."
                  density="comfortable"
                  focusTone="brand"
                  className="resize-y text-gray-700"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* KOLUMNA PRAWA: w-full xl:w-1/3 */}
      <div className="flex w-full flex-col gap-6 xl:w-1/3">
        {/* KARTA: Dostawcy i ceny zakupu */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Dostawcy i ceny zakupu</h2>
          </div>

          <div className="p-5">
            {cheapestSupplierInsight ? (
              <div className="mb-5 flex items-center rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-3">
                <p className="text-[13px] text-emerald-900">
                  <span className="font-bold">Najtańszy dostawca:</span>{" "}
                  {(cheapestSupplierInsight.supplier_name || "").trim() || `#${cheapestSupplierInsight.supplier_id}`}{" "}
                  — {formatMoneyZl(cheapestSupplierInsight.purchase_price)} netto
                </p>
              </div>
            ) : null}

            {isNew ? (
              <p className="mb-5 text-sm text-gray-600">Najpierw zapisz produkt, aby móc powiązać go z dostawcami.</p>
            ) : (
              <>
                <div className="mb-5 overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="pb-2 font-medium">Dostawca</th>
                        <th className="pb-2 font-medium">Cena netto</th>
                        <th className="pb-2 text-center font-medium">Domyślny</th>
                        <th className="pb-2 text-right font-medium">Usuń</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {supplierLinksBusy && supplierLinkRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-gray-500">
                            Wczytywanie…
                          </td>
                        </tr>
                      ) : supplierLinkRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-gray-500">
                            Brak przypisanych dostawców.
                          </td>
                        </tr>
                      ) : (
                        supplierLinkRows.map((row) => (
                          <tr key={row.id}>
                            <td className="py-3 pr-3 text-gray-900">
                              {(row.supplier_name || "").trim() || `#${row.supplier_id}`}
                            </td>
                            <td className="py-3 pr-3">
                              <SupplierPriceInput
                                row={row}
                                busy={supplierLinksBusy}
                                onPatchPrice={(raw) => onPatchSupplierLinkPrice(row.id, raw)}
                              />
                            </td>
                            <td className="py-3 pr-3 text-center">
                              <Radio
                                name="product-default-supplier"
                                className="h-4 w-4 cursor-pointer border-gray-300 text-orange-600 focus:ring-orange-500"
                                checked={defaultSupplierId === row.supplier_id}
                                onChange={() => setDefaultSupplierId(row.supplier_id)}
                                disabled={supplierLinksBusy}
                              />
                            </td>
                            <td className="py-3 text-right">
                              <GhostButton
                                type="button"
                                density="compact"
                                disabled={supplierLinksBusy}
                                onClick={() => onRemoveSupplierLink(row.id, row.supplier_id)}
                                className="!px-0 !py-0 text-xs font-medium text-red-500 hover:bg-transparent hover:text-red-700 disabled:opacity-40"
                              >
                                Usuń
                              </GhostButton>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <label className="mb-2 block text-xs font-medium text-gray-700">Dodaj nowego dostawcę</label>
                  <div className="flex gap-2">
                    <Select
                      className="flex-1 bg-white text-gray-600"
                      density="compact"
                      focusTone="brand"
                      value={addSupplierPick}
                      onChange={(e) => setAddSupplierPick(e.target.value)}
                      disabled={supplierLinksBusy}
                    >
                      <option value="">— Wybierz z listy —</option>
                      {suppliersCatalog
                        .filter((s) => !supplierLinkRows.some((r) => r.supplier_id === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </Select>
                    <SecondaryButton
                      type="button"
                      density="compact"
                      disabled={supplierLinksBusy || !addSupplierPick}
                      onClick={() => onAddSupplierLink()}
                      className="!border-transparent !bg-[#f3b584] !px-4 !py-1.5 !text-sm !font-medium !text-gray-900 shadow-sm hover:!bg-[#e8a36c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Dodaj
                    </SecondaryButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Ostatni zakup + Podsumowanie */}
        <div className="flex flex-col gap-6 sm:flex-row xl:flex-col">
          {/* KARTA: Ostatni zakup (z PZ) */}
          <section className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Ostatni zakup (z PZ)</h2>
            </div>
            <div className="p-5">
              <dl className="divide-y divide-gray-100 text-[13px]">
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Aktualna cena zakupu</dt>
                  <dd className={currentPurchaseLabel === "—" ? emptyDd : filledDd}>{currentPurchaseLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Poprzednia cena</dt>
                  <dd className={previousPurchaseLabel === "—" ? emptyDd : filledDd}>{previousPurchaseLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Data ostatniego zakupu</dt>
                  <dd className={lastDateLabel === "—" ? emptyDd : "font-medium text-gray-900"}>{lastDateLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Ostatni dostawca</dt>
                  <dd className={lastSupplierLabel === "—" ? emptyDd : "font-medium text-gray-900"}>
                    {lastSupplierLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Waluta ostatniego zakupu</dt>
                  <dd className={lastCurrencyLabel === "—" ? emptyDd : "font-medium text-gray-900"}>
                    {lastCurrencyLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-gray-500">Cena oryginalna (waluta)</dt>
                  <dd className={originalPriceLabel === "—" ? emptyDd : "font-medium text-gray-900"}>
                    {originalPriceLabel}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* KARTA: Podsumowanie kosztów */}
          <section className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Podsumowanie kosztów</h2>
            </div>
            <div className="p-5">
              <div className="mb-4 space-y-1.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cena zakupu netto</span>
                  <span className="font-medium text-gray-900">{formatMoneyZlDisplay(pricingDisplay.purchaseNet)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cena zakupu brutto</span>
                  <span className="font-medium text-gray-900">
                    {formatMoneyZlDisplay(pricingDisplay.purchaseGross)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Stawka VAT</span>
                  <span className="font-medium text-gray-900">{pricingDisplay.vatLabel}</span>
                </div>

                <div className="pt-2" />
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Pakowanie</span>
                  <span className="font-medium text-red-500">
                    +{formatMoneyZl(extraCostPackagingNet === "" ? 0 : Number(extraCostPackagingNet))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Prowizja</span>
                  <span className="font-medium text-red-500">
                    +{(extraCostCommissionPercent === "" ? 0 : Number(extraCostCommissionPercent)).toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Inne koszty</span>
                  <span className="font-medium text-red-500">
                    +{formatMoneyZl(extraCostOtherNet === "" ? 0 : Number(extraCostOtherNet))}
                  </span>
                </div>
              </div>

              <div className="mb-4 border-t border-gray-200 pt-3 text-[13px]">
                <div className="mb-3 flex items-center justify-between font-bold text-gray-900">
                  <span>Łączny koszt netto (Landed)</span>
                  <span>{formatMoneyZlDisplay(pricingDisplay.landedCostNet)}</span>
                </div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-gray-500">Cena sprzedaży netto</span>
                  <span className="font-medium text-gray-900">{formatMoneyZlDisplay(pricingDisplay.saleNet)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cena sprzedaży brutto</span>
                  <span className="font-medium text-gray-900">{formatMoneyZlDisplay(pricingDisplay.saleGross)}</span>
                </div>
              </div>

              <div className="-mx-5 -mb-5 space-y-2 border-t border-gray-200 bg-gray-50 px-5 pb-5 pt-4 text-sm font-semibold">
                <div className="flex items-center justify-between text-emerald-600">
                  <span>Zysk (Marża PLN)</span>
                  <span>{formatMoneyZlDisplay(pricingDisplay.marginValue)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-base text-emerald-600">
                  <span>Rentowność (Marża %)</span>
                  <span>{pricingDisplay.marginLabel}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
    </div>
  );
}
