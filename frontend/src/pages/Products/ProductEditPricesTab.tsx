import { useEffect, useMemo, useState } from "react";

import type { SupplierRead } from "../../api/inboundSuppliersApi";
import {
  ProductLikeSection,
  productLikeAsideColClass,
  productLikeFieldLabelClass,
  productLikeInputClass,
  productLikeMainColClass,
  productLikeTwoColClass,
} from "../../components/catalog";
import { DataTable, type DataTableColumn } from "../../components/table/DataTable";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { MoneyInput, MetricCard, StatusBadge, type StatusTone } from "../../design-system";
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

function marginStatusTone(marginPercent: number | null | undefined): StatusTone {
  if (marginPercent == null || Number.isNaN(Number(marginPercent))) return "neutral";
  if (Number(marginPercent) > 30) return "success";
  if (Number(marginPercent) >= 10) return "warning";
  return "danger";
}

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
      density="compact"
      className="min-w-[5.5rem] max-w-[7rem]"
      aria-label="Cena netto dostawcy"
    />
  );
}

/**
 * Product edit — Ceny tab (HTML UX, SASIST components only).
 * Presentation only; all state/handlers come from ProductEditModal.
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
  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;
  const marginTone = marginStatusTone(pricingDisplay.marginPercent);

  const supplierColumns = useMemo((): DataTableColumn<SupplierLinkRow>[] => {
    return [
      {
        id: "supplier",
        header: "Dostawca",
        cell: (row) => (row.supplier_name || "").trim() || `#${row.supplier_id}`,
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
        header: "Akcje",
        align: "right",
        cell: (row) => (
          <button
            type="button"
            disabled={supplierLinksBusy}
            onClick={() => onRemoveSupplierLink(row.id, row.supplier_id)}
            className="text-xs font-medium text-rose-600 transition-colors hover:text-rose-800 disabled:opacity-40"
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
    <div className={productLikeTwoColClass}>
      <div className={productLikeMainColClass}>
        <ProductLikeSection title="Kalkulacja cenowa">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <div>
              <label className={fieldLabel}>Docelowa cena sprzedaży</label>
              <MoneyInput value={salePrice} onValueChange={setSalePrice} min={0} />
            </div>
            <div>
              <label className={fieldLabel}>Ręczna cena zakupu netto</label>
              <MoneyInput value={purchasePrice} onValueChange={setPurchasePrice} min={0} />
            </div>
            <div>
              <label className={fieldLabel}>Koszty pakowania (netto)</label>
              <MoneyInput value={extraCostPackagingNet} onValueChange={setExtraCostPackagingNet} min={0} />
            </div>
            <div>
              <label className={fieldLabel}>Prowizja marketplace (%)</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={extraCostCommissionPercent === "" ? "" : extraCostCommissionPercent}
                  onChange={(e) => {
                    const s = String(e.target.value).trim().replace(",", ".");
                    if (s === "") setExtraCostCommissionPercent("");
                    else {
                      const n = parseFloat(s);
                      if (Number.isFinite(n)) setExtraCostCommissionPercent(n);
                    }
                  }}
                  className={`${inputClass} pr-10`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-slate-500">
                  %
                </span>
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Inne koszty operacyjne (netto)</label>
              <MoneyInput value={extraCostOtherNet} onValueChange={setExtraCostOtherNet} min={0} />
            </div>
            <div>
              <label className={fieldLabel}>Stawka VAT (%)</label>
              <input
                type="text"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                placeholder="np. 23"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={fieldLabel}>Notatka promocyjna / cenowa</label>
              <textarea
                value={promotion}
                onChange={(e) => setPromotion(e.target.value)}
                rows={4}
                className={`${inputClass} resize-y`}
                placeholder="Krótki opis promocji, rabatów lub warunków…"
              />
            </div>
          </div>
        </ProductLikeSection>
      </div>

      <aside className={productLikeAsideColClass}>
        <ProductLikeSection title="Dostawcy i ceny zakupu" compact>
          {cheapestSupplierInsight ? (
            <div className="mb-5 flex items-center rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-3">
              <p className="text-[13px] text-emerald-900">
                <span className="font-bold">Najtańszy dostawca:</span>{" "}
                {(cheapestSupplierInsight.supplier_name || "").trim() || `#${cheapestSupplierInsight.supplier_id}`} —{" "}
                {formatMoneyZl(cheapestSupplierInsight.purchase_price)} netto
              </p>
            </div>
          ) : null}

          {isNew ? (
            <p className="text-sm text-slate-600">Najpierw zapisz produkt, aby móc powiązać go z dostawcami.</p>
          ) : (
            <div className="space-y-5">
              <DataTable
                density="compact"
                columns={supplierColumns}
                rows={supplierLinkRows}
                getRowKey={(row) => row.id}
                loading={supplierLinksBusy}
                emptyMessage="Brak przypisanych dostawców."
                className="mb-1"
              />

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-xs font-medium text-slate-700">Dodaj nowego dostawcę</label>
                <div className="flex gap-2">
                  <select
                    className={`${inputClass} flex-1`}
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
                  </select>
                  <PrimaryButton
                    type="button"
                    disabled={supplierLinksBusy || !addSupplierPick}
                    onClick={() => onAddSupplierLink()}
                  >
                    Dodaj
                  </PrimaryButton>
                </div>
              </div>
            </div>
          )}
        </ProductLikeSection>

        <ProductLikeSection title="Ostatni zakup (z PZ)" compact>
          <dl className="divide-y divide-slate-100 text-[13px]">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Aktualna cena zakupu</dt>
              <dd className="whitespace-nowrap font-semibold text-slate-900">
                {formatMoneyZl(purchasePrice === "" ? null : purchasePrice)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Poprzednia cena</dt>
              <dd className="font-medium text-slate-400">
                {formatMoneyZl(previousPurchasePrice === "" ? null : previousPurchasePrice)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Data ostatniego zakupu</dt>
              <dd className="font-medium text-slate-400">{formatDateTimePl(lastPurchaseDate)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Ostatni dostawca</dt>
              <dd className="font-medium text-slate-400">{(lastSupplierName || "").trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Waluta ostatniego zakupu</dt>
              <dd className="font-medium text-slate-400">{(lastPurchaseCurrency || "").trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Cena oryginalna (waluta)</dt>
              <dd className="font-medium text-slate-400">
                {purchasePriceOriginal === "" || purchasePriceOriginal == null
                  ? "—"
                  : `${Number(purchasePriceOriginal).toFixed(4)} ${(purchaseCurrency || "").trim() || ""}`.trim()}
              </dd>
            </div>
          </dl>
        </ProductLikeSection>

        <div className="xl:sticky xl:top-24">
          <ProductLikeSection title="Podsumowanie kosztów" compact>
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
                <span className="font-medium text-rose-500">
                  +{formatMoneyZl(extraCostPackagingNet === "" ? 0 : Number(extraCostPackagingNet))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Prowizja</span>
                <span className="font-medium text-rose-500">
                  +{(extraCostCommissionPercent === "" ? 0 : Number(extraCostCommissionPercent)).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Inne koszty</span>
                <span className="font-medium text-rose-500">
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

            <div className="-mx-5 -mb-5 grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50 px-5 pb-5 pt-4 sm:grid-cols-2">
              <MetricCard
                label="Zysk (Marża PLN)"
                value={formatMoneyZlDisplay(pricingDisplay.marginValue, "—").replace(/\s*zł$/, "").trim() || "—"}
                unit={pricingDisplay.marginValue != null ? "zł" : undefined}
                density="compact"
                className="!shadow-none ring-0"
              />
              <div className="flex flex-col justify-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Rentowność (Marża %)</span>
                <StatusBadge tone={marginTone} density="comfortable">
                  {pricingDisplay.marginLabel}
                </StatusBadge>
              </div>
            </div>
          </ProductLikeSection>
        </div>
      </aside>
    </div>
  );
}
