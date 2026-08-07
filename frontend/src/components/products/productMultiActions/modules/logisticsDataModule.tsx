import { PatchFieldsEditor } from "../PatchFieldsEditor";
import type { ModuleCardProps, ProductBulkOp, ProductMultiModuleDef } from "../types";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import { pmaCheckRow } from "../uiTokens";

/** Remaining logistics knobs not covered by dedicated dimension/weight/carton cards. */
const FIELDS: PatchFieldDef[] = [
  { key: "min_total_stock", label: "PrĂłg alarmu stanu (min. Ĺ‚Ä…czny)", type: "number", min: 0 },
];

export type LogisticsDataConfig = {
  fields: Record<string, PatchFieldState>;
  clearAll: boolean;
};

function LogisticsDataCard({ config, onChange, disabled }: ModuleCardProps<LogisticsDataConfig>) {
  return (
    <div className="space-y-3">
      <label className={pmaCheckRow}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300"
          checked={config.clearAll}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, clearAll: e.target.checked })}
        />
        <span>WyczyĹ›Ä‡ dane logistyczne (wymiary, waga, karton)</span>
      </label>
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
    // min_total_stock is not in logistics patch â€” use set_min_stock
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

