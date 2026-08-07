import { useEffect, useMemo, useState } from "react";
import { FormInput } from "lucide-react";

import {
  listOrderCustomFields,
  type OrderCustomFieldDto,
  type OrderCustomFieldValueStorePayload,
} from "../../../../api/orderCustomFieldsApi";
import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { PmaFieldRow, pmaInp } from "../uiTokens";

export type CustomFieldConfig = {
  fieldId: number | "";
  stringValue: string;
  numberValue: string;
  optionId: string;
  multiOptionIds: number[];
};

function CustomFieldCard({ config, onChange, cardContext, disabled }: OrderModuleCardProps<CustomFieldConfig>) {
  const warehouseId = cardContext.warehouseId;
  const [defs, setDefs] = useState<OrderCustomFieldDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) {
      setDefs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listOrderCustomFields({
      tenant_id: cardContext.tenantId,
      warehouse_id: warehouseId,
      active_only: true,
      sort: "sort_order",
    })
      .then((rows) => {
        if (!cancelled) setDefs(rows.filter((d) => d.is_active));
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
  }, [cardContext.tenantId, warehouseId]);

  const selected = useMemo(
    () => (config.fieldId === "" ? null : defs.find((d) => d.id === config.fieldId) ?? null),
    [config.fieldId, defs],
  );

  if (warehouseId == null || warehouseId < 1) {
    return (
      <p className="text-xs text-amber-800">
        Wybierz magazyn realizacji na liście zamówień, aby edytować pola dodatkowe.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {loading ? <p className="text-xs text-slate-500">Ładowanie pól…</p> : null}
      <PmaFieldRow
        label="Pole"
        disabled={disabled}
        control={
          <select
            className={pmaInp}
            disabled={disabled}
            value={config.fieldId === "" ? "" : String(config.fieldId)}
            onChange={(e) =>
              onChange({
                fieldId: e.target.value ? Number(e.target.value) : "",
                stringValue: "",
                numberValue: "",
                optionId: "",
                multiOptionIds: [],
              })
            }
          >
            <option value="">— wybierz —</option>
            {defs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        }
      />
      {selected?.type === "TEXT" ? (
        <PmaFieldRow
          label="Wartość"
          disabled={disabled}
          control={
            <input
              className={pmaInp}
              disabled={disabled}
              value={config.stringValue}
              onChange={(e) => onChange({ ...config, stringValue: e.target.value })}
            />
          }
        />
      ) : null}
      {selected?.type === "NUMBER" ? (
        <PmaFieldRow
          label="Wartość"
          disabled={disabled}
          control={
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              value={config.numberValue}
              onChange={(e) => onChange({ ...config, numberValue: e.target.value })}
            />
          }
        />
      ) : null}
      {selected?.type === "SELECT_SINGLE" ? (
        <PmaFieldRow
          label="Opcja"
          disabled={disabled}
          control={
            <select
              className={pmaInp}
              disabled={disabled}
              value={config.optionId}
              onChange={(e) => onChange({ ...config, optionId: e.target.value })}
            >
              <option value="">— wybierz —</option>
              {(selected.options ?? []).map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        />
      ) : null}
      {selected?.type === "SELECT_MULTI" ? (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {(selected.options ?? []).map((o) => {
            const on = config.multiOptionIds.includes(o.id);
            return (
              <label key={o.id} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => {
                    const next = new Set(config.multiOptionIds);
                    if (on) next.delete(o.id);
                    else next.add(o.id);
                    onChange({ ...config, multiOptionIds: [...next] });
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      ) : null}
      {selected &&
      !["TEXT", "NUMBER", "SELECT_SINGLE", "SELECT_MULTI"].includes(String(selected.type)) ? (
        <p className="text-xs text-amber-800">
          Ten typ pola (pliki / dokumenty) nie jest jeszcze obsługiwany w multiakcjach.
        </p>
      ) : null}
    </div>
  );
}

function buildPayload(field: OrderCustomFieldDto, cfg: CustomFieldConfig): OrderCustomFieldValueStorePayload {
  const id = field.id;
  if (field.type === "TEXT") {
    const s = cfg.stringValue.trim();
    return { field_id: id, string_value: s || null };
  }
  if (field.type === "NUMBER") {
    const raw = cfg.numberValue.trim().replace(",", ".");
    if (!raw) return { field_id: id, number_value: null };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { field_id: id, number_value: null };
    return { field_id: id, number_value: n };
  }
  if (field.type === "SELECT_SINGLE") {
    const raw = cfg.optionId.trim();
    if (!raw) return { field_id: id, json_value: null };
    return { field_id: id, json_value: Number(raw) };
  }
  if (field.type === "SELECT_MULTI") {
    const arr = cfg.multiOptionIds.filter((x) => Number.isFinite(x));
    return { field_id: id, json_value: arr.length ? arr : null };
  }
  return { field_id: id };
}

export const customFieldModule: OrderMultiModuleDef<CustomFieldConfig> = {
  id: "custom_field",
  label: "Pole dodatkowe",
  group: "Inne",
  stage: 1,
  icon: FormInput,
  defaultConfig: () => ({
    fieldId: "",
    stringValue: "",
    numberValue: "",
    optionId: "",
    multiOptionIds: [],
  }),
  validate: (cfg) => {
    if (cfg.fieldId === "") return "Wybierz pole dodatkowe.";
    return null;
  },
  Card: CustomFieldCard,
  toOps: (cfg) => {
    if (cfg.fieldId === "") throw new Error("Nie wybrano pola.");
    return [
      {
        customField: {
          fieldId: Number(cfg.fieldId),
          stringValue: cfg.stringValue,
          numberValue: cfg.numberValue,
          optionId: cfg.optionId,
          multiOptionIds: cfg.multiOptionIds,
        },
      },
    ];
  },
};

/** Resolve store payload after defs are loaded at execute time. */
export function customFieldConfigToPayload(
  field: OrderCustomFieldDto,
  cfg: CustomFieldConfig,
): OrderCustomFieldValueStorePayload {
  return buildPayload(field, cfg);
}
