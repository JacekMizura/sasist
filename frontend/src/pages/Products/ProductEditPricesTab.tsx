import { useEffect, useMemo, useState } from "react";

import type { SupplierRead } from "../../api/inboundSuppliersApi";
import { ProductLikeSection } from "../../components/catalog";
import { DataTable, type DataTableColumn } from "../../components/table/DataTable";
import { MoneyInput, Input, Select, Textarea } from "../../design-system";
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

/** Mock HTML field label — exact rhythm. */
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

function SupplierPriceCell({
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

function DlRow({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty?: boolean;
}) {
  const isEmpty = empty ?? (value === "—" || value.trim() === "");
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          isEmpty
            ? "whitespace-nowrap font-medium text-slate-400"
            : "whitespace-nowrap font-semibold text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Product edit — Ceny tab.
 * Presentation is a 1:1 structural port of `edycja_produktu_nowy_widok (1).html`
 * (prices section only). Logic/handlers come from ProductEditModal unchanged.
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

  const supplierColumns = useMemo((): DataTableColumn<SupplierLinkRow>[] => {
    return [
      {
        id: "supplier",
        header: "Dostawca",
        cell: (row) => (
          <span className="pr-0 text-slate-900">
            {(row.supplier_name || "").trim() || `#${row.supplier_id}`}
          </span>
        ),
      },
      {
        id: "price",
        header: "Cena netto",
        cell: (row) => (
          <SupplierPriceCell
            row={row}
            busy={supplierLinksBusy}
            onPatchPrice={(raw) => onPatchSupplierLinkPrice(row.id, raw)}
          />
        ),
      },
      {
        id: "default",
        header: "Domyślny",
        align: "center",
        cell: (row) => (
          <input
            type="radio"
            className="h-4 w-4 cursor-pointer border-slate-300 text-orange-600 focus:ring-orange-500"
            name="product-default-supplier"
            checked={defaultSupplierId === row.supplier_id}
            onChange={() => setDefaultSupplierId(row.supplier_id)}
            disabled={supplierLinksBusy}
            aria-label={`Ustaw ${row.supplier_name || row.supplier_id} jako domyślnego`}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (row) => (
          <button
            type="button"
            disabled={supplierLinksBusy}
            onClick={() => onRemoveSupplierLink(row.id, row.supplier_id)}
            className="text-xs font-medium text-red-500 transition-colors hover:text-red-700 disabled:opacity-40"
          >
            Usuń
          </button>
        ),
      },
    ];
  }, [
    defaultSupplierId,
    onPatchSupplierLinkPrice,
    onRemoveSupplierLink,
    setDefaultSupplierId,
    supplierLinksBusy,
  ]);

  return (
    /* Mock: flex flex-col xl:flex-row gap-6 items-start */
    <div className="flex flex-col items-start gap-6 xl:flex-row">
      {/* Mock left: w-full xl:w-2/3 xl:min-w-[700px] flex flex-col gap-6 */}
      <div className="flex w-full min-w-0 flex-col gap-6 xl:w-2/3 xl:min-w-[700px]">
        <ProductLikeSection title="Kalkulacja cenowa">
          {/* Mock: grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 */}
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
                value={promotion}
                onChange={(e) => setPromotion(e.target.value)}
                rows={4}
                density="comfortable"
                focusTone="brand"
                className="min-h-0 resize-y"
                placeholder="Krótki opis promocji, rabatów lub warunków..."
              />
            </div>
          </div>
        </ProductLikeSection>
      </div>

      {/* Mock right: w-full xl:w-1/3 flex flex-col gap-6 */}
      <div className="flex w-full min-w-0 flex-col gap-6 xl:w-1/3">
        <ProductLikeSection title="Dostawcy i ceny zakupu" compact>
          {cheapestSupplierInsight ? (
            /* Mock: bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg p-3 mb-5 */
            <div className="mb-5 flex items-center rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-3">
              <p className="text-[13px] text-emerald-900">
                <span className="font-bold">Najtańszy dostawca:</span>{" "}
                {(cheapestSupplierInsight.supplier_name || "").trim() || `#${cheapestSupplierInsight.supplier_id}`}{" "}
                — {formatMoneyZl(cheapestSupplierInsight.purchase_price)} netto
              </p>
            </div>
          ) : null}

          {isNew ? (
            <p className="text-sm text-slate-600">Najpierw zapisz produkt, aby móc powiązać go z dostawcami.</p>
          ) : (
            <>
              {/* Mock: overflow-x-auto mb-5 */}
              <DataTable
                density="compact"
                columns={supplierColumns}
                rows={supplierLinkRows}
                getRowKey={(row) => row.id}
                loading={supplierLinksBusy}
                emptyMessage="Brak przypisanych dostawców."
                className="mb-5"
              />

              {/* Mock: bg-gray-50 rounded-lg border border-gray-200 p-4 */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-xs font-medium text-slate-700">Dodaj nowego dostawcę</label>
                <div className="flex gap-2">
                  <Select
                    density="compact"
                    focusTone="brand"
                    className="flex-1 text-slate-600"
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
                  {/* Mock peach CTA: bg-[#f3b584] hover:bg-[#e8a36c] text-gray-900 */}
                  <button
                    type="button"
                    disabled={supplierLinksBusy || !addSupplierPick}
                    onClick={() => onAddSupplierLink()}
                    className="shrink-0 rounded-md bg-[#f3b584] px-4 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-[#e8a36c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Dodaj
                  </button>
                </div>
              </div>
            </>
          )}
        </ProductLikeSection>

        {/* Mock: flex flex-col sm:flex-row xl:flex-col gap-6 */}
        <div className="flex flex-col gap-6 sm:flex-row xl:flex-col">
          <ProductLikeSection title="Ostatni zakup (z PZ)" compact className="flex-1">
            <dl className="divide-y divide-slate-100 text-[13px]">
              <DlRow label="Aktualna cena zakupu" value={currentPurchaseLabel} />
              <DlRow label="Poprzednia cena" value={previousPurchaseLabel} />
              <DlRow label="Data ostatniego zakupu" value={lastDateLabel} />
              <DlRow label="Ostatni dostawca" value={lastSupplierLabel} />
              <DlRow label="Waluta ostatniego zakupu" value={lastCurrencyLabel} />
              <DlRow label="Cena oryginalna (waluta)" value={originalPriceLabel} />
            </dl>
          </ProductLikeSection>

          <ProductLikeSection title="Podsumowanie kosztów" compact className="flex-1">
            <div className="mb-4 space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cena zakupu netto</span>
                <span className="font-medium text-slate-900">{formatMoneyZlDisplay(pricingDisplay.purchaseNet)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cena zakupu brutto</span>
                <span className="font-medium text-slate-900">{formatMoneyZlDisplay(pricingDisplay.purchaseGross)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Stawka VAT</span>
                <span className="font-medium text-slate-900">{pricingDisplay.vatLabel}</span>
              </div>

              <div className="pt-2" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Pakowanie</span>
                <span className="font-medium text-red-500">
                  +{formatMoneyZl(extraCostPackagingNet === "" ? 0 : Number(extraCostPackagingNet))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Prowizja</span>
                <span className="font-medium text-red-500">
                  +{(extraCostCommissionPercent === "" ? 0 : Number(extraCostCommissionPercent)).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Inne koszty</span>
                <span className="font-medium text-red-500">
                  +{formatMoneyZl(extraCostOtherNet === "" ? 0 : Number(extraCostOtherNet))}
                </span>
              </div>
            </div>

            <div className="mb-4 border-t border-slate-200 pt-3 text-[13px]">
              <div className="mb-3 flex items-center justify-between font-bold text-slate-900">
                <span>Łączny koszt netto (Landed)</span>
                <span>{formatMoneyZlDisplay(pricingDisplay.landedCostNet)}</span>
              </div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-slate-500">Cena sprzedaży netto</span>
                <span className="font-medium text-slate-900">{formatMoneyZlDisplay(pricingDisplay.saleNet)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cena sprzedaży brutto</span>
                <span className="font-medium text-slate-900">{formatMoneyZlDisplay(pricingDisplay.saleGross)}</span>
              </div>
            </div>

            {/* Mock footer: bg-gray-50 -mx-5 px-5 -mb-5 pb-5 pt-4 border-t, emerald rows */}
            <div className="-mx-5 -mb-5 space-y-2 border-t border-slate-200 bg-slate-50 px-5 pb-5 pt-4 text-sm font-semibold">
              <div className="flex items-center justify-between text-emerald-600">
                <span>Zysk (Marża PLN)</span>
                <span>{formatMoneyZlDisplay(pricingDisplay.marginValue)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-base text-emerald-600">
                <span>Rentowność (Marża %)</span>
                <span>{pricingDisplay.marginLabel}</span>
              </div>
            </div>
          </ProductLikeSection>
        </div>
      </div>
    </div>
  );
}
