import { useParams } from "react-router-dom";

import { CustomerNotesSection } from "../../components/customers/CustomerNotesSection";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailPageShell } from "./CustomerDetailPageShell";

export default function CustomerNotesPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const customerId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const tenantId = DAMAGE_TENANT_ID;

  if (customerId == null) {
    return (
      <CustomerDetailPageShell customerId={null} title="Klient" sectionLabel="Notatki">
        <p className="text-sm text-red-700">Nieprawidłowy identyfikator klienta.</p>
      </CustomerDetailPageShell>
    );
  }

  return (
    <CustomerDetailPageShell
      customerId={customerId}
      title={getCustomerDisplayName({ id: customerId })}
      sectionLabel="Notatki"
      showTabs
    >
      <CustomerNotesSection customerId={customerId} tenantId={tenantId} />
    </CustomerDetailPageShell>
  );
}
