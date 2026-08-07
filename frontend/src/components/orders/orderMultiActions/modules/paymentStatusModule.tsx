import { CreditCard } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { pmaInp, pmaLab } from "../uiTokens";

export type PaymentStatusConfig = {
  paymentStatus: string;
};

function PaymentStatusCard({ config, onChange, disabled }: OrderModuleCardProps<PaymentStatusConfig>) {
  return (
    <label className={pmaLab}>
      Status płatności (meta panelu)
      <select
        className={pmaInp}
        disabled={disabled}
        value={config.paymentStatus}
        onChange={(e) => onChange({ paymentStatus: e.target.value })}
      >
        <option value="">— wyczyść / nie ustawiaj —</option>
        <option value="oczekuje">oczekuje</option>
        <option value="zaksięgowana">zaksięgowana</option>
        <option value="opłacone">opłacone</option>
        <option value="nieopłacone">nieopłacone</option>
      </select>
    </label>
  );
}

export const paymentStatusModule: OrderMultiModuleDef<PaymentStatusConfig> = {
  id: "payment_status",
  label: "Status płatności",
  group: "Statusy",
  stage: 1,
  icon: CreditCard,
  defaultConfig: () => ({ paymentStatus: "" }),
  validate: () => null,
  Card: PaymentStatusCard,
  toOps: (cfg) => [
    {
      kind: "payment_status",
      config: {
        payment_status: {
          paymentStatus: cfg.paymentStatus.trim() === "" ? null : cfg.paymentStatus.trim(),
        },
      },
    },
  ],
};
