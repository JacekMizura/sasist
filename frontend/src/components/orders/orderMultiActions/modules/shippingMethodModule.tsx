import { Truck } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { pmaInp, pmaLab } from "../uiTokens";

export type ShippingMethodConfig = {
  shippingMethodId: string;
};

function ShippingMethodCard({ config, onChange, cardContext, disabled }: OrderModuleCardProps<ShippingMethodConfig>) {
  return (
    <label className={pmaLab}>
      Metoda dostawy
      <select
        className={pmaInp}
        disabled={disabled}
        value={config.shippingMethodId}
        onChange={(e) => onChange({ shippingMethodId: e.target.value })}
      >
        <option value="">— wybierz —</option>
        {cardContext.shippingMethods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export const shippingMethodModule: OrderMultiModuleDef<ShippingMethodConfig> = {
  id: "shipping_method",
  label: "Metoda wysyłki",
  group: "Realizacja",
  stage: 1,
  icon: Truck,
  defaultConfig: () => ({ shippingMethodId: "" }),
  validate: (cfg) => ((cfg.shippingMethodId ?? "").trim() ? null : "Wybierz metodę dostawy."),
  Card: ShippingMethodCard,
  toOps: (cfg) => [
    {
      kind: "change_shipping",
      config: { change_shipping: { shippingMethodId: cfg.shippingMethodId } },
    },
  ],
};
