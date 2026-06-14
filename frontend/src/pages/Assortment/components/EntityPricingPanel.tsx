import { AlertTriangle } from "lucide-react";

import { productLikeFieldLabelClass, productLikeInputClass } from "../../../components/catalog";
import type { BundleFulfillmentMode } from "../../Production/bundleOperationalTypes";
import type { BundleComponentRow, ProductSummary } from "../bundleEditTypes";
import {
  buildPricingAlerts,
  entityMarginToneClass,
  formatMoneyZlDisplay,
  formatPriceHistoryDate,
  resolveBundlePricingDisplay,
  salePriceFromInput,
  salePriceInputValue,
  type PriceEntryMode,
  type PriceHistoryEntry,
} from "../../../utils/entityPricing";

export type EntityPricingPanelProps = {
  entityType: "bundle";
  fulfillmentMode: BundleFulfillmentMode;
  salePrice: number | "";
  onSalePriceChange: (v: number | "") => void;
  salePriceEntryMode: PriceEntryMode;
  onSalePriceEntryModeChange: (mode: PriceEntryMode) => void;
  vatRate: string;
  onVatRateChange: (v: string) => void;
  packagingCostNet: number | "";
  onPackagingCostChange: (v: number | "") => void;
  productionCostNet: number | "";
  onProductionCostChange: (v: number | "") => void;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
  priceHistory: PriceHistoryEntry[];
  minMarginPercent?: number;
};

const fieldLabel = productLikeFieldLabelClass;
const inputClass = productLikeInputClass;

function parseNumericInput(raw: string): number | "" {
  const s = raw.trim().replace(",", ".");
  if (s === "") return "";
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : "";
}

