import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export type ProductStatusConfig = {
  status: "active" | "inactive" | "";
};

function ProductStatusCard({ config, onChange, disabled }: ModuleCardProps<ProductStatusConfig>) {
  return (
    <PmaFieldRow
      label="Status produktu"
      disabled={disabled}
      control={
        <select
          className={pmaInp}
          disabled={disabled}
          value={config.status}
          onChange={(e) => onChange({ status: e.target.value as ProductStatusConfig["status"] })}
        >
          <option value="">— wybierz —</option>
          <option value="active">Aktywny</option>
          <option value="inactive">Nieaktywny</option>
        </select>
      }
    />
  );
}

export const productStatusModule: ProductMultiModuleDef<ProductStatusConfig> = {
  id: "product_status",
  label: "Status produktu",
  group: "Podstawowe",
  stage: 1,
  defaultConfig: () => ({ status: "" }),
  validate: (cfg) => (cfg.status ? null : "Wybierz status."),
  Card: ProductStatusCard,
  toOps: (cfg) => [{ action: "set_product_status", value: { status: cfg.status } }],
};
