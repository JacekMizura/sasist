import { useEffect, useState } from "react";

import { listProductFamilies, type ProductFamilyListItem } from "../../../../api/productFamiliesApi";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export type ProductFamilyConfig = {
  productFamilyId: number | null;
  clear: boolean;
};

function ProductFamilyCard({ config, onChange, cardContext, disabled }: ModuleCardProps<ProductFamilyConfig>) {
  const { tenantId } = cardContext;
  const [rows, setRows] = useState<ProductFamilyListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listProductFamilies(tenantId, { includeInactive: false })
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

  const selectValue = config.clear ? "__clear__" : config.productFamilyId != null ? String(config.productFamilyId) : "";

  return (
    <PmaFieldRow
      label="Rodzina produktów"
      disabled={disabled}
      control={
        <select
          className={pmaInp}
          disabled={disabled || loading}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__clear__") onChange({ productFamilyId: null, clear: true });
            else if (v === "") onChange({ productFamilyId: null, clear: false });
            else onChange({ productFamilyId: Number(v), clear: false });
          }}
        >
          <option value="">{loading ? "Ładowanie…" : "— wybierz —"}</option>
          <option value="__clear__">Odłącz od rodziny</option>
          {rows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      }
    />
  );
}

export const productFamilyModule: ProductMultiModuleDef<ProductFamilyConfig> = {
  id: "product_family",
  label: "Rodzina produktów",
  group: "Asortyment",
  stage: 1,
  defaultConfig: () => ({ productFamilyId: null, clear: false }),
  validate: (cfg) => {
    if (!cfg.clear && (cfg.productFamilyId == null || cfg.productFamilyId < 1)) {
      return "Wybierz rodzinę lub odłącz.";
    }
    return null;
  },
  Card: ProductFamilyCard,
  toOps: (cfg) => [
    {
      action: "set_product_family",
      value: { product_family_id: cfg.clear ? null : cfg.productFamilyId },
    },
  ],
};
