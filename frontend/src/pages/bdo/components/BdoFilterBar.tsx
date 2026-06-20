import { memo, type ReactNode } from "react";

import { PurchasingFilterBar, PurchasingFilterField } from "../../../modules/purchasing/ui";
import { purchasingSelectClass } from "../../../modules/purchasing/ui/purchasingFormStyles";
import type { BdoTenant } from "../hooks/useBdoTenant";

type Props = {
  tenants: BdoTenant[];
  tenantId: number;
  onTenantChange: (id: number) => void;
  children?: ReactNode;
  actions?: ReactNode;
};

function BdoFilterBarInner({ tenants, tenantId, onTenantChange, children, actions }: Props) {
  return (
    <PurchasingFilterBar actions={actions}>
      <PurchasingFilterField label="Podmiot">
        <select
          value={tenantId}
          onChange={(e) => onTenantChange(Number(e.target.value))}
          className={purchasingSelectClass}
          aria-label="Podmiot"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </PurchasingFilterField>
      {children}
    </PurchasingFilterBar>
  );
}

export const BdoFilterBar = memo(BdoFilterBarInner);