export function EntityPricingPanel(props: EntityPricingPanelProps) {
  const purchaseByProductId: Record<number, number | null> = {};
  for (const [pid, summary] of Object.entries(props.productCache)) {
    purchaseByProductId[Number(pid)] = summary.purchasePrice ?? null;
  }

  const pricing = resolveBundlePricingDisplay({
    rows: props.rows,
    purchaseByProductId,
    salePrice: props.salePrice,
    salePriceEntryMode: props.salePriceEntryMode,
    vatRate: props.vatRate,
    packagingCostNet: props.packagingCostNet,
    productionCostNet: props.productionCostNet,
    fulfillmentMode: props.fulfillmentMode,
  });

  const alerts = buildPricingAlerts({
    saleNet: pricing.saleNet,
    totalCost: pricing.totalCost,
    marginPercent: pricing.marginPercent,
    minMarginPercent: props.minMarginPercent,
  });

  const displaySaleValue = salePriceInputValue(props.salePrice, props.salePriceEntryMode, pricing.vatRate);

  return (
    <div className="flex flex-col xl:flex-row items-start gap-10 lg:gap-16">
      <div className="w-full xl:max-w-2xl space-y-12 shrink-0">
        <section>
          <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Kalkulacja cenowa</h3>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => props.onSalePriceEntryModeChange("net")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  props.salePriceEntryMode === "net"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Cena netto
              </button>
              <button
                type="button"
                onClick={() => props.onSalePriceEntryModeChange("gross")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  props.salePriceEntryMode === "gross"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Cena brutto
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={fieldLabel}>
                  {props.salePriceEntryMode === "gross" ? "Cena sprzedaży brutto" : "Cena sprzedaży netto"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={displaySaleValue === "" ? "" : displaySaleValue}
                  onChange={(e) => {
                    const parsed = parseNumericInput(e.target.value);
                    props.onSalePriceChange(salePriceFromInput(parsed, props.salePriceEntryMode, pricing.vatRate));
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={fieldLabel}>Koszty pakowania (netto)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={props.packagingCostNet === "" ? "" : props.packagingCostNet}
                  onChange={(e) => props.onPackagingCostChange(parseNumericInput(e.target.value))}
                  className={inputClass}
                />
              </div>
              {props.fulfillmentMode === "manufacturing" ? (
                <div>
                  <label className={fieldLabel}>Koszt produkcji (netto)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={props.productionCostNet === "" ? "" : props.productionCostNet}
                    onChange={(e) => props.onProductionCostChange(parseNumericInput(e.target.value))}
                    className={inputClass}
                  />
                </div>
              ) : null}
              <div>
                <label className={fieldLabel}>Stawka VAT (%)</label>
                <input
                  type="text"
                  value={props.vatRate}
                  onChange={(e) => props.onVatRateChange(e.target.value)}
                  placeholder="np. 23"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Koszt materiałów jest wyliczany automatycznie ze składników (ilość × koszt zakupu). Zmiany składników
              przeliczają kalkulację od razu — bez zapisu.
            </p>
          </div>
        </section>

        {pricing.componentLines.length > 0 ? (
          <section>
            <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Koszt składników</h3>
            <div className="overflow-hidden rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Produkt</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-20">Ilość</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-28">Koszt szt.</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-28">Razem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricing.componentLines.map((line) => {
                    const summary = props.productCache[line.productId];
                    const lineTotal =
                      line.purchasePrice != null
                        ? Math.round(line.quantity * line.purchasePrice * 100) / 100
                        : null;
                    return (
                      <tr key={line.productId}>
                        <td className="px-4 py-3 text-slate-800">
                          {(summary?.name ?? `Produkt #${line.productId}`).trim()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoneyZlDisplay(line.purchasePrice)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatMoneyZlDisplay(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pricing.missingComponentCosts > 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                {pricing.missingComponentCosts} składnik(ów) bez kosztu zakupu — suma materiałów może być niepełna.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside className="w-full xl:max-w-[850px] flex-1 space-y-8">
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((a) => (
              <div
                key={a.message}
                className={`flex items-start gap-2 rounded border-l-4 px-4 py-3 text-sm ${
                  a.tone === "error"
                    ? "border-rose-500 bg-rose-50 text-rose-900"
                    : "border-amber-500 bg-amber-50 text-amber-900"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="font-medium">{a.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        <section>
          <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Koszt rzeczywisty</h3>
          <dl className="space-y-3 text-sm text-slate-700 mt-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Koszt materiałów</dt>
              <dd className="tabular-nums">{formatMoneyZlDisplay(pricing.materialsCost)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Koszt pakowania</dt>
              <dd className="tabular-nums">{formatMoneyZlDisplay(pricing.packagingCost)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Koszt produkcji</dt>
              <dd className="tabular-nums">{formatMoneyZlDisplay(pricing.productionCost)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mt-1">
              <dt className="font-semibold text-slate-900">Łączny koszt</dt>
              <dd className="tabular-nums font-bold text-slate-900">{formatMoneyZlDisplay(pricing.totalCost)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Cena sprzedaży i marża</h3>
          <dl className="space-y-3 text-sm text-slate-700 mt-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Stawka VAT</dt>
              <dd className="tabular-nums">{pricing.vatLabel}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Cena sprzedaży netto</dt>
              <dd className="tabular-nums">{formatMoneyZlDisplay(pricing.saleNet)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Cena sprzedaży brutto</dt>
              <dd className="tabular-nums font-semibold text-slate-900">
                {formatMoneyZlDisplay(pricing.saleGross)}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-1">
              <dt className="font-medium text-slate-900">Marża kwotowa</dt>
              <dd className={`tabular-nums font-semibold ${entityMarginToneClass(pricing.marginPercent)}`}>
                {formatMoneyZlDisplay(pricing.marginValue)}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-1">
              <dt className="font-medium text-slate-900">Marża %</dt>
              <dd className={`tabular-nums text-lg font-bold ${entityMarginToneClass(pricing.marginPercent)}`}>
                {pricing.marginLabel}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Historia cen</h3>
          {props.priceHistory.length === 0 ? (
            <p className="text-sm text-slate-500 mt-4">Brak zapisanej historii — wpisy powstają przy zmianie ceny sprzedaży.</p>
          ) : (
            <div className="overflow-hidden rounded border border-slate-200 mt-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Data</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Netto</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Brutto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...props.priceHistory].reverse().map((h, i) => (
                    <tr key={`${h.at}-${i}`}>
                      <td className="px-4 py-3 text-slate-700">{formatPriceHistoryDate(h.at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoneyZlDisplay(h.sale_net)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoneyZlDisplay(h.sale_gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
