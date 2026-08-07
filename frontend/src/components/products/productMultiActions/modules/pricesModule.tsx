import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export type PricesConfig = {
  applySale: boolean;
  applyPurchase: boolean;
  mode: "set" | "percent";
  saleAmount: string;
  purchaseAmount: string;
  salePercent: string;
  purchasePercent: string;
};

function PricesCard({ config, onChange, disabled }: ModuleCardProps<PricesConfig>) {
  return (
    <div className="space-y-0.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Tryb</p>
      <PmaFieldRow
        label="Ustaw kwotę"
        radioName="pma-prices-mode"
        radioValue="set"
        radioChecked={config.mode === "set"}
        onRadioSelect={() => onChange({ ...config, mode: "set" })}
        disabled={disabled}
      />
      <PmaFieldRow
        label="Zmień o %"
        radioName="pma-prices-mode"
        radioValue="percent"
        radioChecked={config.mode === "percent"}
        onRadioSelect={() => onChange({ ...config, mode: "percent" })}
        disabled={disabled}
      />

      <PmaFieldRow
        label="Cena sprzedaży (netto)"
        checked={config.applySale}
        onCheckedChange={(applySale) => onChange({ ...config, applySale })}
        disabled={disabled}
        control={
          config.applySale ? (
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              placeholder={config.mode === "set" ? "Kwota" : "%"}
              value={config.mode === "set" ? config.saleAmount : config.salePercent}
              onChange={(e) =>
                onChange(
                  config.mode === "set"
                    ? { ...config, saleAmount: e.target.value }
                    : { ...config, salePercent: e.target.value },
                )
              }
            />
          ) : undefined
        }
      />

      <PmaFieldRow
        label="Cena zakupu (netto)"
        checked={config.applyPurchase}
        onCheckedChange={(applyPurchase) => onChange({ ...config, applyPurchase })}
        disabled={disabled}
        control={
          config.applyPurchase ? (
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              placeholder={config.mode === "set" ? "Kwota" : "%"}
              value={config.mode === "set" ? config.purchaseAmount : config.purchasePercent}
              onChange={(e) =>
                onChange(
                  config.mode === "set"
                    ? { ...config, purchaseAmount: e.target.value }
                    : { ...config, purchasePercent: e.target.value },
                )
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}

export const pricesModule: ProductMultiModuleDef<PricesConfig> = {
  id: "prices",
  label: "Ceny",
  group: "Ceny",
  stage: 1,
  defaultConfig: () => ({
    applySale: true,
    applyPurchase: false,
    mode: "set",
    saleAmount: "",
    purchaseAmount: "",
    salePercent: "",
    purchasePercent: "",
  }),
  validate: (cfg) => {
    if (!cfg.applySale && !cfg.applyPurchase) return "Zaznacz co najmniej jedną cenę.";
    if (cfg.mode === "set") {
      if (cfg.applySale && parseDecimal(cfg.saleAmount) == null) return "Podaj cenę sprzedaży.";
      if (cfg.applyPurchase && parseDecimal(cfg.purchaseAmount) == null) return "Podaj cenę zakupu.";
    } else {
      if (cfg.applySale && parseDecimal(cfg.salePercent) == null) return "Podaj % dla sprzedaży.";
      if (cfg.applyPurchase && parseDecimal(cfg.purchasePercent) == null) return "Podaj % dla zakupu.";
    }
    return null;
  },
  Card: PricesCard,
  toOps: (cfg) => {
    const ops: { action: string; value: unknown }[] = [];
    if (cfg.mode === "set") {
      if (cfg.applySale) {
        ops.push({ action: "set_price", value: { field: "sale_price", amount: parseDecimal(cfg.saleAmount) } });
      }
      if (cfg.applyPurchase) {
        ops.push({
          action: "set_price",
          value: { field: "purchase_price", amount: parseDecimal(cfg.purchaseAmount) },
        });
      }
    } else {
      if (cfg.applySale) {
        ops.push({
          action: "increase_price_percent",
          value: { field: "sale_price", percent: parseDecimal(cfg.salePercent) },
        });
      }
      if (cfg.applyPurchase) {
        ops.push({
          action: "increase_price_percent",
          value: { field: "purchase_price", percent: parseDecimal(cfg.purchasePercent) },
        });
      }
    }
    return ops;
  },
};
