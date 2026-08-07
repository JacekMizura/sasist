import type { ModuleCardProps, ProductBulkOp, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { pmaCheckRow, pmaInp, pmaLab } from "../uiTokens";

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
    <div className="space-y-3">
      <fieldset>
        <legend className={pmaLab}>Tryb</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={config.mode === "set"}
              disabled={disabled}
              onChange={() => onChange({ ...config, mode: "set" })}
            />
            Ustaw kwotÄ™
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={config.mode === "percent"}
              disabled={disabled}
              onChange={() => onChange({ ...config, mode: "percent" })}
            />
            ZmieĹ„ o %
          </label>
        </div>
      </fieldset>

      <label className={pmaCheckRow}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300"
          checked={config.applySale}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, applySale: e.target.checked })}
        />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Cena sprzedaĹĽy (netto)</span>
          {config.applySale ? (
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              placeholder={config.mode === "set" ? "Kwota" : "Procent (np. 10)"}
              value={config.mode === "set" ? config.saleAmount : config.salePercent}
              onChange={(e) =>
                onChange(
                  config.mode === "set"
                    ? { ...config, saleAmount: e.target.value }
                    : { ...config, salePercent: e.target.value },
                )
              }
            />
          ) : null}
        </span>
      </label>

      <label className={pmaCheckRow}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300"
          checked={config.applyPurchase}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, applyPurchase: e.target.checked })}
        />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Cena zakupu (netto)</span>
          {config.applyPurchase ? (
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              placeholder={config.mode === "set" ? "Kwota" : "Procent (np. 10)"}
              value={config.mode === "set" ? config.purchaseAmount : config.purchasePercent}
              onChange={(e) =>
                onChange(
                  config.mode === "set"
                    ? { ...config, purchaseAmount: e.target.value }
                    : { ...config, purchasePercent: e.target.value },
                )
              }
            />
          ) : null}
        </span>
      </label>
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
    if (!cfg.applySale && !cfg.applyPurchase) return "Zaznacz co najmniej jednÄ… cenÄ™.";
    if (cfg.mode === "set") {
      if (cfg.applySale && parseDecimal(cfg.saleAmount) == null) return "Podaj cenÄ™ sprzedaĹĽy.";
      if (cfg.applyPurchase && parseDecimal(cfg.purchaseAmount) == null) return "Podaj cenÄ™ zakupu.";
    } else {
      if (cfg.applySale && parseDecimal(cfg.salePercent) == null) return "Podaj % dla sprzedaĹĽy.";
      if (cfg.applyPurchase && parseDecimal(cfg.purchasePercent) == null) return "Podaj % dla zakupu.";
    }
    return null;
  },
  Card: PricesCard,
  toOps: (cfg) => {
    const ops: ProductBulkOp[] = [];
    if (cfg.mode === "set") {
      if (cfg.applySale) {
        ops.push({
          action: "set_price",
          value: { field: "sale_price", amount: parseDecimal(cfg.saleAmount) },
        });
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

