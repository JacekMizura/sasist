import { useEffect, useState } from "react";

import { listManufacturers, type ManufacturerRead } from "../../../../api/manufacturersApi";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export type ManufacturerConfig = {
  manufacturerId: number | null;
  clear: boolean;
};

function ManufacturerCard({ config, onChange, tenantId, disabled }: ModuleCardProps<ManufacturerConfig>) {
  const [rows, setRows] = useState<ManufacturerRead[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listManufacturers({ tenantId, status: "all" })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const selectValue = config.clear ? "__clear__" : config.manufacturerId != null ? String(config.manufacturerId) : "";

  return (
    <PmaFieldRow
      label="Producent"
      disabled={disabled}
      control={
        <select
          className={pmaInp}
          disabled={disabled || loading}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__clear__") onChange({ manufacturerId: null, clear: true });
            else if (v === "") onChange({ manufacturerId: null, clear: false });
            else onChange({ manufacturerId: Number(v), clear: false });
          }}
        >
          <option value="">{loading ? "Ładowanie…" : "— wybierz —"}</option>
          <option value="__clear__">Wyczyść producenta</option>
          {rows.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      }
    />
  );
}

export const manufacturerModule: ProductMultiModuleDef<ManufacturerConfig> = {
  id: "manufacturer",
  label: "Producent",
  group: "Podstawowe",
  stage: 1,
  defaultConfig: () => ({ manufacturerId: null, clear: false }),
  validate: (cfg) => {
    if (!cfg.clear && (cfg.manufacturerId == null || cfg.manufacturerId < 1)) {
      return "Wybierz producenta lub wyczyść.";
    }
    return null;
  },
  Card: ManufacturerCard,
  toOps: (cfg) => [{ action: "set_manufacturer", value: cfg.clear ? null : cfg.manufacturerId }],
};
