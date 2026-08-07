import { PatchFieldsEditor } from "../PatchFieldsEditor";
import {
  buildPatchSet,
  emptyPatchState,
  type PatchFieldDef,
  type PatchFieldState,
} from "../patchFieldUtils";
import type { ModuleCardProps, ProductBulkOp, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";

const FIELDS: PatchFieldDef[] = [
  { key: "min_total_stock", label: "Próg alarmu stanu (min. łączny)", type: "number", min: 0 },
];

export type LogisticsDataConfig = {
  fields: Record<string, PatchFieldState>;
  clearAll: boolean;
};

function LogisticsDataCard({ config, onChange, disabled }: ModuleCardProps<LogisticsDataConfig>) {
  return (
    <div className="space-y-0.5">
      <PmaFieldRow
        label="Wyczyść dane logistyczne"
        hint="Wymiary, waga, karton"
        checked={config.clearAll}
        onCheckedChange={(clearAll) => onChange({ ...config, clearAll })}
        disabled={disabled}
      />
      {!config.clearAll ? (
        <PatchFieldsEditor
          fields={FIELDS}
          state={config.fields}
          disabled={disabled}
          onChange={(fields) => onChange({ ...config, fields })}
        />
      ) : null}
    </div>
  );
}

export const logisticsDataModule: ProductMultiModuleDef<LogisticsDataConfig> = {
  id: "logistics_data",
  label: "Dane logistyczne",
  group: "Logistyka",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(FIELDS), clearAll: false }),
  validate: (cfg) => {
    if (cfg.clearAll) return null;
    const built = buildPatchSet(FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: LogisticsDataCard,
  toOps: (cfg) => {
    if (cfg.clearAll) return [{ action: "clear_logistics_data", value: {} }];
    const built = buildPatchSet(FIELDS, cfg.fields);
    if ("error" in built) return [];
    const { min_total_stock, ...rest } = built.set as Record<string, unknown>;
    const ops: ProductBulkOp[] = [];
    if (min_total_stock != null) {
      ops.push({
        action: "set_min_stock",
        value: { min_total_stock, enable_stock_alert: true },
      });
    }
    if (Object.keys(rest).length > 0) {
      ops.push({ action: "patch_logistics_fields", value: { set: rest } });
    }
    return ops;
  },
};
