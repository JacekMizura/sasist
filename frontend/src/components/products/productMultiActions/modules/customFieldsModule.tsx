import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  listProductCustomFields,
  type ProductCustomFieldDto,
} from "../../../../api/productCustomFieldsApi";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { pmaInp, pmaLab } from "../uiTokens";

export type CustomFieldRow = {
  fieldId: number | "";
  stringValue: string;
  numberValue: string;
  optionId: string;
};

export type CustomFieldsConfig = {
  rows: CustomFieldRow[];
};

function emptyRow(): CustomFieldRow {
  return { fieldId: "", stringValue: "", numberValue: "", optionId: "" };
}

function CustomFieldsCard({ config, onChange, tenantId, disabled }: ModuleCardProps<CustomFieldsConfig>) {
  const [defs, setDefs] = useState<ProductCustomFieldDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listProductCustomFields(tenantId, { includeInactive: false })
      .then((list) => {
        if (!cancelled) setDefs(list.filter((f) => f.is_active));
      })
      .catch(() => {
        if (!cancelled) setDefs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const updateRow = (idx: number, patch: Partial<CustomFieldRow>) => {
    onChange({
      rows: config.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  };

  return (
    <div className="space-y-3">
      {loading ? <p className="text-xs text-slate-500">Ĺadowanie pĂłlâ€¦</p> : null}
      {config.rows.map((row, idx) => {
        const def = defs.find((d) => d.id === row.fieldId);
        return (
          <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex items-start gap-2">
              <label className={`${pmaLab} min-w-0 flex-1`}>
                Pole
                <select
                  className={pmaInp}
                  disabled={disabled}
                  value={row.fieldId === "" ? "" : String(row.fieldId)}
                  onChange={(e) =>
                    updateRow(idx, {
                      fieldId: e.target.value ? Number(e.target.value) : "",
                      stringValue: "",
                      numberValue: "",
                      optionId: "",
                    })
                  }
                >
                  <option value="">â€” wybierz â€”</option>
                  {defs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mt-5 rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                disabled={disabled || config.rows.length <= 1}
                onClick={() =>
                  onChange({ rows: config.rows.filter((_, i) => i !== idx) })
                }
                aria-label="UsuĹ„ wiersz"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {def?.type === "NUMBER" ? (
              <label className={`${pmaLab} mt-2`}>
                WartoĹ›Ä‡
                <input
                  className={pmaInp}
                  disabled={disabled}
                  inputMode="decimal"
                  value={row.numberValue}
                  onChange={(e) => updateRow(idx, { numberValue: e.target.value })}
                />
              </label>
            ) : null}
            {def?.type === "TEXT" ? (
              <label className={`${pmaLab} mt-2`}>
                WartoĹ›Ä‡
                <input
                  className={pmaInp}
                  disabled={disabled}
                  value={row.stringValue}
                  onChange={(e) => updateRow(idx, { stringValue: e.target.value })}
                />
              </label>
            ) : null}
            {def?.type === "SELECT_SINGLE" || def?.type === "SELECT_MULTI" ? (
              <label className={`${pmaLab} mt-2`}>
                Opcja
                <select
                  className={pmaInp}
                  disabled={disabled}
                  value={row.optionId}
                  onChange={(e) => updateRow(idx, { optionId: e.target.value })}
                >
                  <option value="">â€” wybierz â€”</option>
                  {(def.options ?? []).map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {def && !["TEXT", "NUMBER", "SELECT_SINGLE", "SELECT_MULTI"].includes(String(def.type)) ? (
              <p className="mt-2 text-xs text-amber-800">
                Ten typ pola nie jest jeszcze obsĹ‚ugiwany w multiakcjach (uĹĽyj karty produktu).
              </p>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 disabled:opacity-40"
        onClick={() => onChange({ rows: [...config.rows, emptyRow()] })}
      >
        <Plus className="h-4 w-4" />
        Dodaj pole
      </button>
    </div>
  );
}

export const customFieldsModule: ProductMultiModuleDef<CustomFieldsConfig> = {
  id: "custom_fields",
  label: "Pola dodatkowe",
  group: "Asortyment",
  stage: 1,
  defaultConfig: () => ({ rows: [emptyRow()] }),
  validate: (cfg) => {
    const usable = cfg.rows.filter((r) => r.fieldId !== "");
    if (usable.length === 0) return "Dodaj co najmniej jedno pole.";
    return null;
  },
  Card: CustomFieldsCard,
  toOps: (cfg) => {
    const values = cfg.rows
      .filter((r) => r.fieldId !== "")
      .map((r) => {
        const field_id = Number(r.fieldId);
        if (r.numberValue.trim()) {
          return { field_id, number_value: parseDecimal(r.numberValue), string_value: null, json_value: null };
        }
        if (r.optionId) {
          const oid = Number(r.optionId);
          return {
            field_id,
            string_value: String(oid),
            number_value: null,
            json_value: oid,
          };
        }
        return {
          field_id,
          string_value: r.stringValue,
          number_value: null,
          json_value: null,
        };
      });
    return [{ action: "set_custom_field_values", value: { values } }];
  },
};

